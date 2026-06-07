import path from 'node:path';
import { app, type Cookie, type Session, shell, View, WebContentsView } from 'electron';
import { type ColumnState, DEFAULT_START_URL, isAllowedColumnUrl } from './store';

const ALLOWED_COOKIE_HOSTS = ['twitter.com', 'x.com'];

type ColumnCallbacks = {
  onFocus: (column: ColumnState) => void;
  onUrlChanged: (column: ColumnState, url: string) => void;
  onDevToolsShortcut: () => void;
};

type CookieSetDetails = {
  url: string;
  name: string;
  value: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: Cookie['sameSite'];
  domain?: string;
  expirationDate?: number;
};

export class Columns {
  readonly root = new View();
  private readonly views = new Map<string, WebContentsView>();

  constructor(private readonly callbacks: ColumnCallbacks) {}

  add(column: ColumnState, zoomFactor: number): WebContentsView {
    const view = this.createView(column);
    view.webContents.setZoomFactor(zoomFactor);
    this.root.addChildView(view);
    this.views.set(column.id, view);
    return view;
  }

  get(columnId: string | null | undefined): WebContentsView | null {
    return columnId ? (this.views.get(columnId) ?? null) : null;
  }

  owns(webContents: Electron.WebContents): boolean {
    return [...this.views.values()].some((view) => view.webContents === webContents);
  }

  remove(columnId: string): void {
    const view = this.views.get(columnId);
    if (!view) {
      return;
    }
    this.root.removeChildView(view);
    closeView(view);
    this.views.delete(columnId);
  }

  setZoomFactor(zoomFactor: number): void {
    for (const view of this.views.values()) {
      if (!view.webContents.isDestroyed()) {
        view.webContents.setZoomFactor(zoomFactor);
      }
    }
  }

  async clearCookies(): Promise<void> {
    await Promise.all([...this.views.values()].map((view) => clearViewData(view)));
  }

  layout(columns: ColumnState[], columnWidth: number, height: number, scrollOffset: number): void {
    let x = -scrollOffset;
    for (const column of columns) {
      this.views.get(column.id)?.setBounds({ x, y: 0, width: columnWidth, height });
      x += columnWidth;
    }
  }

  toggleDevTools(columnId: string | null): void {
    const webContents = this.get(columnId)?.webContents;
    if (!webContents || webContents.isDestroyed()) {
      return;
    }
    if (webContents.isDevToolsOpened()) {
      webContents.closeDevTools();
    } else {
      webContents.openDevTools({ mode: 'detach' });
    }
  }

  close(): void {
    for (const view of this.views.values()) {
      closeView(view);
    }
    this.views.clear();
  }

  private createView(column: ColumnState): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        partition: column.partition,
        preload: path.join(app.getAppPath(), 'dist', 'preload', 'column.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const { webContents } = view;
    denyAllPermissions(webContents.session);

    webContents.setWindowOpenHandler(({ url }) => {
      openExternalHttps(url);
      return { action: 'deny' };
    });
    const limitNavigation = (event: Electron.Event, url: string): void => {
      if (isAllowedColumnUrl(url)) {
        return;
      }
      event.preventDefault();
      openExternalHttps(url);
    };
    webContents.on('will-navigate', (event, url) => limitNavigation(event, url));
    webContents.on('will-redirect', (event, url) => limitNavigation(event, url));
    webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') {
        event.preventDefault();
        this.callbacks.onDevToolsShortcut();
      }
    });

    const syncUrl = (): void => {
      this.callbacks.onUrlChanged(column, webContents.getURL() || column.url || DEFAULT_START_URL);
    };
    webContents.on('did-navigate', syncUrl);
    webContents.on('did-navigate-in-page', syncUrl);
    webContents.on('focus', () => this.callbacks.onFocus(column));
    return view;
  }
}

export async function cloneSessionCookies(
  sourceView: WebContentsView | null,
  targetView: WebContentsView,
): Promise<void> {
  if (!sourceView || sourceView.webContents.isDestroyed()) {
    return;
  }

  const now = Date.now() / 1000;
  const cookies = (await sourceView.webContents.session.cookies.get({}))
    .filter(
      (cookie) =>
        isAllowedCookieDomain(cookie.domain ?? '') &&
        (!cookie.expirationDate || cookie.expirationDate > now),
    )
    .map(toCookieSetDetails)
    .filter((cookie): cookie is CookieSetDetails => cookie !== null);
  const targetCookies = targetView.webContents.session.cookies;
  await Promise.all(cookies.map((cookie) => targetCookies.set(cookie)));
  await targetCookies.flushStore();
}

export async function clearViewData(view: WebContentsView): Promise<void> {
  if (view.webContents.isDestroyed()) {
    return;
  }

  await view.webContents.session.clearStorageData();
  await view.webContents.session.clearCache();
  await view.webContents.session.cookies.flushStore();
}

function toCookieSetDetails(cookie: Cookie): CookieSetDetails | null {
  if (!cookie.domain) {
    return null;
  }
  const details: CookieSetDetails = {
    url: `${cookie.secure ? 'https' : 'http'}://${cookie.domain.replace(/^\./, '')}${cookie.path || '/'}`,
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
  };
  if (!cookie.hostOnly) {
    details.domain = cookie.domain;
  }
  if (!cookie.session && cookie.expirationDate) {
    details.expirationDate = cookie.expirationDate;
  }
  return details;
}

export function closeView(view: WebContentsView | null): void {
  if (view && !view.webContents.isDestroyed()) {
    view.webContents.close({ waitForBeforeUnload: false });
  }
}

export function denyAllPermissions(session: Session): void {
  session.setPermissionCheckHandler(() => false);
  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
}

function openExternalHttps(value: string): void {
  try {
    if (new URL(value).protocol !== 'https:') {
      return;
    }
  } catch {
    return;
  }
  setImmediate(() => {
    void shell.openExternal(value).catch((error) => {
      console.error('Failed to open external URL:', error);
    });
  });
}

function isAllowedCookieDomain(hostname: string): boolean {
  const normalized = hostname.replace(/^\./, '').toLowerCase();
  return ALLOWED_COOKIE_HOSTS.some(
    (allowedHost) => normalized === allowedHost || normalized.endsWith(`.${allowedHost}`),
  );
}
