import { closeSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, dialog } from 'electron';
import { DeckWindow } from './deck-window';
import { registerLocalRendererProtocol, registerLocalRendererScheme } from './local-renderer';
import { DEFAULT_ZOOM_FACTOR } from './store';

const APP_USER_MODEL_ID = 'jp.yu-ta.vanilladeck';
const INSTANCE_LOCK_PATH = path.join(os.tmpdir(), 'vanilla-deck.lock');

let instanceLockFd: number | null = null;

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireInstanceLock(): boolean {
  // Stop duplicate launches before Electron finishes booting.
  try {
    instanceLockFd = openSync(INSTANCE_LOCK_PATH, 'wx');
    writeFileSync(instanceLockFd, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }

    try {
      const lock = JSON.parse(readFileSync(INSTANCE_LOCK_PATH, 'utf8')) as { pid?: number } | null;
      if (lock?.pid && !isProcessAlive(lock.pid)) {
        rmSync(INSTANCE_LOCK_PATH, { force: true });
        return acquireInstanceLock();
      }
    } catch {
      // If we cannot inspect the lock file, fail closed.
    }

    return false;
  }
}

function releaseInstanceLock(): void {
  if (instanceLockFd !== null) {
    try {
      closeSync(instanceLockFd);
    } finally {
      instanceLockFd = null;
    }
  }
  try {
    rmSync(INSTANCE_LOCK_PATH, { force: true });
  } catch {
    // Best effort cleanup.
  }
}

process.on('exit', releaseInstanceLock);
process.on('SIGINT', () => {
  releaseInstanceLock();
  process.exit(130);
});
process.on('SIGTERM', () => {
  releaseInstanceLock();
  process.exit(143);
});

if (!acquireInstanceLock()) {
  void app.whenReady().then(() => {
    dialog.showMessageBoxSync({
      type: 'info',
      buttons: ['OK'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: 'vanilla-deck is already running',
      message: 'vanilla-deck is already open.',
      detail: 'Please use the existing window instead of starting another copy.',
    });
    app.exit(1);
  });
} else {
  const deckWindow = new DeckWindow(DEFAULT_ZOOM_FACTOR);

  async function start(): Promise<void> {
    registerLocalRendererProtocol();
    deckWindow.registerIpcHandlers();
    await deckWindow.open();
  }

  registerLocalRendererScheme();
  app.enableSandbox();
  app.setAppUserModelId(APP_USER_MODEL_ID);
  app.on('before-quit', () => {
    releaseInstanceLock();
  });
  void app
    .whenReady()
    .then(start)
    .catch((error) => {
      console.error('Failed to start vanilla-deck:', error);
      app.exit(1);
    });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
