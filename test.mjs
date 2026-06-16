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

// Test 12: Debug mode — warns on state change without render()
const debugResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  CoupElement.debug = true

  const warnings = []
  const origWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))

  class DebugTest extends CoupElement {
    static tag = 'debug-test'
    state = { count: 0 }
    template() { return html`<span>${this.state.count}</span>` }
  }
  DebugTest.define()

  const el = document.createElement('debug-test')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  // Mutate state without calling render()
  el.state.count = 42
  await new Promise(r => setTimeout(r, 50))

  const staleWarning = warnings.some(w => w.includes('render() was not called'))

  // Now mutate and call render() — should NOT warn
  warnings.length = 0
  el.state.count = 99
  el.render()
  await new Promise(r => setTimeout(r, 50))

  const falseWarning = warnings.some(w => w.includes('render() was not called'))

  console.warn = origWarn
  CoupElement.debug = false
  el.remove()
  return { staleWarning, falseWarning }
})
assert(debugResult.staleWarning === true, 'Debug: warns on state change without render()')
assert(debugResult.falseWarning === false, 'Debug: no false warning when render() is called')

// Test 13: Debug mode — warns on undefined template return
const debugTplResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  CoupElement.debug = true
  const warnings = []
  const origWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))

  class BadTpl extends CoupElement {
    static tag = 'bad-tpl'
    template() { /* forgot return */ }
  }
  BadTpl.define()

  const el = document.createElement('bad-tpl')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  const undefinedWarning = warnings.some(w => w.includes('returned undefined'))

  console.warn = origWarn
  CoupElement.debug = false
  el.remove()
  return { undefinedWarning }
})
assert(debugTplResult.undefinedWarning === true, 'Debug: warns on undefined template return')

// Test 14: Debug mode — warns on same object reference prop set
const debugPropResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  CoupElement.debug = true
  const warnings = []
  const origWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))

  class PropRef extends CoupElement {
    static tag = 'prop-ref'
    static props = { data: Object }
    template() { return html`<span>${JSON.stringify(this.data)}</span>` }
  }
  PropRef.define()

  const el = document.createElement('prop-ref')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  const obj = { a: 1 }
  el.data = obj
  await new Promise(r => setTimeout(r, 50))

  // Set same reference — should warn
  warnings.length = 0
  obj.a = 2
  el.data = obj
  await new Promise(r => setTimeout(r, 50))

  const sameRefWarning = warnings.some(w => w.includes('same object reference'))

  console.warn = origWarn
  CoupElement.debug = false
  el.remove()
  return { sameRefWarning }
})
assert(debugPropResult.sameRefWarning === true, 'Debug: warns on same object reference prop set')

// Test 15: propsChanged fires once with all changes batched
const propsChangedResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  const calls = []

  class PropsBatch extends CoupElement {
    static tag = 'props-batch'
    static props = { a: String, b: String, c: Number }
    propsChanged(changes) {
      calls.push(structuredClone(changes))
    }
    template() { return html`<span>${this.a} ${this.b} ${this.c}</span>` }
  }
  PropsBatch.define()

  const el = document.createElement('props-batch')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  // Set all three props synchronously (like lit-html does in a render pass)
  el.a = 'hello'
  el.b = 'world'
  el.c = 42

  // Wait for microtask batch
  await new Promise(r => setTimeout(r, 50))

  el.remove()
  return { callCount: calls.length, changes: calls[0] }
})
assert(propsChangedResult.callCount === 1, `propsChanged called ${propsChangedResult.callCount} times (expected 1)`)
assert(propsChangedResult.changes.a?.new === 'hello', 'propsChanged has a')
assert(propsChangedResult.changes.b?.new === 'world', 'propsChanged has b')
assert(propsChangedResult.changes.c?.new === 42, 'propsChanged has c')

// Summary
console.log('\n' + (failed ? '❌ SOME TESTS FAILED' : '🎉 All tests passed!'))

await browser.close()
server.close()
process.exit(failed ? 1 : 0)
