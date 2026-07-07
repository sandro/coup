import { QueryClient } from './query.js'

let passed = 0, failed = 0

function assert(condition, msg) {
  if (!condition) { console.log('❌', msg); failed++ }
  else { console.log('✅', msg); passed++ }
}

async function assertThrows(fn, msg) {
  try { await fn(); console.log('❌', msg + ' (did not throw)'); failed++ }
  catch { console.log('✅', msg); passed++ }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Fresh cache returns data without re-fetching ──

{
  const qc = new QueryClient({ staleTime: 5000 })
  let calls = 0
  const fn = async () => { calls++; return { users: ['a'] } }

  const d1 = await qc.fetch(['users'], { fn })
  const d2 = await qc.fetch(['users'], { fn })

  assert(calls === 1, 'Fresh cache: only 1 fetch call')
  assert(d1 === d2, 'Fresh cache: same reference returned')
  assert(d1.users[0] === 'a', 'Fresh cache: correct data')
  qc.clear()
}

// ── Stale cache triggers re-fetch ──

{
  const qc = new QueryClient({ staleTime: 10 }) // 10ms stale time
  let calls = 0
  const fn = async () => { calls++; return { n: calls } }

  await qc.fetch(['data'], { fn })
  assert(calls === 1, 'Stale: first fetch')

  await sleep(20) // wait for stale

  const d2 = await qc.fetch(['data'], { fn })
  assert(calls === 2, 'Stale: re-fetched after staleTime')
  assert(d2.n === 2, 'Stale: got fresh data')
  qc.clear()
}

// ── Different keys are independent ──

{
  const qc = new QueryClient()
  let calls = 0
  const fn = async () => ++calls

  await qc.fetch(['a', 1], { fn })
  await qc.fetch(['a', 2], { fn })
  await qc.fetch(['b', 1], { fn })

  assert(calls === 3, 'Different keys: 3 separate fetches')
  assert(qc.get(['a', 1]) === 1, 'Key [a,1] cached')
  assert(qc.get(['a', 2]) === 2, 'Key [a,2] cached')
  assert(qc.get(['b', 1]) === 3, 'Key [b,1] cached')
  qc.clear()
}

// ── In-flight deduplication ──

{
  const qc = new QueryClient()
  let calls = 0
  const fn = async () => { calls++; await sleep(50); return 'result' }

  // Fire 3 concurrent fetches for the same key
  const [r1, r2, r3] = await Promise.all([
    qc.fetch(['dedup'], { fn }),
    qc.fetch(['dedup'], { fn }),
    qc.fetch(['dedup'], { fn }),
  ])

  assert(calls === 1, 'Dedup: only 1 fetch call for 3 concurrent requests')
  assert(r1 === 'result' && r2 === 'result' && r3 === 'result', 'Dedup: all got same result')
  qc.clear()
}

// ── Retry on failure ──

{
  const qc = new QueryClient()
  let attempts = 0
  const fn = async () => {
    attempts++
    if (attempts < 3) throw new Error('fail')
    return 'ok'
  }

  const result = await qc.fetch(['retry'], { fn, retry: 3, retryDelay: 5 })
  assert(attempts === 3, `Retry: took ${attempts} attempts (expected 3)`)
  assert(result === 'ok', 'Retry: succeeded on third attempt')
  qc.clear()
}

// ── Retry exhaustion throws ──

{
  const qc = new QueryClient()
  const fn = async () => { throw new Error('always fails') }

  await assertThrows(
    () => qc.fetch(['fail'], { fn, retry: 2, retryDelay: 5 }),
    'Retry exhaustion: throws after max retries'
  )
  qc.clear()
}

// ── Invalidate marks entries stale (prefix match) ──

{
  const qc = new QueryClient({ staleTime: 60_000 })
  let calls = 0
  const fn = async () => ++calls

  await qc.fetch(['users', 1], { fn })
  await qc.fetch(['users', 2], { fn })
  await qc.fetch(['posts', 1], { fn })
  assert(calls === 3, 'Invalidate: 3 initial fetches')

  // Invalidate all 'users' queries
  qc.invalidate(['users'])

  await qc.fetch(['users', 1], { fn })
  await qc.fetch(['users', 2], { fn })
  await qc.fetch(['posts', 1], { fn }) // should still be fresh

  assert(calls === 5, 'Invalidate: re-fetched 2 user queries, posts stayed fresh')
  qc.clear()
}

// ── Invalidate all (no args) ──

{
  const qc = new QueryClient({ staleTime: 60_000 })
  let calls = 0
  const fn = async () => ++calls

  await qc.fetch(['a'], { fn })
  await qc.fetch(['b'], { fn })
  assert(calls === 2, 'Invalidate all: 2 initial')

  qc.invalidate()

  await qc.fetch(['a'], { fn })
  await qc.fetch(['b'], { fn })
  assert(calls === 4, 'Invalidate all: both re-fetched')
  qc.clear()
}

// ── Cancel aborts in-flight request ──

{
  const qc = new QueryClient()
  let aborted = false
  const fn = async ({ signal }) => {
    signal.addEventListener('abort', () => { aborted = true })
    await sleep(200)
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    return 'should not reach'
  }

  const promise = qc.fetch(['cancel-test'], { fn, retry: 0 })
  await sleep(10)
  qc.cancel(['cancel-test'])

  let threw = false
  try { await promise } catch (e) { threw = e.name === 'AbortError' }
  assert(threw, 'Cancel: fetch threw AbortError')
  assert(aborted, 'Cancel: signal was aborted')
  qc.clear()
}

// ── Abort on re-fetch: invalidate after data is cached, then re-fetch ──

{
  const qc = new QueryClient({ staleTime: 60_000 })
  let calls = 0
  let secondAborted = false

  const fn = async ({ signal }) => {
    const n = ++calls
    signal.addEventListener('abort', () => { if (n === 2) secondAborted = true })
    await sleep(50)
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    return `result-${n}`
  }

  // First fetch completes and caches
  const r1 = await qc.fetch(['rekey'], { fn, retry: 0 })
  assert(r1 === 'result-1', 'Re-fetch: first fetch completes')

  // Invalidate — marks cached data as stale
  qc.invalidate(['rekey'])

  // Start a slow re-fetch (stale cache → new request)
  const p2 = qc.fetch(['rekey'], { fn, retry: 0 }).catch(() => 'aborted')
  await sleep(10) // p2 is in-flight

  // Invalidate again and re-fetch — should abort p2 and start p3
  qc.invalidate(['rekey'])
  const p3 = qc.fetch(['rekey'], { fn, retry: 0 })

  const [r2, r3] = await Promise.all([p2, p3])
  assert(secondAborted, 'Re-fetch: in-flight request was aborted')
  assert(r2 === 'aborted', 'Re-fetch: aborted promise returned abort')
  assert(r3 === 'result-3', 'Re-fetch: third fetch got fresh data')
  qc.clear()
}

// ── get() reads cache synchronously ──

{
  const qc = new QueryClient()
  assert(qc.get(['missing']) === undefined, 'get: undefined on miss')

  await qc.fetch(['exists'], { fn: async () => 42 })
  assert(qc.get(['exists']) === 42, 'get: returns cached data')
  qc.clear()
}

// ── set() writes cache manually ──

{
  const qc = new QueryClient({ staleTime: 5000 })
  qc.set(['manual'], { optimistic: true })
  assert(qc.get(['manual']).optimistic === true, 'set: data readable via get')

  // fetch should return cached data (still fresh)
  let called = false
  const result = await qc.fetch(['manual'], { fn: async () => { called = true; return 'new' } })
  assert(!called, 'set: fetch uses manually-set cache')
  assert(result.optimistic === true, 'set: fetch returned manual data')
  qc.clear()
}

// ── GC: expired entries cleaned on read ──

{
  const qc = new QueryClient({ staleTime: 5, gcTime: 10 })
  await qc.fetch(['gc-test'], { fn: async () => 'old' })
  assert(qc.get(['gc-test']) === 'old', 'GC: data present initially')

  await sleep(20) // staleTime(5) + gcTime(10) = 15ms

  assert(qc.get(['gc-test']) === undefined, 'GC: expired entry cleaned on get()')

  // fetch also cleans expired entries
  let calls = 0
  await qc.fetch(['gc-test'], { fn: async () => { calls++; return 'new' } })
  assert(calls === 1, 'GC: expired entry triggers fresh fetch')
  qc.clear()
}

// ── clear() cancels everything ──

{
  const qc = new QueryClient()
  qc.set(['a'], 1)
  qc.set(['b'], 2)
  qc.clear()
  assert(qc.get(['a']) === undefined, 'clear: cache emptied')
  assert(qc.get(['b']) === undefined, 'clear: all keys gone')
}

// ── Per-fetch option overrides ──

{
  const qc = new QueryClient({ staleTime: 60_000 })
  let calls = 0
  const fn = async () => ++calls

  await qc.fetch(['override'], { fn, staleTime: 10 }) // very short stale
  await sleep(20)
  await qc.fetch(['override'], { fn, staleTime: 10 })

  assert(calls === 2, 'Override: per-fetch staleTime respected')
  qc.clear()
}

// ── Custom retry delay (function) ──

{
  const qc = new QueryClient()
  const delays = []
  let attempts = 0
  const fn = async () => {
    attempts++
    if (attempts < 3) throw new Error('fail')
    return 'ok'
  }

  await qc.fetch(['custom-delay'], {
    fn,
    retry: 3,
    retryDelay: (attempt) => { delays.push(attempt); return 1 },
  })

  assert(delays.length === 2, 'Custom delay: called for each retry')
  assert(delays[0] === 0 && delays[1] === 1, 'Custom delay: receives attempt index')
  qc.clear()
}

// ── Pagination scenario: key change triggers new fetch, old key stays cached ──

{
  const qc = new QueryClient({ staleTime: 60_000 })
  let calls = 0
  const fetchPage = (page, perPage) =>
    qc.fetch(['users', page, perPage], {
      fn: async () => { calls++; return { page, perPage, data: [`user-${page}-${perPage}`] } }
    })

  // User is on page 1, 10 per page
  const d1 = await fetchPage(1, 10)
  assert(d1.page === 1 && d1.perPage === 10, 'Pagination: page 1/10 fetched')

  // User changes to 25 per page — new key, new fetch
  const d2 = await fetchPage(1, 25)
  assert(d2.perPage === 25, 'Pagination: page 1/25 fetched')
  assert(calls === 2, 'Pagination: 2 fetches (different keys)')

  // User switches back to 10 per page — cache hit!
  const d3 = await fetchPage(1, 10)
  assert(calls === 2, 'Pagination: switching back hits cache (still 2 fetches)')
  assert(d3 === d1, 'Pagination: same reference from cache')
  qc.clear()
}

// ── done ──

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
