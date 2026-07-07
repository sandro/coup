// coup/query.js — lightweight fetch cache
//
// A dumb cache for async data. No background timers, no invisible refetching,
// no framework coupling. You call fetch(), you get data, you render.
//
// Usage:
//   import { QueryClient } from './query.js'
//   const qc = new QueryClient({ staleTime: 30_000 })
//
//   // Fetch with caching + dedup + retry:
//   const users = await qc.fetch(['users', page], {
//     fn: ({ signal }) => fetch(`/api/users?page=${page}`, { signal }).then(r => r.json()),
//   })
//
//   // After a mutation — prefix-invalidate all user queries:
//   qc.invalidate(['users'])
//
//   // Prefetch next page (fire-and-forget):
//   qc.prefetch(['users', page + 1], { fn: ... })
//
//   // Optimistic update:
//   qc.set(['users', page], optimisticData)
//
//   // Read cache without fetching:
//   const cached = qc.get(['users', page])

export class QueryClient {
  constructor({ staleTime = 60_000, gcTime = 300_000, retry = 3, retryDelay } = {}) {
    this._staleTime = staleTime
    this._gcTime = gcTime
    this._retry = retry
    this._retryDelay = retryDelay ?? defaultBackoff

    /** @type {Map<string, { data: unknown, staleAt: number, gcAt: number }>} */
    this._cache = new Map()

    /** @type {Map<string, Promise<unknown>>} */
    this._inflight = new Map()

    /** @type {Map<string, AbortController>} */
    this._aborts = new Map()
  }

  /**
   * Fetch data, returning from cache if fresh. Deduplicates in-flight requests.
   * Aborts any previous in-flight request for the same key.
   *
   * @param {(string|number)[]} key - Cache key segments
   * @param {object} opts
   * @param {function({ signal: AbortSignal }): Promise<*>} opts.fn - Fetch function
   * @param {number} [opts.staleTime] - Override default stale time
   * @param {number} [opts.gcTime] - Override default gc time
   * @param {number} [opts.retry] - Override default retry count
   * @param {number|function(number): number} [opts.retryDelay] - Override default retry delay
   */
  async fetch(key, { fn, staleTime, gcTime, retry, retryDelay } = {}) {
    const k = ser(key)
    const st = staleTime ?? this._staleTime
    const gc = gcTime ?? this._gcTime

    // Return cached data if fresh (lazy GC: delete if expired)
    const cached = this._cache.get(k)
    let fresh = false
    if (cached) {
      if (Date.now() >= cached.gcAt) {
        this._cache.delete(k)
      } else if (Date.now() < cached.staleAt) {
        fresh = true
      }
    }
    if (fresh) return cached.data

    // Deduplicate — if this exact key is already being fetched and
    // the cache isn't stale, piggyback on the in-flight promise.
    // But if the cache IS stale (e.g. after invalidate()), abort the
    // old request and start fresh — the caller wants new data.
    const inflight = this._inflight.get(k)
    if (inflight) {
      if (!this._cache.has(k) || Date.now() < (this._cache.get(k)?.staleAt ?? 0)) {
        return inflight
      }
      // Stale — abort the old request and re-fetch
      this._aborts.get(k)?.abort()
      this._inflight.delete(k)
    }

    const controller = new AbortController()
    this._aborts.set(k, controller)

    const promise = this._retry_loop(
      () => fn({ signal: controller.signal }),
      retry ?? this._retry,
      retryDelay ?? this._retryDelay,
      controller.signal,
    ).then(data => {
      const now = Date.now()
      this._cache.set(k, { data, staleAt: now + st, gcAt: now + st + gc })
      this._inflight.delete(k)
      this._aborts.delete(k)
      return data
    }).catch(err => {
      this._inflight.delete(k)
      this._aborts.delete(k)
      throw err
    })

    this._inflight.set(k, promise)
    return promise
  }

  /**
   * Prefetch — same as fetch but swallows errors.
   * Good for preloading the next page while viewing the current one.
   */
  async prefetch(key, opts) {
    try { await this.fetch(key, opts) } catch {}
  }

  /**
   * Mark cache entries as stale. Uses prefix matching — invalidate(['users'])
   * stales ['users', 1], ['users', 2, 'detail'], etc.
   * Call with no args to invalidate everything.
   */
  invalidate(keyPrefix) {
    if (!keyPrefix) {
      for (const entry of this._cache.values()) entry.staleAt = 0
      return
    }
    for (const [k, entry] of this._cache) {
      const parsed = JSON.parse(k)
      if (keyPrefix.every((seg, i) => parsed[i] === seg)) {
        entry.staleAt = 0
      }
    }
  }

  /**
   * Cancel in-flight requests. Prefix matching like invalidate().
   * Call with no args to cancel everything.
   */
  cancel(keyPrefix) {
    if (!keyPrefix) {
      for (const c of this._aborts.values()) c.abort()
      return
    }
    const k = ser(keyPrefix)
    // Exact match for cancel — you usually cancel a specific fetch
    this._aborts.get(k)?.abort()
  }

  /**
   * Read cached data synchronously. Returns undefined on cache miss.
   */
  get(key) {
    const cached = this._cache.get(ser(key))
    if (!cached) return undefined
    if (Date.now() >= cached.gcAt) {
      this._cache.delete(ser(key))
      return undefined
    }
    return cached.data
  }

  /**
   * Write data into cache manually. Useful for optimistic updates —
   * set the cache to what you expect the server to return, render
   * immediately, then let the real fetch confirm or overwrite.
   */
  set(key, data, { staleTime, gcTime } = {}) {
    const st = staleTime ?? this._staleTime
    const gc = gcTime ?? this._gcTime
    const now = Date.now()
    this._cache.set(ser(key), { data, staleAt: now + st, gcAt: now + st + gc })
  }

  /**
   * Clear all cached data and cancel in-flight requests.
   */
  clear() {
    this.cancel()
    this._cache.clear()
    this._inflight.clear()
  }

  // --- internals ---

  async _retry_loop(fn, maxRetries, retryDelay, signal) {
    let lastError = new Error('Query failed')

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

      try {
        return await fn()
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (lastError.name === 'AbortError' || attempt === maxRetries) throw lastError

        const delay = typeof retryDelay === 'function' ? retryDelay(attempt) : retryDelay
        await new Promise(r => setTimeout(r, delay))
      }
    }

    throw lastError
  }
}

function ser(key) { return JSON.stringify(key) }
function defaultBackoff(attempt) { return Math.min(1000 * 2 ** attempt, 30_000) }
