/**
 * Race a promise against a timeout. Used to keep gather workers responsive:
 * a single slow/hanging source API can never stall the whole answer.
 */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "operation",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/** Run async tasks with a bounded concurrency limit, preserving input order. */
export async function mapWithConcurrency<I, O>(
  items: I[],
  limit: number,
  fn: (item: I, index: number) => Promise<O>,
): Promise<O[]> {
  const results = new Array<O>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }

  const pool = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );
  await Promise.all(pool);
  return results;
}

/** Yield each promise's value as soon as it settles (order = completion order). */
export async function* asCompleted<T>(
  promises: Promise<T>[],
): AsyncGenerator<T> {
  const pending = new Map<number, Promise<{ i: number; v: T }>>(
    promises.map((p, i) => [i, p.then((v) => ({ i, v }))]),
  );
  while (pending.size > 0) {
    const { i, v } = await Promise.race(pending.values());
    pending.delete(i);
    yield v;
  }
}
