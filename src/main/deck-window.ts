import path from 'node:path';
import { app, BaseWindow, dialog, ipcMain, Menu, WebContentsView } from 'electron';
import type { RendererAppState } from '../shared/renderer-api';
import { Columns, cloneSessionCookies, closeView, denyAllPermissions } from './columns';
import { clamp, isFiniteNumber } from './number-utils';
import {
  type AppState,
  createColumnState,
  createEmptyState,
  DEFAULT_START_URL,
  ensureValidState,
  loadState,
  pruneUnusedPartitions,
  recoverStateFromPartitions,
  STATE_FILENAME,
  saveState,
} from './store';

const TOOLBAR_HEIGHT = 40;
const SCROLLBAR_HEIGHT = 24;
const MIN_ZOOM_FACTOR = 0.5;
const MAX_ZOOM_FACTOR = 2.5;
const MIN_COLUMN_WIDTH = 280;
const MAX_COLUMN_WIDTH = 720;
const ZOOM_FACTOR_STEP = 0.05;

function normalizeZoomFactor(value: number): number {
  return clamp(Math.round(value * 100) / 100, MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR);
}

export class DeckWindow {
  private window: BaseWindow | null = null;
  private toolbar: WebContentsView | null = null;
  private scrollbar: WebContentsView | null = null;
  private state: AppState = createEmptyState();
  private stateFilePath: string | null = null;
  private pendingScrollOffset: number | null = null;
  private scrollUpdateTimer: NodeJS.Timeout | null = null;
  private scrollPersistTimer: NodeJS.Timeout | null = null;
  private partitionPruneTimer: NodeJS.Timeout | null = null;
  private readonly columns: Columns;

  constructor(public readonly defaultZoomFactor: number) {
    this.columns = new Columns({
      onFocus: (column) => {
        this.state.activeColumnId = column.id;
        this.syncState();
      },
      onUrlChanged: (column, url) => {
        column.url = url;
        this.scheduleStateSave();
      },
      onDevToolsShortcut: () => this.columns.toggleDevTools(this.state.activeColumnId),
    });
  }

  async open(): Promise<void> {
    this.stateFilePath = path.join(app.getPath('userData'), STATE_FILENAME);
    const fallbackState = { ...createEmptyState(), zoomFactor: this.defaultZoomFactor };
    let savedState = await loadState(this.stateFilePath, fallbackState);
    if (!savedState.columns.length) {
      const recovered = await recoverStateFromPartitions(app.getPath('userData'), fallbackState);
      if (recovered) {
        savedState = recovered;
        await saveState(this.stateFilePath, savedState);
      }
    }

    this.window = new BaseWindow({
      width: 1440,
      height: 1024,
      minWidth: 480,
      minHeight: 520,
      title: 'vanilla-deck',
      icon: path.join(app.getAppPath(), 'assets', 'icon.png'),
    });
    this.window.setBackgroundColor('#101418');
    Menu.setApplicationMenu(null);

    this.toolbar = this.createLocalView();
    this.scrollbar = this.createLocalView();
    this.window.contentView.addChildView(this.toolbar);
    this.window.contentView.addChildView(this.scrollbar);
    this.window.contentView.addChildView(this.columns.root);
    this.window.show();
    await Promise.all([
      this.toolbar.webContents.loadURL('vanilla-deck://toolbar/index.html'),
      this.scrollbar.webContents.loadURL('vanilla-deck://scrollbar/index.html'),
    ]);

    await this.rebuildColumns(savedState);
    await this.pruneOrphanPartitions();
    this.window.on('resize', () => {
      this.layout();
      this.sendStateToUi();
    });
    this.window.on('closed', () => this.cleanup());
  }

  private createLocalView(): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(app.getAppPath(), 'dist', 'preload', 'app.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    denyAllPermissions(view.webContents.session);
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    view.webContents.on('will-navigate', (event) => event.preventDefault());
    view.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') {
        event.preventDefault();
        this.columns.toggleDevTools(this.state.activeColumnId);
      }
    });
    return view;
  }

  private layout(): void {
    if (!this.window || !this.toolbar || !this.scrollbar) {
      return;
    }
    const { width, height } = this.window.getContentBounds();
    this.setScrollOffset(this.state.scrollOffset);
    const scrollbarHeight = this.contentWidth > width ? SCROLLBAR_HEIGHT : 0;
    const columnHeight = Math.max(0, height - TOOLBAR_HEIGHT - scrollbarHeight);

    this.toolbar.setBounds({ x: 0, y: 0, width, height: TOOLBAR_HEIGHT });
    this.columns.root.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: columnHeight });
    this.scrollbar.setVisible(scrollbarHeight > 0);
    this.scrollbar.setBounds({
      x: 0,
      y: TOOLBAR_HEIGHT + columnHeight,
      width,
      height: scrollbarHeight,
    });
    this.columns.layout(
      this.state.columns,
      this.state.columnWidth,
      columnHeight,
      this.state.scrollOffset,
    );
  }

  private async rebuildColumns(savedState: AppState): Promise<void> {
    this.state = ensureValidState(savedState, createEmptyState());
    this.state.zoomFactor = normalizeZoomFactor(this.state.zoomFactor);
    this.state.columnWidth = clamp(
      Math.round(this.state.columnWidth),
      MIN_COLUMN_WIDTH,
      MAX_COLUMN_WIDTH,
    );
    this.setScrollOffset(this.state.scrollOffset);
    if (!this.state.columns.length) {
      await this.addColumn();
      return;
    }

    const activeColumnIndex = this.state.columns.findIndex(
      ({ id }) => id === this.state.activeColumnId,
    );
    const loadOrder =
      activeColumnIndex > 0
        ? [
            this.state.columns[activeColumnIndex],
            ...this.state.columns.filter((_, index) => index !== activeColumnIndex),
          ]
        : this.state.columns;

    for (const column of loadOrder) {
      const view = this.columns.add(column, this.state.zoomFactor);
      void view.webContents.loadURL(column.url || DEFAULT_START_URL).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== 'ERR_ABORTED') {
          console.error('Failed to load column URL:', error);
        }
      });
    }
    this.layout();
    this.sendStateToUi();
  }

  private sendStateToUi(): void {
    for (const view of [this.toolbar, this.scrollbar]) {
      if (view && !view.webContents.isDestroyed()) {
        view.webContents.send('state-updated', this.rendererState);
      }
    }
  }

  private syncState(): void {
    this.sendStateToUi();
    this.scheduleStateSave();
    this.schedulePartitionPrune();
  }

  private async pruneOrphanPartitions(): Promise<void> {
    const stateFilePath = this.stateFilePath;
    if (!stateFilePath) {
      return;
    }

    try {
      await pruneUnusedPartitions(
        path.dirname(stateFilePath),
        this.state.columns.map(({ partition }) => partition),
      );
    } catch (error) {
      console.error('Failed to prune unused partitions:', error);
    }
  }

  private schedulePartitionPrune(): void {
    if (!this.stateFilePath) {
      return;
    }

    if (this.partitionPruneTimer) {
      clearTimeout(this.partitionPruneTimer);
    }
    this.partitionPruneTimer = setTimeout(() => {
      this.partitionPruneTimer = null;
      void this.pruneOrphanPartitions();
    }, 500);
  }

  private scheduleStateSave(): void {
    if (!this.stateFilePath) return;
    void saveState(this.stateFilePath, this.state).catch((error) =>
      console.error('Failed to persist state:', error),
    );
  }

  private cleanup(): void {
    if (this.scrollUpdateTimer) {
      clearTimeout(this.scrollUpdateTimer);
    }
    if (this.scrollPersistTimer) {
      clearTimeout(this.scrollPersistTimer);
    }
    if (this.partitionPruneTimer) {
      clearTimeout(this.partitionPruneTimer);
    }
    this.columns.close();
    closeView(this.toolbar);
    closeView(this.scrollbar);
    this.toolbar = null;
    this.scrollbar = null;
    this.window = null;
  }

  registerIpcHandlers(): void {
    this.bindToolbarIpc('toolbar:add-column', () => this.addColumn());
    this.bindToolbarIpc('toolbar:clear-cookies', () => this.clearCookies());
    this.bindToolbarIpc('toolbar:remove-column', () => this.removeActiveColumn());
    this.bindToolbarIpc('toolbar:move-column-left', () => this.moveActiveColumn(-1));
    this.bindToolbarIpc('toolbar:move-column-right', () => this.moveActiveColumn(1));
    this.bindToolbarIpc('toolbar:reload-active-column', () => this.reloadActiveColumn());
    this.bindToolbarIpc('toolbar:zoom-in', () =>
      this.applyZoomFactor(this.state.zoomFactor + ZOOM_FACTOR_STEP),
    );
    this.bindToolbarIpc('toolbar:zoom-out', () =>
      this.applyZoomFactor(this.state.zoomFactor - ZOOM_FACTOR_STEP),
    );
    this.bindToolbarIpc('toolbar:reset-zoom', () => this.applyZoomFactor(this.defaultZoomFactor));
    this.bindLocalUiIpc('toolbar:get-state', () => this.rendererState);
    this.bindToolbarIpc('toolbar:set-column-width', (_event, value: unknown) =>
      isFiniteNumber(value) ? this.applyColumnWidth(value) : this.rendererState,
    );

    ipcMain.on('scrollbar:set-offset', (event, value: unknown) => {
      if (!this.isViewSender(event, this.scrollbar)) return;
      if (isFiniteNumber(value)) {
        this.queueScrollOffset(value);
      }
    });
    ipcMain.on('columns:scroll-by-delta', (event, value: unknown) => {
      if (!this.isMainFrameSender(event) || !this.columns.owns(event.sender)) return;
      if (isFiniteNumber(value)) {
        this.scrollByDelta(value);
      }
    });
  }

  private get contentWidth(): number {
    return this.state.columns.length * this.state.columnWidth;
  }

  private get maxScrollOffset(): number {
    return Math.max(0, this.contentWidth - (this.window?.getContentBounds().width ?? 0));
  }

  get rendererState(): RendererAppState {
    return {
      columns: this.state.columns.map(({ id }) => ({ id })),
      activeColumnId: this.state.activeColumnId,
      zoomFactor: this.state.zoomFactor,
      columnWidth: this.state.columnWidth,
      scrollOffset: this.state.scrollOffset,
      contentWidth: this.contentWidth,
    };
  }

  get toolbarView(): WebContentsView | null {
    return this.toolbar;
  }

  get scrollbarView(): WebContentsView | null {
    return this.scrollbar;
  }

  private setScrollOffset(value: number): void {
    this.state.scrollOffset = clamp(Math.round(value), 0, this.maxScrollOffset);
  }

  private isMainFrameSender(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
    return event.senderFrame !== null && event.senderFrame === event.sender.mainFrame;
  }

  private isViewSender(
    event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
    view: WebContentsView | null,
  ): boolean {
    return Boolean(view) && this.isMainFrameSender(event) && event.sender === view?.webContents;
  }

  private bindLocalUiIpc<TArgs extends unknown[], TResult>(
    channel: string,
    handler: (event: Electron.IpcMainInvokeEvent, ...args: TArgs) => TResult,
  ): void {
    ipcMain.handle(channel, (event, ...args: TArgs) => {
      if (!this.isViewSender(event, this.toolbar) && !this.isViewSender(event, this.scrollbar)) {
        throw new Error(`Blocked untrusted IPC sender for ${channel}.`);
      }
      return handler(event, ...args);
    });
  }

  private bindToolbarIpc<TArgs extends unknown[], TResult>(
    channel: string,
    handler: (event: Electron.IpcMainInvokeEvent, ...args: TArgs) => TResult,
  ): void {
    ipcMain.handle(channel, (event, ...args: TArgs) => {
      if (!this.isViewSender(event, this.toolbar)) {
        throw new Error(`Blocked untrusted IPC sender for ${channel}.`);
      }
      return handler(event, ...args);
    });
  }

  applyZoomFactor(value: number): RendererAppState {
    this.state.zoomFactor = normalizeZoomFactor(value);
    this.columns.setZoomFactor(this.state.zoomFactor);
    this.syncState();
    return this.rendererState;
  }

  applyColumnWidth(value: number): RendererAppState {
    this.state.columnWidth = clamp(Math.round(value), MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH);
    this.setScrollOffset(this.state.scrollOffset);
    this.layout();
    this.syncState();
    return this.rendererState;
  }

  queueScrollOffset(value: number): void {
    this.pendingScrollOffset = value;
    this.scrollUpdateTimer ??= setTimeout(() => this.flushScrollOffset(), 16);
  }

  scrollByDelta(value: number): void {
    this.queueScrollOffset((this.pendingScrollOffset ?? this.state.scrollOffset) + value);
  }

  reloadActiveColumn(): void {
    const activeColumnView = this.columns.get(this.state.activeColumnId);
    activeColumnView?.webContents.reload();
  }

  private flushScrollOffset(): void {
    this.scrollUpdateTimer = null;
    if (this.pendingScrollOffset === null) {
      return;
    }
    this.setScrollOffset(this.pendingScrollOffset);
    this.pendingScrollOffset = null;
    this.layout();
    this.sendStateToUi();

    if (this.scrollPersistTimer) {
      clearTimeout(this.scrollPersistTimer);
    }
    this.scrollPersistTimer = setTimeout(() => {
      this.scrollPersistTimer = null;
      this.scheduleStateSave();
    }, 250);
  }

  async addColumn(): Promise<void> {
    const sourceColumn =
      this.state.columns.find(({ id }) => id === this.state.activeColumnId) ??
      this.state.columns.at(-1) ??
      null;
    const column = createColumnState(sourceColumn?.url);
    const sourceView = this.columns.get(sourceColumn?.id);
    this.state.columns.push(column);
    this.state.activeColumnId = column.id;

    const view = this.columns.add(column, this.state.zoomFactor);
    this.layout();
    this.sendStateToUi();
    try {
      await cloneSessionCookies(sourceView, view);
    } catch (error) {
      console.error('Failed to copy cookies from the previous column:', error);
    }
    void view.webContents.loadURL(column.url).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== 'ERR_ABORTED') {
        console.error('Failed to load column URL:', error);
      }
    });
    if (this.stateFilePath) {
      await saveState(this.stateFilePath, this.state);
      this.schedulePartitionPrune();
    }
  }

  async clearCookies(): Promise<void> {
    if (!this.window) return;

    const { response } = await dialog.showMessageBox(this.window, {
      type: 'warning',
      buttons: ['Cancel', 'Reset X session'],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
      title: 'Reset X session?',
      message: 'Clear saved data for all columns and reopen X?',
      detail:
        'This removes cookies, cache, service workers, and other saved site data for every column, then opens x.com/home again. You will need to sign in again.',
    });

    if (response !== 1) return;
    await this.columns.clearCookies();
    for (const column of this.state.columns) {
      column.url = DEFAULT_START_URL;
    }
    this.syncState();
    await Promise.all(
      this.state.columns.map(async (column) => {
        const view = this.columns.get(column.id);
        if (view && !view.webContents.isDestroyed()) {
          await view.webContents.loadURL(column.url).catch((error) => {
            if ((error as NodeJS.ErrnoException).code !== 'ERR_ABORTED') {
              console.error('Failed to reset column URL:', error);
            }
          });
        }
      }),
    );
  }

  removeActiveColumn(): void {
    if (this.state.columns.length <= 1) {
      return;
    }
    const activeId = this.state.activeColumnId ?? this.state.columns.at(-1)?.id;
    const index = this.state.columns.findIndex(({ id }) => id === activeId);
    if (index < 0) {
      return;
    }

    const [column] = this.state.columns.splice(index, 1);
    this.columns.remove(column.id);
    this.state.activeColumnId =
      (this.state.columns[index] ?? this.state.columns[index - 1] ?? this.state.columns[0])?.id ??
      null;
    this.layout();
    this.syncState();
  }

  moveActiveColumn(direction: -1 | 1): RendererAppState {
    const activeId = this.state.activeColumnId ?? this.state.columns.at(-1)?.id;
    const index = this.state.columns.findIndex(({ id }) => id === activeId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= this.state.columns.length) {
      return this.rendererState;
    }

    const [column] = this.state.columns.splice(index, 1);
    this.state.columns.splice(targetIndex, 0, column);
    this.layout();
    this.syncState();
    return this.rendererState;
  }
}
