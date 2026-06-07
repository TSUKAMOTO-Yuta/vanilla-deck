import { randomUUID } from 'node:crypto';
import { type Dirent, constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { finiteNumber } from './number-utils';

export const STATE_FILENAME = 'state.json';
export const DEFAULT_START_URL = 'https://x.com/home';
export const DEFAULT_ZOOM_FACTOR = 1;
export const DEFAULT_COLUMN_WIDTH = 420;
const COLUMN_PARTITION_PREFIX = 'persist:vanilla-deck:column:';

export interface ColumnState {
  id: string;
  partition: string;
  url: string;
}

export interface AppState {
  columns: ColumnState[];
  activeColumnId: string | null;
  zoomFactor: number;
  columnWidth: number;
  scrollOffset: number;
}

export function createEmptyState(): AppState {
  return {
    columns: [],
    activeColumnId: null,
    zoomFactor: DEFAULT_ZOOM_FACTOR,
    columnWidth: DEFAULT_COLUMN_WIDTH,
    scrollOffset: 0,
  };
}

export function createColumnState(sourceUrl = DEFAULT_START_URL): ColumnState {
  const id = randomUUID();
  return {
    id,
    partition: `${COLUMN_PARTITION_PREFIX}${id}`,
    url: isAllowedColumnUrl(sourceUrl) ? sourceUrl : DEFAULT_START_URL,
  };
}

export function isAllowedColumnUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const url = new URL(value);
    const normalizedHostname = url.hostname.replace(/^\./, '').toLowerCase();
    return (
      url.protocol === 'https:' &&
      ['twitter.com', 'x.com'].some(
        (allowedHost) =>
          normalizedHostname === allowedHost || normalizedHostname.endsWith(`.${allowedHost}`),
      )
    );
  } catch {
    return false;
  }
}

function columnIdFromPartition(value: string): string | null {
  if (value.startsWith(COLUMN_PARTITION_PREFIX)) {
    return value.slice(COLUMN_PARTITION_PREFIX.length) || null;
  }
  const storagePrefix = COLUMN_PARTITION_PREFIX.replace(/^persist:/, '');
  if (value.startsWith(storagePrefix)) {
    return value.slice(storagePrefix.length) || null;
  }
  return null;
}

function normalizeColumn(value: unknown): ColumnState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const input = value as Record<string, unknown>;
  const partitionId =
    typeof input.partition === 'string' ? columnIdFromPartition(input.partition) : null;
  const id = typeof input.id === 'string' && input.id ? input.id : (partitionId ?? randomUUID());
  return {
    id,
    partition: `${COLUMN_PARTITION_PREFIX}${id}`,
    url: isAllowedColumnUrl(input.url) ? input.url : DEFAULT_START_URL,
  };
}

export function ensureValidState(
  candidate: unknown,
  fallbackState: AppState = createEmptyState(),
): AppState {
  const input =
    candidate && typeof candidate === 'object' ? (candidate as Record<string, unknown>) : {};
  const columns = Array.isArray(input.columns)
    ? input.columns.map(normalizeColumn).filter((column): column is ColumnState => column !== null)
    : [];
  const normalizedColumns = columns.length
    ? columns
    : fallbackState.columns.map((column) => ({ ...column }));
  const activeColumnId =
    typeof input.activeColumnId === 'string' &&
    normalizedColumns.some((column) => column.id === input.activeColumnId)
      ? input.activeColumnId
      : (normalizedColumns[0]?.id ?? null);

  return {
    columns: normalizedColumns,
    activeColumnId,
    zoomFactor: finiteNumber(input.zoomFactor, fallbackState.zoomFactor, Number.EPSILON),
    columnWidth: finiteNumber(input.columnWidth, fallbackState.columnWidth, 240),
    scrollOffset: finiteNumber(input.scrollOffset, fallbackState.scrollOffset),
  };
}

export async function loadState(filePath: string, fallbackState: AppState): Promise<AppState> {
  try {
    return ensureValidState(JSON.parse(await fs.readFile(filePath, 'utf8')), fallbackState);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT') {
      console.warn(`Failed to load state from ${filePath}:`, error);
    }
    return fallbackState;
  }
}

export async function recoverStateFromPartitions(
  userDataPath: string,
  fallbackState: AppState,
): Promise<AppState | null> {
  const partitionsPath = path.join(userDataPath, 'Partitions');
  let entries: Dirent[];
  try {
    entries = await fs.readdir(partitionsPath, { withFileTypes: true });
  } catch {
    return null;
  }

  const recovered: Array<{ id: string; partition: string; mtimeMs: number }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    let partition: string;
    try {
      partition = decodeURIComponent(entry.name);
    } catch {
      continue;
    }
    const id = columnIdFromPartition(partition);
    if (!id) {
      continue;
    }
    try {
      recovered.push({
        id,
        partition: `${COLUMN_PARTITION_PREFIX}${id}`,
        mtimeMs: (await fs.stat(path.join(partitionsPath, entry.name))).mtimeMs,
      });
    } catch {
      // The partition may disappear between readdir and stat.
    }
  }

  if (!recovered.length) {
    return null;
  }
  recovered.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return {
    ...fallbackState,
    columns: recovered.map(({ id, partition }) => ({
      id,
      partition,
      url: DEFAULT_START_URL,
    })),
    activeColumnId: recovered[0].id,
  };
}

export async function pruneUnusedPartitions(
  userDataPath: string,
  activePartitions: Iterable<string>,
): Promise<void> {
  const partitionsPath = path.join(userDataPath, 'Partitions');
  let entries: Dirent[];
  try {
    entries = await fs.readdir(partitionsPath, { withFileTypes: true });
  } catch {
    return;
  }

  const keep = new Set(
    [...activePartitions].map(columnIdFromPartition).filter((value): value is string => !!value),
  );
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    let partition: string;
    try {
      partition = decodeURIComponent(entry.name);
    } catch {
      continue;
    }
    const id = columnIdFromPartition(partition);
    if (!id || keep.has(id)) {
      continue;
    }

    try {
      await fs.rm(path.join(partitionsPath, entry.name), { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to prune partition ${partition}:`, error);
    }
  }
}

export async function saveState(filePath: string, state: AppState): Promise<void> {
  const content = `${JSON.stringify(ensureValidState(state), null, 2)}\n`;
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tempPath, content, 'utf8');

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await fs.copyFile(tempPath, filePath, fsConstants.COPYFILE_FICLONE);
        return;
      } catch (error) {
        if (
          attempt === 4 ||
          !['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')
        ) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}
