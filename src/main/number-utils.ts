export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function finiteNumber(value: unknown, fallback: number, minimum = 0): number {
  return isFiniteNumber(value) && value >= minimum ? value : fallback;
}
