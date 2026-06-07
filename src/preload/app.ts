import { contextBridge, ipcRenderer } from 'electron';
import type { RendererAppState, VanillaDeckAPI } from '../shared/renderer-api';

const api: VanillaDeckAPI = {
  getState: () => ipcRenderer.invoke('toolbar:get-state'),
  addColumn: () => ipcRenderer.invoke('toolbar:add-column'),
  clearCookies: () => ipcRenderer.invoke('toolbar:clear-cookies'),
  removeColumn: () => ipcRenderer.invoke('toolbar:remove-column'),
  moveColumnLeft: () => ipcRenderer.invoke('toolbar:move-column-left'),
  moveColumnRight: () => ipcRenderer.invoke('toolbar:move-column-right'),
  reloadActiveColumn: () => ipcRenderer.invoke('toolbar:reload-active-column'),
  zoomIn: () => ipcRenderer.invoke('toolbar:zoom-in'),
  zoomOut: () => ipcRenderer.invoke('toolbar:zoom-out'),
  resetZoom: () => ipcRenderer.invoke('toolbar:reset-zoom'),
  setColumnWidth: (columnWidth: number) =>
    ipcRenderer.invoke('toolbar:set-column-width', columnWidth),
  scrollColumns: (scrollOffset: number) => ipcRenderer.send('scrollbar:set-offset', scrollOffset),
  onStateUpdated: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: RendererAppState) =>
      callback(state);
    ipcRenderer.on('state-updated', listener);
    return () => ipcRenderer.removeListener('state-updated', listener);
  },
};

contextBridge.exposeInMainWorld('vanillaDeck', api);
