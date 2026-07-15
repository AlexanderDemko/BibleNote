export type PrioritizablePage = {
  id: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
};

function timestamp(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * A stable queue for background content hydration.
 *
 * Pages opened by the user can be supplied to take() at any time and jump in
 * front of the initial newest-first order without rebuilding the whole queue.
 */
export class ContentPriorityQueue<T extends PrioritizablePage> {
  private readonly pending = new Map<string, T>();
  private readonly ordered: T[];
  private cursor = 0;

  constructor(pages: T[], openedAtByPage: ReadonlyMap<string, string> = new Map()) {
    for (const page of pages) this.pending.set(page.id, page);
    this.ordered = [...pages].sort((left, right) => {
      const openedDifference = timestamp(openedAtByPage.get(right.id)) - timestamp(openedAtByPage.get(left.id));
      if (openedDifference !== 0) return openedDifference;
      const modifiedDifference = timestamp(right.lastModifiedDateTime) - timestamp(left.lastModifiedDateTime);
      if (modifiedDifference !== 0) return modifiedDifference;
      const createdDifference = timestamp(right.createdDateTime) - timestamp(left.createdDateTime);
      if (createdDifference !== 0) return createdDifference;
      return left.id.localeCompare(right.id);
    });
  }

  get size(): number {
    return this.pending.size;
  }

  take(recentlyOpenedPageIds: readonly string[] = []): T | undefined {
    for (const pageId of recentlyOpenedPageIds) {
      const prioritized = this.pending.get(pageId);
      if (!prioritized) continue;
      this.pending.delete(pageId);
      return prioritized;
    }

    while (this.cursor < this.ordered.length) {
      const next = this.ordered[this.cursor++];
      if (!this.pending.delete(next.id)) continue;
      return next;
    }
    return undefined;
  }
}
