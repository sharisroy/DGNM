function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`${name} must be an integer, got "${raw}"`);
  return parsed;
}

export const PAGE_START = envInt('PAGE_START', 3);
export const PAGE_END = envInt('PAGE_END', 5);
// ^ currently set to run pages 1 to 2 only
export const PAGE_SIZE = envInt('PAGE_SIZE', 100);
export const WORKER_COUNT = envInt('WORKER_COUNT', 20);
