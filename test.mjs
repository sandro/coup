import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { join, extname } from 'path'

const ROOT = new URL('.', import.meta.url).pathname
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' }

const server = createServer((req, res) => {
  const path = join(ROOT, req.url === '/' ? '/example/index.html' : req.url)
  if (!existsSync(path)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'text/plain' })
  res.end(readFileSync(path))
})

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const PORT = server.address().port
const BASE = `http://127.0.0.1:${PORT}`

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

const errors = []
page.on('pageerror', err => errors.push(err.message))

let failed = false
function assert(condition, msg) {
  if (!condition) { console.log('❌', msg); failed = true }
  else console.log('✅', msg)
}

await page.goto(`${BASE}/examples/2-tasks/index.html`)
await page.waitForTimeout(3000) // wait for CDN imports

if (errors.length > 0) {
  console.log('❌ Page errors:', errors)
  await browser.close(); server.close(); process.exit(1)
}

// Test 1: Initial render
const t1 = await page.locator('task-item').count()
assert(t1 === 3, `Initial render: ${t1} tasks (expected 3)`)

// Test 2: Task names
const names = await page.locator('.task-name').allInnerTexts()
assert(names[0] === 'Read coup source code', 'First task name correct')

// Test 3: Add a task
await page.locator('input[type="text"]').fill('New task')
await page.locator('button[type="submit"]').click()
await page.waitForTimeout(500)
const t3 = await page.locator('task-item').count()
assert(t3 === 4, `After add: ${t3} tasks (expected 4)`)

// Test 4: Keyed reorder — reverse
const idsBefore = await page.locator('.task-id').allInnerTexts()
await page.locator('button', { hasText: 'Reverse' }).click()
await page.waitForTimeout(500)
const idsAfter = await page.locator('.task-id').allInnerTexts()
assert(idsAfter[0] === idsBefore[idsBefore.length - 1], 'Reverse: first item was last')
assert(idsAfter[idsAfter.length - 1] === idsBefore[0], 'Reverse: last item was first')

// Test 5: Names follow their keys (proves keyed rendering)
const namesAfterReverse = await page.locator('.task-name').allInnerTexts()
assert(namesAfterReverse[0] === 'New task', 'Keyed: name follows ID after reverse')

// Double reverse restores original
await page.locator('button', { hasText: 'Reverse' }).click()
await page.waitForTimeout(500)
const namesRestored = await page.locator('.task-name').allInnerTexts()
assert(namesRestored[0] === 'Read coup source code', 'Double-reverse restores order')

// Test 6: Remove a task
await page.locator('task-item').first().locator('button[title="Remove"]').click()
await page.waitForTimeout(500)
const domAfterRemove = await page.locator('task-item').count()
assert(domAfterRemove === 3, `After remove: ${domAfterRemove} DOM items (expected 3)`)

// Verify correct item was removed
const namesAfterRemove = await page.locator('.task-name').allInnerTexts()
assert(namesAfterRemove[0] === 'Build a component', 'Correct item removed (first was "Read...")')

// Test 7: Move up
const preMove = await page.locator('.task-id').allInnerTexts()
await page.locator('task-item').nth(1).locator('button[title="Move up"]').click()
await page.waitForTimeout(500)
const postMove = await page.locator('.task-id').allInnerTexts()
assert(postMove[0] === preMove[1], 'Move up swapped items')

// Test 8: Shuffle stress
for (let i = 0; i < 5; i++) {
  await page.locator('button', { hasText: 'Shuffle' }).click()
  await page.waitForTimeout(200)
}
const afterShuffle = await page.locator('task-item').count()
assert(afterShuffle === 3, `After shuffles: ${afterShuffle} tasks (expected 3)`)

// Test 9: Static attrs (attributeChangedCallback)
const attrsResult = await page.evaluate(async () => {
  // Dynamically import and test inline
  const { CoupElement, html } = await import('coup')

  class AttrTest extends CoupElement {
    static tag = 'attr-test'
    static attrs = { label: String, count: Number, active: Boolean }
    template() {
      return html`<span>${this._attrs?.label ?? ''} ${this._attrs?.count ?? 0} ${this._attrs?.active ?? false}</span>`
    }
  }
  AttrTest.define()

  const el = document.createElement('attr-test')
  document.body.appendChild(el)

  // Wait for microtask render
  await new Promise(r => setTimeout(r, 50))

  // Set attrs
  el.setAttribute('label', 'hello')
  el.setAttribute('count', '42')
  el.setAttribute('active', '')
  await new Promise(r => setTimeout(r, 50))

  const text = el.textContent.trim()

  // Remove boolean attr
  el.removeAttribute('active')
  await new Promise(r => setTimeout(r, 50))
  const text2 = el.textContent.trim()

  el.remove()
  return { text, text2 }
})
assert(attrsResult.text === 'hello 42 true', `Static attrs: "${attrsResult.text}" (expected "hello 42 true")`)
assert(attrsResult.text2 === 'hello 42 false', `Boolean attr removed: "${attrsResult.text2}" (expected "hello 42 false")`)

// Test 10: Complete All
await page.locator('button', { hasText: 'Complete All' }).click()
await page.waitForTimeout(500)
const checkedCount = await page.locator('.task-item.done').count()
assert(checkedCount === 3, `Complete All: ${checkedCount} done (expected 3)`)

// Test 11: Static attrs with props (attr sets prop value)
const attrPropsResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  class AttrPropTest extends CoupElement {
    static tag = 'attr-prop-test'
    static attrs = { pid: String }
    static props = { pid: String }
    template() {
      return html`<span class="pid-val">${this.pid ?? 'none'}</span>`
    }
  }
  AttrPropTest.define()

  const el = document.createElement('attr-prop-test')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  el.setAttribute('pid', 'abc-123')
  await new Promise(r => setTimeout(r, 50))
  const t1 = el.querySelector('.pid-val')?.textContent

  // Change attr
  el.setAttribute('pid', 'xyz-789')
  await new Promise(r => setTimeout(r, 50))
  const t2 = el.querySelector('.pid-val')?.textContent

  el.remove()
  return { t1, t2 }
})
assert(attrPropsResult.t1 === 'abc-123', `Attr→prop initial: "${attrPropsResult.t1}" (expected "abc-123")`)
assert(attrPropsResult.t2 === 'xyz-789', `Attr→prop change: "${attrPropsResult.t2}" (expected "xyz-789")`)

// Summary
console.log('\n' + (failed ? '❌ SOME TESTS FAILED' : '🎉 All tests passed!'))

await browser.close()
server.close()
process.exit(failed ? 1 : 0)
