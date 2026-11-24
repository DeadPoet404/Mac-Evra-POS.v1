/**
 * Bounded, complete page collection for store-scoped reads.
 *
 * The previous reporting path asked PostgREST for a single page capped at 500
 * rows, which silently truncated revenue and transaction counts for any store
 * with more sales than that. This helper walks every page of a ranged query
 * until the server returns a short page, so the caller either receives the
 * complete set or an explicit error — never a quiet partial result.
 *
 * Contract:
 * - `fetchPage` must apply a deterministic total order (a unique key as the
 *   final ORDER BY column) and translate `offset`/`limit` into a range query.
 * - Pages are requested sequentially, so memory holds one page of raw rows at a
 *   time in addition to the accumulated keys.
 * - Rows are de-duplicated by `key`; a row repeated across a page boundary (for
 *   example because new rows shifted the offsets mid-scan) is counted once.
 * - A page budget guards against a server that never returns a short page. The
 *   budget is deliberately generous and failing it throws instead of truncating.
 */

export type PageWindow = {
  offset: number
  limit: number
}

export type CollectPagesOptions<T> = {
  /** Rows requested per round trip. */
  pageSize?: number
  /** Stable unique key for de-duplication. */
  key: (row: T) => string
  /** Hard stop for a server that never returns a short page. */
  maxPages?: number
}

export type CollectedPages<T> = {
  rows: T[]
  pages: number
  duplicatesSkipped: number
}

export const defaultPageSize = 200
export const defaultMaxPages = 500

export async function collectAllPages<T>(
  fetchPage: (window: PageWindow) => Promise<T[]>,
  { pageSize = defaultPageSize, key, maxPages = defaultMaxPages }: CollectPagesOptions<T>
): Promise<CollectedPages<T>> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error("Page size must be an integer between 1 and 1000.")
  }
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new Error("Page budget must be a positive integer.")
  }

  const rows: T[] = []
  const seen = new Set<string>()
  let duplicatesSkipped = 0
  let pages = 0

  while (pages < maxPages) {
    const batch = await fetchPage({ offset: pages * pageSize, limit: pageSize })
    pages += 1

    for (const row of batch) {
      const rowKey = key(row)
      if (seen.has(rowKey)) {
        duplicatesSkipped += 1
        continue
      }
      seen.add(rowKey)
      rows.push(row)
    }

    // A short page means the range is exhausted; a full page means there may be more.
    if (batch.length < pageSize) return { rows, pages, duplicatesSkipped }
  }

  throw new Error(
    `Page budget of ${maxPages * pageSize} rows was exhausted before the range ended; refusing to return a partial report.`
  )
}
