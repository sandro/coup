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

// Test 14: Same object reference prop set — silently skips (no render, no warning)
// When a parent re-renders, lit-html re-assigns the same object to child props.
// This is normal and should not warn — it's indistinguishable from mutation.
const debugPropResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  CoupElement.debug = true
  const warnings = []
  const origWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))

  class PropRef extends CoupElement {
    static tag = 'prop-ref'
    static props = { data: Object }
    _renderCount = 0
    template() { this._renderCount++; return html`<span>${JSON.stringify(this.data)}</span>` }
  }
  PropRef.define()

  const el = document.createElement('prop-ref')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  const obj = { a: 1 }
  el.data = obj
  await new Promise(r => setTimeout(r, 50))
  const rendersAfterSet = el._renderCount

  // Set same reference — should silently skip, no warning
  warnings.length = 0
  el.data = obj
  await new Promise(r => setTimeout(r, 50))

  const noWarning = !warnings.some(w => w.includes('same object reference'))
  const noExtraRender = el._renderCount === rendersAfterSet

  console.warn = origWarn
  CoupElement.debug = false
  el.remove()
  return { noWarning, noExtraRender }
})
assert(debugPropResult.noWarning === true, 'Debug: no warning on same object reference prop set')
assert(debugPropResult.noExtraRender === true, 'Debug: no extra render on same object reference prop set')

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

// Test 16: propsChanged fires for initial props set before connection
const initialPropsResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')
  
  let received = null

  class InitProps extends CoupElement {
    static tag = 'init-props'
    static props = { name: String, count: Number }
    propsChanged(changes) { received = structuredClone(changes) }
    template() { return html`<span>${this.name} ${this.count}</span>` }
  }
  InitProps.define()

  const el = document.createElement('init-props')
  // Set props BEFORE adding to DOM (this is what lit-html does)
  el.name = 'hello'
  el.count = 42
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  el.remove()
  return { received }
})
assert(initialPropsResult.received !== null, 'propsChanged fired for initial props')
assert(initialPropsResult.received.name?.new === 'hello', 'initial props has name')
assert(initialPropsResult.received.count?.new === 42, 'initial props has count')

// Test 17: updated() fires after every render
const updatedResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  let updateCount = 0
  let domContent = null

  class UpdatedTest extends CoupElement {
    static tag = 'updated-test'
    state = { val: 'first' }
    updated() {
      updateCount++
      // DOM should reflect the latest render
      domContent = this.querySelector('span')?.textContent
    }
    template() { return html`<span>${this.state.val}</span>` }
  }
  UpdatedTest.define()

  const el = document.createElement('updated-test')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  const countAfterMount = updateCount

  el.state.val = 'second'
  el.render()
  await new Promise(r => setTimeout(r, 50))

  el.remove()
  return { countAfterMount, totalCount: updateCount, domContent }
})
assert(updatedResult.countAfterMount >= 1, `updated() fired on mount: ${updatedResult.countAfterMount}`)
assert(updatedResult.totalCount >= 2, `updated() fired again after render: ${updatedResult.totalCount}`)
assert(updatedResult.domContent === 'second', `DOM was current in updated(): "${updatedResult.domContent}"`)

// Test 18: storeChanged() callback on store subscription
const storeChangedResult = await page.evaluate(async () => {
  const { CoupElement, Store, html } = await import('coup')

  const testStore = new Store({ project: 'alpha' })
  const calls = []

  class StoreCallback extends CoupElement {
    static tag = 'store-callback'
    static subscribe = [testStore]
    storeChanged(store, newState) {
      calls.push({ store: store === testStore, project: newState.project })
      // Component decides when to render
      this.render()
    }
    template() { return html`<span>${testStore.state.project}</span>` }
  }
  StoreCallback.define()

  const el = document.createElement('store-callback')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  testStore.set({ project: 'beta' })
  await new Promise(r => setTimeout(r, 50))

  testStore.set({ project: 'gamma' })
  await new Promise(r => setTimeout(r, 50))

  el.remove()
  return { callCount: calls.length, lastProject: calls[calls.length - 1]?.project, storeMatch: calls[0]?.store }
})
assert(storeChangedResult.callCount === 2, `storeChanged called ${storeChangedResult.callCount} times (expected 2)`)
assert(storeChangedResult.lastProject === 'gamma', `Last project: ${storeChangedResult.lastProject}`)
assert(storeChangedResult.storeMatch === true, 'storeChanged receives the correct store reference')

// =========================================================================
// Hector edge-case tests — issues discovered when building a real app
// =========================================================================

// Test 19: Array-style static props create working getters/setters
const arrayPropsResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  class ArrayProps extends CoupElement {
    static tag = 'array-props'
    static props = ['title', 'count']
    template() { return html`<span>${this.title}-${this.count}</span>` }
  }
  ArrayProps.define()

  const el = document.createElement('array-props')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  el.title = 'hello'
  el.count = 42
  await new Promise(r => setTimeout(r, 50))

  const text = el.querySelector('span')?.textContent
  el.remove()
  return { text }
})
assert(arrayPropsResult.text === 'hello-42', `Array-style props render: "${arrayPropsResult.text}" (expected "hello-42")`)

// Test 20: Array-style props fire propsChanged with initial values
const arrayPropsInitialResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  let received = null

  class ArrayPropsInit extends CoupElement {
    static tag = 'array-props-init'
    static props = ['name', 'value']
    propsChanged(changes) { received = structuredClone(changes) }
    template() { return html`<span>${this.name}=${this.value}</span>` }
  }
  ArrayPropsInit.define()

  const el = document.createElement('array-props-init')
  el.name = 'color'
  el.value = 'red'
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  el.remove()
  return { received }
})
assert(arrayPropsInitialResult.received !== null, 'Array props: propsChanged fired for initial props')
assert(arrayPropsInitialResult.received.name?.new === 'color', 'Array props: initial name correct')
assert(arrayPropsInitialResult.received.value?.new === 'red', 'Array props: initial value correct')

// Test 21: propsChanged does NOT re-fire on reconnection (keyed list reorder)
const reconnectResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  const calls = []

  class ReconnectTest extends CoupElement {
    static tag = 'reconnect-test'
    static props = { data: String }
    propsChanged(changes) { calls.push(structuredClone(changes)) }
    template() { return html`<span>${this.data}</span>` }
  }
  ReconnectTest.define()

  const el = document.createElement('reconnect-test')
  el.data = 'hello'
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  const callsAfterMount = calls.length

  // Disconnect and reconnect (simulates keyed list reorder)
  el.remove()
  await new Promise(r => setTimeout(r, 50))
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  el.remove()
  return { callsAfterMount, totalCalls: calls.length }
})
assert(reconnectResult.callsAfterMount === 1, `propsChanged fired once on mount: ${reconnectResult.callsAfterMount}`)
assert(reconnectResult.totalCalls === 1, `propsChanged NOT re-fired on reconnect: ${reconnectResult.totalCalls} (expected 1)`)

// Test 22: updated() does NOT fire when template() throws
const updatedErrorResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  let updatedFired = false
  const origError = console.error
  console.error = () => {} // suppress expected error

  class BadTemplate extends CoupElement {
    static tag = 'bad-template'
    template() { throw new Error('intentional') }
    updated() { updatedFired = true }
  }
  BadTemplate.define()

  const el = document.createElement('bad-template')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  console.error = origError
  el.remove()
  return { updatedFired }
})
assert(updatedErrorResult.updatedFired === false, 'updated() does NOT fire after template() error')

// Test 23: storeChanged + _scheduleRender doesn't double-render
const doubleRenderResult = await page.evaluate(async () => {
  const { CoupElement, Store, html } = await import('coup')

  const store = new Store({ v: 0 })
  let renderCount = 0

  class DoubleRender extends CoupElement {
    static tag = 'double-render'
    static subscribe = [store]
    storeChanged(s, state) {
      // Component calls this.render() in storeChanged — old bug caused
      // _scheduleRender to fire a second render
      this.render()
    }
    template() {
      renderCount++
      return html`<span>${store.state.v}</span>`
    }
  }
  DoubleRender.define()

  const el = document.createElement('double-render')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  const rendersBefore = renderCount
  store.set({ v: 1 })
  await new Promise(r => setTimeout(r, 100))

  const rendersAfterUpdate = renderCount - rendersBefore
  el.remove()
  return { rendersAfterUpdate }
})
assert(doubleRenderResult.rendersAfterUpdate === 1, `Store update + storeChanged render: ${doubleRenderResult.rendersAfterUpdate} renders (expected 1)`)

// Test 24: Store subscription auto-renders without storeChanged
const autoRenderResult = await page.evaluate(async () => {
  const { CoupElement, Store, html } = await import('coup')

  const store = new Store({ label: 'init' })

  class AutoRender extends CoupElement {
    static tag = 'auto-render'
    static subscribe = [store]
    // No storeChanged — should still auto-render
    template() { return html`<span class="ar">${store.state.label}</span>` }
  }
  AutoRender.define()

  const el = document.createElement('auto-render')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  const t1 = el.querySelector('.ar')?.textContent

  store.set({ label: 'updated' })
  await new Promise(r => setTimeout(r, 100))

  const t2 = el.querySelector('.ar')?.textContent
  el.remove()
  return { t1, t2 }
})
assert(autoRenderResult.t1 === 'init', `Auto-render initial: "${autoRenderResult.t1}"`)
assert(autoRenderResult.t2 === 'updated', `Auto-render after store change: "${autoRenderResult.t2}"`)

// Test 25: Disconnection cleans up store subscriptions
const disconnectSubResult = await page.evaluate(async () => {
  const { CoupElement, Store, html } = await import('coup')

  const store = new Store({ x: 0 })
  let storeChangedAfterDisconnect = false

  class DisconnectSub extends CoupElement {
    static tag = 'disconnect-sub'
    static subscribe = [store]
    storeChanged(s, state) {
      storeChangedAfterDisconnect = true
    }
    template() { return html`<span>${store.state.x}</span>` }
  }
  DisconnectSub.define()

  const el = document.createElement('disconnect-sub')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  // Disconnect
  el.remove()
  await new Promise(r => setTimeout(r, 50))

  // Reset flag
  storeChangedAfterDisconnect = false

  // Update store after disconnect — should NOT trigger storeChanged
  store.set({ x: 99 })
  await new Promise(r => setTimeout(r, 100))

  return { storeChangedAfterDisconnect }
})
assert(disconnectSubResult.storeChangedAfterDisconnect === false, 'Store subscription cleaned up on disconnect')

// Test 26: Multiple stores — storeChanged identifies which store changed
const multiStoreResult = await page.evaluate(async () => {
  const { CoupElement, Store, html } = await import('coup')

  const storeA = new Store({ a: 1 })
  const storeB = new Store({ b: 2 })
  const calls = []

  class MultiStore extends CoupElement {
    static tag = 'multi-store'
    static subscribe = [storeA, storeB]
    storeChanged(store, state) {
      if (store === storeA) calls.push({ which: 'A', state: structuredClone(state) })
      if (store === storeB) calls.push({ which: 'B', state: structuredClone(state) })
    }
    template() { return html`<span>${storeA.state.a}-${storeB.state.b}</span>` }
  }
  MultiStore.define()

  const el = document.createElement('multi-store')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  storeA.set({ a: 10 })
  await new Promise(r => setTimeout(r, 50))

  storeB.set({ b: 20 })
  await new Promise(r => setTimeout(r, 50))

  el.remove()
  return { calls }
})
assert(multiStoreResult.calls.length === 2, `Multi-store: ${multiStoreResult.calls.length} calls (expected 2)`)
assert(multiStoreResult.calls[0].which === 'A' && multiStoreResult.calls[0].state.a === 10, 'Multi-store: storeA identified')
assert(multiStoreResult.calls[1].which === 'B' && multiStoreResult.calls[1].state.b === 20, 'Multi-store: storeB identified')

// Test 27: Prop change detection — same value doesn't trigger render
const sameValueResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  let renderCount = 0

  class SameValue extends CoupElement {
    static tag = 'same-value'
    static props = { name: String }
    template() {
      renderCount++
      return html`<span>${this.name}</span>`
    }
  }
  SameValue.define()

  const el = document.createElement('same-value')
  document.body.appendChild(el)
  el.name = 'hello'
  await new Promise(r => setTimeout(r, 100))

  const countBefore = renderCount

  // Set same value — should NOT trigger render
  el.name = 'hello'
  await new Promise(r => setTimeout(r, 100))

  el.remove()
  return { countBefore, countAfter: renderCount }
})
assert(sameValueResult.countBefore === sameValueResult.countAfter, `Same value skip: renders before=${sameValueResult.countBefore} after=${sameValueResult.countAfter}`)

// Test 28: Global events bind and unbind correctly
const eventsResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  const received = []

  class EventTest extends CoupElement {
    static tag = 'event-test'
    static events = { 'test-global-evt': 'onTestEvt' }
    onTestEvt(e) { received.push(e.detail) }
    template() { return html`<span>events</span>` }
  }
  EventTest.define()

  const el = document.createElement('event-test')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  // Fire event while connected
  window.dispatchEvent(new CustomEvent('test-global-evt', { detail: 'a' }))
  await new Promise(r => setTimeout(r, 50))

  // Disconnect
  el.remove()
  await new Promise(r => setTimeout(r, 50))

  // Fire event after disconnect — should NOT be received
  window.dispatchEvent(new CustomEvent('test-global-evt', { detail: 'b' }))
  await new Promise(r => setTimeout(r, 50))

  return { received }
})
assert(eventsResult.received.length === 1, `Events: ${eventsResult.received.length} received (expected 1)`)
assert(eventsResult.received[0] === 'a', 'Events: received while connected')

// Test 29: emit() dispatches CustomEvent on window
const emitResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  let receivedDetail = null

  class EmitTest extends CoupElement {
    static tag = 'emit-test'
    template() { return html`<span>emit</span>` }
  }
  EmitTest.define()

  const el = document.createElement('emit-test')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  window.addEventListener('my-custom-evt', e => { receivedDetail = e.detail }, { once: true })
  el.emit('my-custom-evt', { foo: 'bar' })
  await new Promise(r => setTimeout(r, 50))

  el.remove()
  return { receivedDetail }
})
assert(emitResult.receivedDetail?.foo === 'bar', `emit() dispatches event with detail: ${JSON.stringify(emitResult.receivedDetail)}`)

// Test 30: Store.set with function updater
const storeFnResult = await page.evaluate(async () => {
  const { Store } = await import('coup')

  const store = new Store({ count: 5 })
  store.set(s => ({ count: s.count + 10 }))
  const after = store.state.count

  // Ensure previous state is preserved
  store.set(s => ({ count: s.count * 2 }))
  const after2 = store.state.count

  return { after, after2 }
})
assert(storeFnResult.after === 15, `Store fn updater: ${storeFnResult.after} (expected 15)`)
assert(storeFnResult.after2 === 30, `Store fn chained: ${storeFnResult.after2} (expected 30)`)

// Test 31: Store.set preserves other keys (shallow merge)
const storeMergeResult = await page.evaluate(async () => {
  const { Store } = await import('coup')

  const store = new Store({ a: 1, b: 2, c: 3 })
  store.set({ b: 20 })
  return { state: structuredClone(store.state) }
})
assert(storeMergeResult.state.a === 1, 'Store merge: a preserved')
assert(storeMergeResult.state.b === 20, 'Store merge: b updated')
assert(storeMergeResult.state.c === 3, 'Store merge: c preserved')

// Test 32: Store unsubscribe works
const storeUnsubResult = await page.evaluate(async () => {
  const { Store } = await import('coup')

  const store = new Store({ x: 0 })
  let callCount = 0
  const unsub = store.subscribe(() => callCount++)

  store.set({ x: 1 })
  const countBefore = callCount

  unsub()
  store.set({ x: 2 })

  return { countBefore, countAfter: callCount }
})
assert(storeUnsubResult.countBefore === 1, 'Store unsub: called before unsub')
assert(storeUnsubResult.countAfter === 1, 'Store unsub: not called after unsub')

// Test 33: Async storeChanged — no render until component calls this.render()
const asyncStoreResult = await page.evaluate(async () => {
  const { CoupElement, Store, html } = await import('coup')

  const store = new Store({ status: 'idle' })
  let renderCount = 0
  let renderSnapshots = []

  class AsyncStore extends CoupElement {
    static tag = 'async-store'
    static subscribe = [store]
    async storeChanged(s, state) {
      // Simulate async work (e.g. fetch from IndexedDB)
      await new Promise(r => setTimeout(r, 80))
      this.render()
    }
    template() {
      renderCount++
      renderSnapshots.push(store.state.status)
      return html`<span>${store.state.status}</span>`
    }
  }
  AsyncStore.define()

  const el = document.createElement('async-store')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  const rendersAfterMount = renderCount

  store.set({ status: 'loading' })

  // Check immediately — should NOT have rendered yet (async work pending)
  await new Promise(r => setTimeout(r, 20))
  const rendersDuring = renderCount

  // Wait for async work to complete
  await new Promise(r => setTimeout(r, 150))
  const rendersAfter = renderCount
  const text = el.querySelector('span')?.textContent

  el.remove()
  return { rendersAfterMount, rendersDuring, rendersAfter, text, renderSnapshots }
})
assert(asyncStoreResult.rendersDuring === asyncStoreResult.rendersAfterMount,
  `Async storeChanged: no render during async work (${asyncStoreResult.rendersDuring} === ${asyncStoreResult.rendersAfterMount})`)
assert(asyncStoreResult.rendersAfter === asyncStoreResult.rendersAfterMount + 1,
  `Async storeChanged: exactly 1 render after async (${asyncStoreResult.rendersAfter})`)
assert(asyncStoreResult.text === 'loading', `Async storeChanged: DOM updated to "loading"`)

// Test 34: storeChanged without this.render() — no render happens
const noRenderResult = await page.evaluate(async () => {
  const { CoupElement, Store, html } = await import('coup')

  const store = new Store({ v: 0 })
  let renderCount = 0
  const sideEffects = []

  class NoRenderStore extends CoupElement {
    static tag = 'no-render-store'
    static subscribe = [store]
    storeChanged(s, state) {
      // Just record the change, don't render
      sideEffects.push(state.v)
    }
    template() {
      renderCount++
      return html`<span>${store.state.v}</span>`
    }
  }
  NoRenderStore.define()

  const el = document.createElement('no-render-store')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  const rendersAfterMount = renderCount

  store.set({ v: 1 })
  store.set({ v: 2 })
  await new Promise(r => setTimeout(r, 100))

  el.remove()
  return { rendersAfterMount, rendersTotal: renderCount, sideEffects }
})
assert(noRenderResult.rendersTotal === noRenderResult.rendersAfterMount,
  `storeChanged without render(): no extra renders (${noRenderResult.rendersTotal} === ${noRenderResult.rendersAfterMount})`)
assert(noRenderResult.sideEffects.length === 2, `storeChanged without render(): side effects recorded (${noRenderResult.sideEffects})`)
assert(noRenderResult.sideEffects[0] === 1 && noRenderResult.sideEffects[1] === 2, 'storeChanged without render(): correct values')

// Test 35: Async storeChanged — multiple rapid store updates, only last render wins
const asyncBatchResult = await page.evaluate(async () => {
  const { CoupElement, Store, html } = await import('coup')

  const store = new Store({ page: 'a' })
  let renderCount = 0

  class AsyncBatch extends CoupElement {
    static tag = 'async-batch'
    static subscribe = [store]
    async storeChanged(s, state) {
      await new Promise(r => setTimeout(r, 50))
      this.render()
    }
    template() {
      renderCount++
      return html`<span class="ab">${store.state.page}</span>`
    }
  }
  AsyncBatch.define()

  const el = document.createElement('async-batch')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  const rendersAfterMount = renderCount

  // Rapid-fire store updates
  store.set({ page: 'b' })
  store.set({ page: 'c' })
  store.set({ page: 'd' })

  // Wait for all async storeChanged to resolve
  await new Promise(r => setTimeout(r, 200))

  const text = el.querySelector('.ab')?.textContent

  el.remove()
  return { rendersAfterMount, rendersTotal: renderCount, text }
})
assert(asyncBatchResult.text === 'd', `Async batch: final DOM shows "d" (got "${asyncBatchResult.text}")`)
// Each store.set triggers a separate storeChanged, each awaits and renders — 3 renders
assert(asyncBatchResult.rendersTotal === asyncBatchResult.rendersAfterMount + 3,
  `Async batch: 3 renders for 3 updates (${asyncBatchResult.rendersTotal - asyncBatchResult.rendersAfterMount})`)

// =========================================================================
// firstUpdated() tests
// =========================================================================

// Test 36: firstUpdated fires once after first render
const firstUpdatedResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  let firstUpdatedCount = 0
  let updatedCount = 0
  let domInFirstUpdated = null

  class FirstUpdatedTest extends CoupElement {
    static tag = 'first-updated-test'
    state = { val: 'initial' }
    firstUpdated() {
      firstUpdatedCount++
      domInFirstUpdated = this.querySelector('span')?.textContent
    }
    updated() { updatedCount++ }
    template() { return html`<span>${this.state.val}</span>` }
  }
  FirstUpdatedTest.define()

  const el = document.createElement('first-updated-test')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  const firstUpdatedAfterMount = firstUpdatedCount
  const updatedAfterMount = updatedCount

  // Trigger additional renders
  el.state.val = 'second'
  el.render()
  await new Promise(r => setTimeout(r, 50))

  el.state.val = 'third'
  el.render()
  await new Promise(r => setTimeout(r, 50))

  el.remove()
  return {
    firstUpdatedAfterMount,
    firstUpdatedTotal: firstUpdatedCount,
    updatedTotal: updatedCount,
    domInFirstUpdated
  }
})
assert(firstUpdatedResult.firstUpdatedAfterMount === 1, 'firstUpdated: fired on first render')
assert(firstUpdatedResult.firstUpdatedTotal === 1, `firstUpdated: fired exactly once (${firstUpdatedResult.firstUpdatedTotal})`)
assert(firstUpdatedResult.updatedTotal >= 3, `updated: fired on every render (${firstUpdatedResult.updatedTotal})`)
assert(firstUpdatedResult.domInFirstUpdated === 'initial', `firstUpdated: DOM was populated ("${firstUpdatedResult.domInFirstUpdated}")`)

// Test 37: firstUpdated does NOT re-fire on reconnection
const firstUpdatedReconnectResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  let count = 0

  class FirstUpdatedReconnect extends CoupElement {
    static tag = 'first-updated-reconnect'
    firstUpdated() { count++ }
    template() { return html`<span>hi</span>` }
  }
  FirstUpdatedReconnect.define()

  const el = document.createElement('first-updated-reconnect')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  el.remove()
  await new Promise(r => setTimeout(r, 50))
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  el.remove()
  return { count }
})
assert(firstUpdatedReconnectResult.count === 1, `firstUpdated: not re-fired on reconnect (${firstUpdatedReconnectResult.count})`)

// Test 38: firstUpdated fires before updated on first render
const firstUpdatedOrderResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  const order = []

  class FirstUpdatedOrder extends CoupElement {
    static tag = 'first-updated-order'
    firstUpdated() { order.push('firstUpdated') }
    updated() { order.push('updated') }
    template() { return html`<span>order</span>` }
  }
  FirstUpdatedOrder.define()

  const el = document.createElement('first-updated-order')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  el.remove()
  return { order }
})
assert(firstUpdatedOrderResult.order[0] === 'firstUpdated', 'firstUpdated fires before updated')
assert(firstUpdatedOrderResult.order[1] === 'updated', 'updated fires after firstUpdated')

// =========================================================================
// static state tests
// =========================================================================

// Test 39: static state creates reactive getters/setters with auto-render
const staticStateResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  let renderCount = 0

  class StaticStateTest extends CoupElement {
    static tag = 'static-state-test'
    static state = { count: 0, label: 'ready' }
    template() {
      renderCount++
      return html`<span>${this.count} ${this.label}</span>`
    }
  }
  StaticStateTest.define()

  const el = document.createElement('static-state-test')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  const textAfterMount = el.querySelector('span')?.textContent
  const rendersAfterMount = renderCount

  el.count = 5
  el.label = 'done'
  await new Promise(r => setTimeout(r, 100))

  const textAfterUpdate = el.querySelector('span')?.textContent
  const rendersAfterUpdate = renderCount

  el.remove()
  return { textAfterMount, textAfterUpdate, rendersAfterMount, rendersAfterUpdate }
})
assert(staticStateResult.textAfterMount === '0 ready', `static state defaults: "${staticStateResult.textAfterMount}"`)
assert(staticStateResult.textAfterUpdate === '5 done', `static state updated: "${staticStateResult.textAfterUpdate}"`)

// Test 40: static state batches multiple changes into one render
const stateBatchResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  let renderCount = 0

  class StateBatch extends CoupElement {
    static tag = 'state-batch'
    static state = { a: 0, b: 0, c: 0 }
    template() {
      renderCount++
      return html`<span>${this.a}-${this.b}-${this.c}</span>`
    }
  }
  StateBatch.define()

  const el = document.createElement('state-batch')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  const rendersBefore = renderCount

  // Set three state properties synchronously — should batch into one render
  el.a = 1
  el.b = 2
  el.c = 3
  await new Promise(r => setTimeout(r, 100))

  const rendersAfter = renderCount
  const text = el.querySelector('span')?.textContent

  el.remove()
  return { rendersBefore, rendersAfter, text }
})
assert(stateBatchResult.rendersAfter - stateBatchResult.rendersBefore === 1,
  `static state batching: ${stateBatchResult.rendersAfter - stateBatchResult.rendersBefore} renders (expected 1)`)
assert(stateBatchResult.text === '1-2-3', `static state batch result: "${stateBatchResult.text}"`)

// Test 41: static state same-value check skips render
const stateSameValueResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  let renderCount = 0

  class StateSameValue extends CoupElement {
    static tag = 'state-same-value'
    static state = { count: 42 }
    template() {
      renderCount++
      return html`<span>${this.count}</span>`
    }
  }
  StateSameValue.define()

  const el = document.createElement('state-same-value')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  const rendersBefore = renderCount

  el.count = 42 // same value
  await new Promise(r => setTimeout(r, 100))

  el.remove()
  return { rendersBefore, rendersAfter: renderCount }
})
assert(stateSameValueResult.rendersBefore === stateSameValueResult.rendersAfter,
  `static state same value: no extra render (${stateSameValueResult.rendersBefore} === ${stateSameValueResult.rendersAfter})`)

// Test 42: stateChanged callback fires with batched changes
const stateChangedResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  const calls = []

  class StateChangedTest extends CoupElement {
    static tag = 'state-changed-test'
    static state = { x: 0, y: 0 }
    stateChanged(changes) {
      calls.push(structuredClone(changes))
    }
    template() { return html`<span>${this.x}-${this.y}</span>` }
  }
  StateChangedTest.define()

  const el = document.createElement('state-changed-test')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  el.x = 10
  el.y = 20
  await new Promise(r => setTimeout(r, 100))

  el.remove()
  return { callCount: calls.length, changes: calls[0] }
})
assert(stateChangedResult.callCount === 1, `stateChanged: ${stateChangedResult.callCount} calls (expected 1)`)
assert(stateChangedResult.changes.x?.old === 0 && stateChangedResult.changes.x?.new === 10, 'stateChanged: x change correct')
assert(stateChangedResult.changes.y?.old === 0 && stateChangedResult.changes.y?.new === 20, 'stateChanged: y change correct')

// Test 43: static state collision with static props throws error
const collisionResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  // Test collision detection directly — _setupProps then _setupState
  // by checking that the constructor logic works
  class Collision extends CoupElement {
    static tag = 'collision-test-43'
    static props = { name: String }
    static state = { name: '' }
    template() { return html`<span>${this.name}</span>` }
  }
  Collision.define()

  let threw = false
  let message = ''
  const errors = []
  const origError = console.error
  
  // Listen for the error thrown during construction
  try {
    const el = document.createElement('collision-test-43')
    // If we get here, check if the error was caught internally
    // The browser may catch constructor errors in createElement
    threw = false
  } catch (e) {
    threw = true
    message = e.message
  }

  // Alternative: test _setupState directly
  if (!threw) {
    try {
      // Call _setupState manually on a fresh instance to test the guard
      const TestClass = class extends CoupElement {
        static tag = 'collision-direct-43'
        static props = { foo: String }
        static state = { foo: 0 }
      }
      // _setupProps runs in super constructor, then _setupState
      // We can test the guard by checking _props
      const proto = TestClass.prototype
      const instance = Object.create(proto)
      instance._props = { foo: undefined }
      instance.constructor = TestClass
      instance._state_vals = undefined
      // Manually call _setupState
      instance._setupState()
      threw = false
    } catch (e) {
      threw = true
      message = e.message
    }
  }

  return { threw, message }
})
assert(collisionResult.threw === true, `Collision: throws on prop/state name conflict (threw: ${collisionResult.threw})`)
assert(collisionResult.threw && collisionResult.message && collisionResult.message.includes('both static props and static state'),
  `Collision message: "${collisionResult.message}"`)

// Test 44: static state coexists with manual this.state
const coexistResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  class Coexist extends CoupElement {
    static tag = 'coexist-test'
    static state = { reactiveCount: 0 }
    state = { manualFlag: false }

    template() {
      return html`<span>${this.reactiveCount}-${this.state.manualFlag}</span>`
    }
  }
  Coexist.define()

  const el = document.createElement('coexist-test')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  const textBefore = el.querySelector('span')?.textContent

  // Reactive state auto-renders
  el.reactiveCount = 5
  await new Promise(r => setTimeout(r, 100))
  const textAfterReactive = el.querySelector('span')?.textContent

  // Manual state needs explicit render
  el.state.manualFlag = true
  await new Promise(r => setTimeout(r, 100))
  const textWithoutRender = el.querySelector('span')?.textContent

  el.render()
  await new Promise(r => setTimeout(r, 50))
  const textAfterManualRender = el.querySelector('span')?.textContent

  el.remove()
  return { textBefore, textAfterReactive, textWithoutRender, textAfterManualRender }
})
assert(coexistResult.textBefore === '0-false', `Coexist initial: "${coexistResult.textBefore}"`)
assert(coexistResult.textAfterReactive === '5-false', `Coexist after reactive: "${coexistResult.textAfterReactive}"`)
assert(coexistResult.textWithoutRender === '5-false', `Coexist manual without render: stale ("${coexistResult.textWithoutRender}")`)
assert(coexistResult.textAfterManualRender === '5-true', `Coexist after manual render: "${coexistResult.textAfterManualRender}"`)

// Test 45: static state with type declarations (Number, String, Boolean) — init as undefined
const stateTypesResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  class StateTypes extends CoupElement {
    static tag = 'state-types'
    static state = { count: Number, label: String, active: Boolean }
    template() {
      return html`<span>${this.count}-${this.label}-${this.active}</span>`
    }
  }
  StateTypes.define()

  const el = document.createElement('state-types')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  const textBefore = el.querySelector('span')?.textContent

  el.count = 42
  el.label = 'hi'
  el.active = true
  await new Promise(r => setTimeout(r, 100))

  const textAfter = el.querySelector('span')?.textContent

  el.remove()
  return { textBefore, textAfter }
})
assert(stateTypesResult.textBefore === '--', `State types init undefined (renders empty): "${stateTypesResult.textBefore}"`)
assert(stateTypesResult.textAfter === '42-hi-true', `State types after set: "${stateTypesResult.textAfter}"`)

// Test 46: static state array form
const stateArrayResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  class StateArray extends CoupElement {
    static tag = 'state-array'
    static state = ['count', 'label']
    template() {
      return html`<span>${this.count ?? 'none'}-${this.label ?? 'none'}</span>`
    }
  }
  StateArray.define()

  const el = document.createElement('state-array')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  const textBefore = el.querySelector('span')?.textContent

  el.count = 10
  el.label = 'test'
  await new Promise(r => setTimeout(r, 100))

  const textAfter = el.querySelector('span')?.textContent

  el.remove()
  return { textBefore, textAfter }
})
assert(stateArrayResult.textBefore === 'none-none', `State array init: "${stateArrayResult.textBefore}"`)
assert(stateArrayResult.textAfter === '10-test', `State array after set: "${stateArrayResult.textAfter}"`)

// Test 47: stateChanged can trigger additional reactive state (batched together)
const stateChangedDerivedResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  let renderCount = 0

  class StateChangedDerived extends CoupElement {
    static tag = 'state-changed-derived'
    static state = { messages: 0, userHasScrolled: true }
    stateChanged(changes) {
      if ('messages' in changes) {
        this.userHasScrolled = false // derived state change
      }
    }
    template() {
      renderCount++
      return html`<span>${this.messages}-${this.userHasScrolled}</span>`
    }
  }
  StateChangedDerived.define()

  const el = document.createElement('state-changed-derived')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  const rendersBefore = renderCount

  el.messages = 5
  await new Promise(r => setTimeout(r, 100))

  const text = el.querySelector('span')?.textContent

  el.remove()
  return { text, rendersBefore, rendersAfter: renderCount }
})
assert(stateChangedDerivedResult.text === '5-false', `stateChanged derived: "${stateChangedDerivedResult.text}"`)

// Test 48: firstUpdated works with static state
const firstUpdatedWithStateResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  let firstUpdatedVal = null

  class FirstUpdatedState extends CoupElement {
    static tag = 'first-updated-state'
    static state = { count: 42 }
    firstUpdated() {
      firstUpdatedVal = this.querySelector('span')?.textContent
    }
    template() { return html`<span>${this.count}</span>` }
  }
  FirstUpdatedState.define()

  const el = document.createElement('first-updated-state')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 100))

  el.remove()
  return { firstUpdatedVal }
})
assert(firstUpdatedWithStateResult.firstUpdatedVal === '42', `firstUpdated with static state: "${firstUpdatedWithStateResult.firstUpdatedVal}"`)

// =========================================================================
// Shallow equality tests
// =========================================================================

// Test 49: Prop set with equivalent array skips render
const shallowArrayResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  let renderCount = 0

  class ShallowArray extends CoupElement {
    static tag = 'shallow-array'
    static props = { items: Array }
    template() {
      renderCount++
      return html`<span>${(this.items || []).join(',')}</span>`
    }
  }
  ShallowArray.define()

  const el = document.createElement('shallow-array')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  const a = { id: 1 }
  const b = { id: 2 }
  el.items = [a, b]
  await new Promise(r => setTimeout(r, 50))
  const rendersAfterFirst = renderCount

  // Set a new array with the same items — should skip
  el.items = [a, b]
  await new Promise(r => setTimeout(r, 50))
  const rendersAfterSame = renderCount

  // Set a different array — should render
  el.items = [a]
  await new Promise(r => setTimeout(r, 50))
  const rendersAfterDiff = renderCount

  el.remove()
  return { rendersAfterFirst, rendersAfterSame, rendersAfterDiff }
})
assert(shallowArrayResult.rendersAfterSame === shallowArrayResult.rendersAfterFirst,
  `Shallow array: same items skips render (${shallowArrayResult.rendersAfterSame} === ${shallowArrayResult.rendersAfterFirst})`)
assert(shallowArrayResult.rendersAfterDiff === shallowArrayResult.rendersAfterFirst + 1,
  `Shallow array: different items triggers render`)

// Test 50: Prop set with equivalent plain object skips render
const shallowObjResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  let renderCount = 0

  class ShallowObj extends CoupElement {
    static tag = 'shallow-obj'
    static props = { data: Object }
    template() {
      renderCount++
      return html`<span>${JSON.stringify(this.data)}</span>`
    }
  }
  ShallowObj.define()

  const el = document.createElement('shallow-obj')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  el.data = { name: 'Ada', age: 30 }
  await new Promise(r => setTimeout(r, 50))
  const rendersAfterFirst = renderCount

  // Same shape, same values — should skip
  el.data = { name: 'Ada', age: 30 }
  await new Promise(r => setTimeout(r, 50))
  const rendersAfterSame = renderCount

  // Different value — should render
  el.data = { name: 'Ada', age: 31 }
  await new Promise(r => setTimeout(r, 50))
  const rendersAfterDiff = renderCount

  el.remove()
  return { rendersAfterFirst, rendersAfterSame, rendersAfterDiff }
})
assert(shallowObjResult.rendersAfterSame === shallowObjResult.rendersAfterFirst,
  `Shallow object: same values skips render (${shallowObjResult.rendersAfterSame} === ${shallowObjResult.rendersAfterFirst})`)
assert(shallowObjResult.rendersAfterDiff === shallowObjResult.rendersAfterFirst + 1,
  `Shallow object: different values triggers render`)

// Test 51: Class instances bypass shallow equality (use strict ===)
const shallowClassResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  let renderCount = 0

  class MyModel {
    constructor(n) { this.name = n }
  }

  class ShallowClass extends CoupElement {
    static tag = 'shallow-class'
    static props = { model: Object }
    template() {
      renderCount++
      return html`<span>${this.model?.name}</span>`
    }
  }
  ShallowClass.define()

  const el = document.createElement('shallow-class')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  const m1 = new MyModel('Ada')
  el.model = m1
  await new Promise(r => setTimeout(r, 50))
  const rendersAfterFirst = renderCount

  // New instance with same values — class instance, should NOT shallow compare
  const m2 = new MyModel('Ada')
  el.model = m2
  await new Promise(r => setTimeout(r, 50))
  const rendersAfterNew = renderCount

  el.remove()
  return { rendersAfterFirst, rendersAfterNew }
})
assert(shallowClassResult.rendersAfterNew === shallowClassResult.rendersAfterFirst + 1,
  `Shallow class: different instances trigger render (not shallow compared)`)

// Test 52: Static state with equivalent array skips render
const shallowStateResult = await page.evaluate(async () => {
  const { CoupElement, html } = await import('coup')

  let renderCount = 0

  class ShallowState extends CoupElement {
    static tag = 'shallow-state'
    static state = { items: [] }
    template() {
      renderCount++
      return html`<span>${this.items.length}</span>`
    }
  }
  ShallowState.define()

  const el = document.createElement('shallow-state')
  document.body.appendChild(el)
  await new Promise(r => setTimeout(r, 50))

  el.items = ['a', 'b', 'c']
  await new Promise(r => setTimeout(r, 50))
  const rendersAfterSet = renderCount

  // Same contents — should skip
  el.items = ['a', 'b', 'c']
  await new Promise(r => setTimeout(r, 50))
  const rendersAfterSame = renderCount

  // Different — should render
  el.items = ['a', 'b']
  await new Promise(r => setTimeout(r, 50))
  const rendersAfterDiff = renderCount

  el.remove()
  return { rendersAfterSet, rendersAfterSame, rendersAfterDiff }
})
assert(shallowStateResult.rendersAfterSame === shallowStateResult.rendersAfterSet,
  `Shallow state array: same items skips render`)
assert(shallowStateResult.rendersAfterDiff === shallowStateResult.rendersAfterSet + 1,
  `Shallow state array: different items triggers render`)

// Summary
console.log('\n' + (failed ? '❌ SOME TESTS FAILED' : '🎉 All tests passed!'))

await browser.close()
server.close()
process.exit(failed ? 1 : 0)
