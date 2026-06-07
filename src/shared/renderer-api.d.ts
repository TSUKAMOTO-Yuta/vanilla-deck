export type RendererColumnState = {
  id: string;
};

export type RendererAppState = {
  columns: RendererColumnState[];
  activeColumnId: string | null;
  zoomFactor: number;
  columnWidth: number;
  contentWidth: number;
  scrollOffset: number;
};

export type VanillaDeckAPI = {
  getState: () => Promise<RendererAppState>;
  addColumn: () => Promise<void>;
  clearCookies: () => Promise<void>;
  removeColumn: () => Promise<void>;
  moveColumnLeft: () => Promise<RendererAppState>;
  moveColumnRight: () => Promise<RendererAppState>;
  reloadActiveColumn: () => Promise<void>;
  zoomIn: () => Promise<RendererAppState>;
  zoomOut: () => Promise<RendererAppState>;
  resetZoom: () => Promise<RendererAppState>;
  setColumnWidth: (columnWidth: number) => Promise<RendererAppState>;
  scrollColumns: (scrollOffset: number) => void;
  onStateUpdated: (callback: (state: RendererAppState) => void) => () => void;
};

declare global {
  interface Window {
    vanillaDeck: VanillaDeckAPI;
  }
}
