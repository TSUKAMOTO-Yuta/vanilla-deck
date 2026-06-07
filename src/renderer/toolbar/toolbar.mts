import type { RendererAppState } from '../../shared/renderer-api.js';

const DEFAULT_COLUMN_WIDTH = 420;
const COLUMN_WIDTH_STEP = 20;
const api = window.vanillaDeck;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Toolbar element #${id} is missing.`);
  }
  return element as T;
}

function run(command: Promise<unknown>, description: string): void {
  void command.catch((error) => {
    console.error(`Failed to ${description}:`, error);
  });
}

const statusText = requireElement<HTMLDivElement>('statusText');
const widthText = requireElement<HTMLDivElement>('widthText');
const zoomText = requireElement<HTMLDivElement>('zoomText');
const addColumnButton = requireElement<HTMLButtonElement>('addColumnButton');
const removeColumnButton = requireElement<HTMLButtonElement>('removeColumnButton');
const moveColumnLeftButton = requireElement<HTMLButtonElement>('moveColumnLeftButton');
const moveColumnRightButton = requireElement<HTMLButtonElement>('moveColumnRightButton');
const reloadButton = requireElement<HTMLButtonElement>('reloadButton');
const moreToggleButton = requireElement<HTMLButtonElement>('moreToggleButton');
const toolbarRoot = document.querySelector<HTMLElement>('.toolbar');
const clearCookiesButton = requireElement<HTMLButtonElement>('clearCookiesButton');
const widthOutButton = requireElement<HTMLButtonElement>('widthOutButton');
const widthResetButton = requireElement<HTMLButtonElement>('widthResetButton');
const widthInButton = requireElement<HTMLButtonElement>('widthInButton');
const zoomOutButton = requireElement<HTMLButtonElement>('zoomOutButton');
const zoomResetButton = requireElement<HTMLButtonElement>('zoomResetButton');
const zoomInButton = requireElement<HTMLButtonElement>('zoomInButton');

function renderState(state: RendererAppState): void {
  const activeIndex = state.columns.findIndex((column) => column.id === state.activeColumnId);
  const activeOrdinal = formatOrdinal(activeIndex >= 0 ? activeIndex + 1 : 1);

  statusText.textContent =
    state.columns.length === 0
      ? 'Columns 0 | Active -'
      : `Columns ${state.columns.length} | Active ${activeOrdinal}`;

  zoomText.textContent = `${Math.round(state.zoomFactor * 100)}%`;
  widthText.textContent = `${Math.round(state.columnWidth)}px`;
  removeColumnButton.disabled = state.columns.length <= 1;
  moveColumnLeftButton.disabled = activeIndex < 1;
  moveColumnRightButton.disabled = activeIndex < 0 || activeIndex >= state.columns.length - 1;
}

async function changeColumnWidth(delta: number): Promise<void> {
  const state = await api.getState();
  await api.setColumnWidth(state.columnWidth + delta);
}

function closeMenu(): void {
  toolbarRoot?.setAttribute('data-mode', 'main');
  moreToggleButton.setAttribute('aria-label', 'More');
  moreToggleButton.setAttribute('aria-pressed', 'false');
}

function toggleMenu(): void {
  const nextMode = toolbarRoot?.getAttribute('data-mode') === 'more' ? 'main' : 'more';
  toolbarRoot?.setAttribute('data-mode', nextMode);
  moreToggleButton.setAttribute('aria-label', nextMode === 'main' ? 'More' : 'Back');
  moreToggleButton.setAttribute('aria-pressed', String(nextMode === 'more'));
}

closeMenu();

addColumnButton.addEventListener('click', () => {
  run(api.addColumn(), 'add column');
});

removeColumnButton.addEventListener('click', () => {
  run(api.removeColumn(), 'remove column');
});

moveColumnLeftButton.addEventListener('click', () => {
  run(api.moveColumnLeft(), 'move column left');
});

moveColumnRightButton.addEventListener('click', () => {
  run(api.moveColumnRight(), 'move column right');
});

reloadButton.addEventListener('click', () => {
  run(api.reloadActiveColumn(), 'reload active column');
});

moreToggleButton.addEventListener('click', () => {
  toggleMenu();
});

clearCookiesButton.addEventListener('click', () => {
  run(api.clearCookies(), 'reset X session');
});

widthOutButton.addEventListener('click', () => {
  run(changeColumnWidth(-COLUMN_WIDTH_STEP), 'narrow columns');
});

widthResetButton.addEventListener('click', () => {
  run(api.setColumnWidth(DEFAULT_COLUMN_WIDTH), 'reset column width');
});

widthInButton.addEventListener('click', () => {
  run(changeColumnWidth(COLUMN_WIDTH_STEP), 'widen columns');
});

zoomOutButton.addEventListener('click', () => {
  run(api.zoomOut(), 'zoom out');
});

zoomResetButton.addEventListener('click', () => {
  run(api.resetZoom(), 'reset zoom');
});

zoomInButton.addEventListener('click', () => {
  run(api.zoomIn(), 'zoom in');
});

api.onStateUpdated(renderState);

api
  .getState()
  .then(renderState)
  .catch((error) => {
    console.error('Failed to load initial state:', error);
    statusText.textContent = 'Loading failed';
  });

function formatOrdinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${value}th`;
  }

  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}
