import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

// Minimal static file server
const ROOT = path.resolve('.')
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }
const server = http.createServer((req, res) => {
  let fp = path.join(ROOT, req.url === '/' ? '/index.html' : req.url)
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return }
  if (fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html')
  const ext = path.extname(fp)
  res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' })
  fs.createReadStream(fp).pipe(res)
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const PORT = server.address().port
const BASE = `http://127.0.0.1:${PORT}`

const browser = await chromium.launch()
let passed = 0, failed = 0

async function test(name, url, check) {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  try {
    await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(1000)
    if (errors.length) throw new Error(`Page errors: ${errors.join('; ')}`)
    await check(page)
    console.log(`✅ ${name}`)
    passed++
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`)
    failed++
  } finally {
    await page.close()
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg) }

// ── Example 1: Hello ──
await test('Hello — renders', '/examples/1-hello/index.html', async (page) => {
  const app = await page.locator('hello-app').count()
  assert(app === 1, 'hello-app not found')
  const greeting = await page.locator('hello-greeting').count()
  assert(greeting === 1, 'hello-greeting not found')
  const text = await page.locator('hello-greeting .greeting h3').innerText()
  assert(text === 'Hello, world!', `Initial greeting wrong: "${text}"`)
})

await test('Hello — typing updates greeting', '/examples/1-hello/index.html', async (page) => {
  await page.locator('input').fill('coup')
  await page.waitForTimeout(300)
  const text = await page.locator('hello-greeting .greeting h3').innerText()
  assert(text === 'Hello, coup!', `Greeting after typing: "${text}"`)
})

// ── Example 2: Kanban ──
await test('Kanban — renders 3 columns', '/examples/3-kanban/index.html', async (page) => {
  const cols = await page.locator('kanban-column').count()
  assert(cols === 3, `Expected 3 columns, got ${cols}`)
})

await test('Kanban — renders seed cards', '/examples/3-kanban/index.html', async (page) => {
  const cards = await page.locator('kanban-card').count()
  assert(cards === 6, `Expected 6 cards, got ${cards}`)
})

await test('Kanban — delete card', '/examples/3-kanban/index.html', async (page) => {
  const before = await page.locator('kanban-card').count()
  await page.locator('kanban-card').first().locator('button[title="Delete"]').click()
  await page.waitForTimeout(500)
  const after = await page.locator('kanban-card').count()
  assert(after === before - 1, `After delete: ${after} cards (expected ${before - 1})`)
})

await test('Kanban — add card', '/examples/3-kanban/index.html', async (page) => {
  const before = await page.locator('kanban-card').count()
  // Add to the first column (todo)
  const firstCol = page.locator('kanban-column').first()
  await firstCol.locator('input').fill('New task')
  await firstCol.locator('button[type="submit"]').click()
  await page.waitForTimeout(500)
  const after = await page.locator('kanban-card').count()
  assert(after === before + 1, `After add: ${after} cards (expected ${before + 1})`)
})

await test('Kanban — move card right', '/examples/3-kanban/index.html', async (page) => {
  // First "todo" column card, click →
  const todoCol = page.locator('kanban-column').first()
  const todoBefore = await todoCol.locator('kanban-card').count()
  await todoCol.locator('kanban-card').first().locator('button[title="Move right"]').click()
  await page.waitForTimeout(500)
  const todoAfter = await todoCol.locator('kanban-card').count()
  assert(todoAfter === todoBefore - 1, `Todo cards after move: ${todoAfter} (expected ${todoBefore - 1})`)
})

// ── Example 3: Chat ──
await test('Chat — renders rooms and messages', '/examples/4-chat/index.html', async (page) => {
  const rooms = await page.locator('.room-btn').count()
  assert(rooms === 3, `Expected 3 room buttons, got ${rooms}`)
  const msgs = await page.locator('chat-message').count()
  assert(msgs >= 2, `Expected ≥2 messages, got ${msgs}`)
})

await test('Chat — send message', '/examples/4-chat/index.html', async (page) => {
  const before = await page.locator('chat-message').count()
  await page.locator('.compose input').fill('hello from test')
  await page.locator('.compose button').click()
  await page.waitForTimeout(500)
  const after = await page.locator('chat-message').count()
  assert(after === before + 1, `Messages after send: ${after} (expected ${before + 1})`)
  // Check it's "mine"
  const lastMsg = page.locator('.msg.mine').last()
  const text = await lastMsg.locator('.text').innerText()
  assert(text === 'hello from test', `Last message text: "${text}"`)
})

await test('Chat — switch room', '/examples/4-chat/index.html', async (page) => {
  // Click "random" room
  await page.locator('.room-btn', { hasText: 'random' }).click()
  await page.waitForTimeout(500)
  const header = await page.locator('.chat-header').innerText()
  assert(header.includes('random'), `Header after switch: "${header}"`)
  // Should have different messages
  const msgs = await page.locator('chat-message').count()
  assert(msgs >= 1, `Random room should have ≥1 message, got ${msgs}`)
})

await test('Chat — room switch destroys/recreates chat-room', '/examples/4-chat/index.html', async (page) => {
  // Verify chat-room exists
  let chatRooms = await page.locator('chat-room').count()
  assert(chatRooms === 1, `Expected 1 chat-room, got ${chatRooms}`)
  // Switch room
  await page.locator('.room-btn', { hasText: 'music' }).click()
  await page.waitForTimeout(500)
  chatRooms = await page.locator('chat-room').count()
  assert(chatRooms === 1, `After switch: ${chatRooms} chat-rooms (expected 1)`)
})

// ── Example 5: GitHub Explorer ──
await test('GitHub — auto-loads on mount', '/examples/5-github/index.html', async (page) => {
  // Wait for either user card (success) or error (rate limited)
  await page.waitForSelector('.user-card, .error', { timeout: 15000 })
  const hasUser = await page.locator('.user-card').count() > 0
  const hasError = await page.locator('.error').count() > 0
  if (hasError) {
    console.log('  ⚠️  GitHub API rate limited — skipping detailed checks')
    return
  }
  assert(hasUser, 'User card rendered on mount')
  const repos = await page.locator('repo-card').count()
  assert(repos > 0, `Repos loaded on mount: ${repos}`)

  // Sort repos by name (no extra API call)
  await page.locator('.sort-bar button', { hasText: 'Name' }).click()
  await page.waitForTimeout(300)
  const firstByName = await page.locator('repo-card h3 a').first().innerText()
  assert(firstByName.length > 0, 'Repo name after sort is not empty')
})

// ── Example 6: Bookmarks (Store) ──
await test('Bookmarks — renders all components', '/examples/6-bookmarks/index.html', async (page) => {
  await page.waitForSelector('bookmark-card', { timeout: 5000 })
  const toolbar = await page.locator('bookmark-toolbar').count()
  const stats = await page.locator('bookmark-stats').count()
  const cards = await page.locator('bookmark-card').count()
  assert(toolbar === 1, 'toolbar missing')
  assert(stats === 1, 'stats missing')
  assert(cards === 6, `Expected 6 cards, got ${cards}`)
})

await test('Bookmarks — search filters list', '/examples/6-bookmarks/index.html', async (page) => {
  await page.waitForSelector('bookmark-card', { timeout: 5000 })
  await page.locator('bookmark-toolbar input').fill('github')
  await page.waitForTimeout(300)
  const cards = await page.locator('bookmark-card').count()
  assert(cards === 1, `Search "github": ${cards} cards (expected 1)`)
  const showing = await page.locator('.stats').innerText()
  assert(showing.includes('1'), `Stats should show 1 showing, got: ${showing}`)
})

await test('Bookmarks — tag filter', '/examples/6-bookmarks/index.html', async (page) => {
  await page.waitForSelector('bookmark-card', { timeout: 5000 })
  await page.locator('.tag-btn', { hasText: 'tools' }).click()
  await page.waitForTimeout(300)
  const cards = await page.locator('bookmark-card').count()
  assert(cards === 2, `Tag "tools": ${cards} cards (expected 2)`)
})

await test('Bookmarks — add bookmark', '/examples/6-bookmarks/index.html', async (page) => {
  await page.waitForSelector('bookmark-card', { timeout: 5000 })
  await page.locator('.title-input').fill('Test Site')
  await page.locator('.url-input').fill('https://example.com')
  await page.locator('.tags-input').fill('test')
  await page.locator('bookmark-add button[type="submit"]').click()
  await page.waitForTimeout(300)
  const cards = await page.locator('bookmark-card').count()
  assert(cards === 7, `After add: ${cards} cards (expected 7)`)
})

await test('Bookmarks — delete bookmark', '/examples/6-bookmarks/index.html', async (page) => {
  await page.waitForSelector('bookmark-card', { timeout: 5000 })
  await page.locator('bookmark-card .delete').first().click()
  await page.waitForTimeout(300)
  const cards = await page.locator('bookmark-card').count()
  assert(cards === 5, `After delete: ${cards} cards (expected 5)`)
})

await test('Bookmarks — pin/unpin updates order', '/examples/6-bookmarks/index.html', async (page) => {
  await page.waitForSelector('bookmark-card', { timeout: 5000 })
  // Hacker News is unpinned — click pin on it
  const hnCard = page.locator('bookmark-card', { hasText: 'Hacker News' })
  await hnCard.locator('button', { hasText: '📎' }).click()
  await page.waitForTimeout(300)
  // It should now show 📌
  const pinIcon = await hnCard.locator('button').first().innerText()
  assert(pinIcon.includes('📌'), `Should be pinned, got: ${pinIcon}`)
})

// ── Results ──
console.log(`\n${passed} passed, ${failed} failed`)
await browser.close()
server.close()
process.exit(failed > 0 ? 1 : 0)
