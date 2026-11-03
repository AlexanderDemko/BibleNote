// Share in-flight reads as well as successful results for this process lifetime.
export class SessionCache<T> {
  private pending: Promise<T> | undefined;

  constructor(private readonly load: () => Promise<T>) {}

  get(): Promise<T> {
    if (!this.pending) {
      const pending = Promise.resolve().then(this.load).catch(error => {
        if (this.pending === pending) this.clear();
        throw error;
      });
      this.pending = pending;
    }
    return this.pending;
  }

  set(value: T): void {
    this.pending = Promise.resolve(value);
  }

  clear(): void {
    this.pending = undefined;
  }
}
