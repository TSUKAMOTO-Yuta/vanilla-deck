import { ipcRenderer } from 'electron';

let pendingDelta = 0;
let flushScheduled = false;

function normalizeHorizontalWheelDelta(event: WheelEvent): number {
  if (event.deltaX === 0) {
    return 0;
  }

  const lineHeight = 16;
  const pageWidth = window.innerWidth || 1;
  const scale =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? lineHeight
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? pageWidth
        : 1;

  return event.deltaX * scale;
}

function flushPendingDelta(): void {
  flushScheduled = false;
  if (pendingDelta === 0) {
    return;
  }

  ipcRenderer.send('columns:scroll-by-delta', pendingDelta);
  pendingDelta = 0;
}

window.addEventListener(
  'wheel',
  (event) => {
    const delta = normalizeHorizontalWheelDelta(event);
    if (delta === 0) {
      return;
    }

    event.preventDefault();
    pendingDelta += delta;
    if (!flushScheduled) {
      flushScheduled = true;
      window.requestAnimationFrame(flushPendingDelta);
    }
  },
  { passive: false, capture: true },
);
