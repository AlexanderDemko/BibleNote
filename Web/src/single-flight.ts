export type SingleFlightResult<T> = {
  promise: Promise<T>;
  started: boolean;
};

export class SingleFlight<T = void> {
  private readonly tasks = new Map<string, Promise<T>>();
  private readonly queue: Array<{
    key: string;
    task: () => Promise<T>;
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  private running = 0;

  constructor(private readonly concurrency = Number.POSITIVE_INFINITY) {
    if (!(concurrency > 0)) throw new Error('SingleFlight concurrency must be positive.');
  }

  run(key: string, task: () => Promise<T>): SingleFlightResult<T> {
    const active = this.tasks.get(key);
    if (active) return { promise: active, started: false };

    let resolvePromise!: (value: T | PromiseLike<T>) => void;
    let rejectPromise!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    this.tasks.set(key, promise);
    this.queue.push({ key, task, promise, resolve:resolvePromise, reject:rejectPromise });
    this.drain();
    return { promise, started: true };
  }

  private drain(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      this.running += 1;
      void Promise.resolve()
        .then(entry.task)
        .then(
          value => {
            this.finish(entry.key, entry.promise);
            entry.resolve(value);
          },
          error => {
            this.finish(entry.key, entry.promise);
            entry.reject(error);
          }
        );
    }
  }

  private finish(key: string, promise: Promise<T>): void {
    this.running -= 1;
    if (this.tasks.get(key) === promise) this.tasks.delete(key);
    this.drain();
  }

  has(key: string): boolean {
    return this.tasks.has(key);
  }

  get size(): number {
    return this.tasks.size;
  }
}
