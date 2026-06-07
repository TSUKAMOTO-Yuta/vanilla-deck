import type { RendererAppState } from '../../shared/renderer-api.js';

function requireElement(id: string): HTMLDivElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLDivElement)) {
    throw new Error(`Scrollbar element #${id} is missing.`);
  }
  return element;
}

const api = window.vanillaDeck;
const viewport = requireElement('scrollViewport');
const content = requireElement('scrollContent');
let syncing = false;

function renderState(state: RendererAppState): void {
  content.style.width = `${state.contentWidth}px`;
  if (Math.abs(viewport.scrollLeft - state.scrollOffset) > 1) {
    syncing = true;
    viewport.scrollLeft = state.scrollOffset;
    window.requestAnimationFrame(() => {
      syncing = false;
    });
  }
}

viewport.addEventListener('scroll', () => {
  if (!syncing) {
    api.scrollColumns(viewport.scrollLeft);
  }
});

api.onStateUpdated(renderState);
api
  .getState()
  .then(renderState)
  .catch((error) => {
    console.error('Failed to initialize scrollbar:', error);
  });
