export type NativeScriptWorkerCount = number | 'auto';

const MAX_AUTO_WORKERS = 4;

/**
 * Worker slots are additional isolated NativeScript `Worker` runtimes on top
 * of the default main-thread context, so 0 is a valid (and the default) count.
 */
export function resolveNativeScriptWorkerCount(
  requested: NativeScriptWorkerCount | undefined,
  availableParallelism: number,
): number {
  if (requested === undefined) return 0;

  if (requested === 'auto') {
    const available = Number.isFinite(availableParallelism)
      ? Math.max(1, Math.floor(availableParallelism))
      : 1;
    return Math.max(1, Math.min(MAX_AUTO_WORKERS, available - 1));
  }

  if (!Number.isInteger(requested) || requested < 0) {
    throw new RangeError(
      'NativeScript Vitest workers must be a non-negative integer',
    );
  }

  return requested;
}
