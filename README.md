# coup

They took the render loop. Take it back. That's a coup.

You don't need a build step. You don't need a virtual DOM. You don't need hooks, signals, effects, memos, reducers, selectors, or a PhD in reactivity theory to put HTML on a screen.

**Under 500 lines. One dependency ([lit-html](https://lit.dev/docs/libraries/standalone-templates/), ~3KB gzip). No build step. No CLI. No starter template.**

> **[Live examples →](https://sandro.github.io/coup/)**

```
┌──────────────────────────────────────┐
│  Your component (extends CoupElement)│
│                                      │
│  template()  → returns html`...`     │
│  render()    → applies template to   │
│                DOM via lit-html      │
│  static props  → auto-render on set  │
│  state = {}    → manual this.render() │
│  static events → window listeners    │
│  static subscribe → store bindings   │
│  emit()      → dispatch CustomEvent  │
└──────────────────────────────────────┘
```

## Quick Start

```html
<script type="importmap">
{
  "imports": {
    "lit-html": "https://esm.sh/lit-html@3",
    "lit-html/": "https://esm.sh/lit-html@3/",
    "coup": "./index.js"
  }
}
</script>

<my-counter></my-counter>
<script type="module" src="app.js"></script>
```

```js
// app.js
import { CoupElement, html } from 'coup'

class MyCounter extends CoupElement {
  static tag = 'my-counter'
  state = { count: 0 }

  template() {
    return html`
      <button @click=${() => { this.state.count++; this.render() }}>
        Clicked ${this.state.count} times
      </button>
    `
  }
}
MyCounter.define()
```

Mutate `this.state`, call `this.render()`. Props auto-render when set by a parent — internal state is always explicit.

### Standalone bundle (single import, no importmap)

```html
<my-counter></my-counter>
<script type="module">
  import { CoupElement, html } from 'https://esm.sh/coup-js/standalone'

  class MyCounter extends CoupElement {
    static tag = 'my-counter'
    state = { count: 0 }

    template() {
      return html`
        <button @click=${() => { this.state.count++; this.render() }}>
          Clicked ${this.state.count} times
        </button>
      `
    }
  }
  MyCounter.define()
</script>
```

One URL. Everything included — lit-html, `repeat`, `classMap`, `styleMap`, `unsafeHTML`, `Router`. **7.4KB gzipped.** No importmap, no coordination, no trailing-slash gotchas.

Use the importmap approach for multi-page sites (shared lit-html cache). Use the standalone bundle for prototypes, single-file apps, and when you want one import line.

## API

### Exports

```js
// Importmap approach
import { CoupElement, Store, html, svg, nothing } from 'coup'
import { repeat } from 'lit-html/directives/repeat.js'
import { Router } from 'coup/router.js'

// Standalone bundle — everything in one import
import { CoupElement, Store, html, svg, nothing,
         repeat, classMap, styleMap, unsafeHTML, Router
} from 'https://esm.sh/coup-js/standalone'
```

| Export | Source | What |
|---|---|---|
| `CoupElement` | coup | Base class for components |
| `Store` | coup | Lightweight observable state container |
| `html`, `svg` | lit-html | Tagged template functions for DOM |
| `nothing` | lit-html | Render-nothing sentinel |
| `repeat` | lit-html | Keyed list rendering (standalone: included) |
| `classMap` | lit-html | Conditional CSS classes (standalone only) |
| `styleMap` | lit-html | Dynamic inline styles (standalone only) |
| `unsafeHTML` | lit-html | Render raw HTML strings (standalone only) |
| `Router` | coup/router | Hash-based SPA router (standalone: included) |

### `CoupElement`

Base class for all coup components. Extends `HTMLElement`. No shadow DOM.

### `static tag` + `static define()`

Register a custom element. The tag must contain a hyphen (web component spec requirement).

```js
class UserCard extends CoupElement {
  static tag = 'user-card'
  // ...
}
UserCard.define()

// Equivalent to:
// customElements.define('user-card', UserCard)
```

### `template()`

Override this to return your component's markup. Called internally during each render cycle.

```js
template() {
  return html`<p>Hello ${this.name}!</p>`
}
```

### `render()`

Call `this.render()` to update the DOM. Props auto-render when set by a parent. For internal state, you call `this.render()` — every render is a line you wrote, visible and grep-able.

```js
onClick() {
  this.state.expanded = !this.state.expanded
  this.render()  // you decide when the DOM updates
}
```

### `static props`

Declares reactive properties. Auto-generates getters/setters via `Object.defineProperty`. When a parent sets a prop via lit-html's `.prop=${value}` binding, the component auto-re-renders.

```js
class UserCard extends CoupElement {
  static tag = 'user-card'
  static props = { user: Object, size: String }

  template() {
    return html`
      <div class="${this.size}">
        <h2>${this.user?.name}</h2>
      </div>
    `
  }
}
UserCard.define()

// Parent sets props via property binding:
html`<user-card .user=${{ name: 'Ada' }} .size=${'large'}></user-card>`
```

Under the hood, for each prop coup generates:

```js
Object.defineProperty(this, 'user', {
  get() { return this._props.user },
  set(val) {
    if (this._props.user !== val) {  // strict equality check
      this._props.user = val
      this._scheduleRender()         // batched via queueMicrotask
    }
  }
})
```

Multiple prop changes in the same microtask coalesce into a single render.

### State

Internal component state. Use a plain instance property — read from `this.state`, write to it, and call `this.render()` when you want the DOM to update.

```js
class SearchBox extends CoupElement {
  static tag = 'search-box'
  state = { query: '', results: [], loading: false }

  async search(q) {
    this.state.query = q
    this.state.loading = true
    this.render()
    this.state.results = await fetchResults(q)
    this.state.loading = false
    this.render()
  }

  template() {
    return html`
      <input @input=${e => { this.state.query = e.target.value; this.render() }}
             .value=${this.state.query}>
      ${this.state.loading
        ? html`<p>Loading...</p>`
        : html`<ul>${this.state.results.map(r => html`<li>${r}</li>`)}</ul>`
      }
    `
  }
}
```

### `static attrs`

Maps HTML attributes to reactive values via `attributeChangedCallback`. Values are type-coerced.

```js
class ShowPlaylist extends CoupElement {
  static tag = 'show-playlist'
  static attrs = { id: String }

  async attributeChangedCallback(name, oldValue, newValue) {
    super.attributeChangedCallback(name, oldValue, newValue)
    if (name === 'id' && newValue) {
      this.playlist = await fetchPlaylist(newValue)
    }
  }

  template() {
    return html`<h2>${this.playlist?.name}</h2>`
  }
}
```

When both `static attrs` and `static props` declare the same name, attribute changes set the prop (triggering auto-re-render):

```js
class MyWidget extends CoupElement {
  static tag = 'my-widget'
  static attrs = { pid: String }
  static props = { pid: String }

  template() {
    return html`<span>Playlist: ${this.pid}</span>`
  }
}

// Setting the HTML attribute triggers the prop setter → auto re-render
// el.setAttribute('pid', 'abc-123')
```

Type coercion:

| Type | Coercion |
|---|---|
| `String` | Value as-is. `null` → `undefined` |
| `Number` | `Number(value)`. `null` → `undefined` |
| `Boolean` | Attribute present → `true`. Absent → `false` |

```html
<!-- Boolean: present = true -->
<my-widget active></my-widget>

<!-- Boolean: absent = false -->
<my-widget></my-widget>
```

### `static events`

Wires up global event listeners on `window`. Listeners are added when the component connects, removed when it disconnects — no leaks.

```js
class PlayerControls extends CoupElement {
  static tag = 'player-controls'

  static events = {
    'player:state-changed': 'onPlayerState',
    'app:theme-changed': 'onThemeChanged',
  }

  state = { track: null, theme: 'light' }

  onPlayerState(e) {
    this.state.track = e.detail.track
    this.render()
  }

  onThemeChanged(e) {
    this.state.theme = e.detail
    this.render()
  }
}
```

### `emit(name, detail)`

Dispatches a `CustomEvent` on `window`. Any component with a matching `static events` entry will receive it.

```js
// Child emits:
this.emit('tasks:remove', { id: 42 })

// Parent listens:
class TaskList extends CoupElement {
  static events = { 'tasks:remove': 'onRemove' }
  state = { tasks: [] }

  onRemove(e) {
    this.state.tasks = this.state.tasks.filter(t => t.id !== e.detail.id)
    this.render()
  }
}
```

### `static subscribe`

Auto-subscribe to stores. Listeners are bound on connect, unbound on disconnect — no boilerplate. Works with coup `Store` or anything with a `subscribe(fn) → unsubscribe` contract.

```js
import { appStore, playerStore } from './stores.js'

class NowPlaying extends CoupElement {
  static tag = 'now-playing'
  static subscribe = [appStore, playerStore]

  template() {
    const { user } = appStore.state
    const { track, playing } = playerStore.state
    return html`<span>${user} — ${track} ${playing ? '▶' : '⏸'}</span>`
  }
}
NowPlaying.define()
```

When a subscribed store calls `set()`, the component auto-re-renders. If you define `storeChanged(store, state)`, auto-render is skipped and you control when to call `this.render()` — useful for async work or selective updates.

**Manual subscribe still works.** If you prefer explicit control:

```js
connected()    { this._unsub = myStore.subscribe(() => this.render()) }
disconnected() { this._unsub() }
```

### Lifecycle

| Hook | When it fires |
|---|---|
| `connected()` | Element added to DOM, before first render |
| `firstUpdated()` | Once, after the first render. DOM is populated. Does not re-fire on reconnection. |
| `updated()` | After every render (DOM is up to date) |
| `disconnected()` | Element removed from DOM |
| `propsChanged(changes)` | After props change. Batched — fires once per microtask with `{ name: { old, new } }` |
| `storeChanged(store, state)` | When a subscribed store updates. If defined, auto-render is skipped — you call `this.render()` when ready. |

No need to call `super` — coup handles that internally.

```js
class MyTrack extends CoupElement {
  static tag = 'my-track'

  connected() {
    this.player = getPlayer()
    this.player.addListener('statechange', this.onStateChange)
  }

  firstUpdated() {
    // DOM exists now — safe to query, measure, focus
    this.$('input')?.focus()
  }

  disconnected() {
    this.player.removeListener('statechange', this.onStateChange)
  }
}
```

### `this.$(selector)` / `this.$$(selector)`

Shortcuts for `this.querySelector` and `this.querySelectorAll`:

```js
this.$('.title')          // → first .title element inside this component
this.$$('input')          // → all input elements inside this component
```

## State Management with `Store`

Coup includes a lightweight `Store` class for shared state. It's 15 lines of code — an observable object with `set()` and `subscribe()`. Use it when multiple components need the same data. **It's entirely optional** — you can use any state management approach you like, or just keep state local to components.

### Creating a store

```js
import { Store } from 'coup'

export const appStore = new Store({
  user: null,
  bookmarks: [],
  search: '',
})
```

### Updating state

```js
// Object merge (shallow)
appStore.set({ search: 'lit-html' })

// Updater function — receives current state, returns updates
appStore.set(s => ({
  bookmarks: [...s.bookmarks, newBookmark]
}))

// Both produce a new state object (immutable — never mutates in place)
```

### Subscribing in a component

Use `static subscribe` for zero-boilerplate binding:

```js
class BookmarkList extends CoupElement {
  static tag = 'bookmark-list'
  static subscribe = [appStore]

  template() {
    const { bookmarks, search } = appStore.state
    const filtered = bookmarks.filter(b =>
      b.title.toLowerCase().includes(search.toLowerCase())
    )
    return html`
      ${repeat(filtered, b => b.id, b => html`
        <bookmark-card .bookmark=${b}></bookmark-card>
      `)}
    `
  }
}
```

### Key concepts

**Components subscribe independently.** Each component decides whether to listen to the store. The toolbar, stats bar, and list in the [bookmarks example](./examples/6-bookmarks/) all subscribe to the same store but re-render independently.

**Derived data is just functions.** Don't store computed values — derive them:

```js
// ✅ Compute from store state
function getFilteredBookmarks() {
  const { bookmarks, search } = appStore.state
  return bookmarks.filter(b => b.title.includes(search))
}

// ❌ Don't duplicate derived state in the store
appStore.set({ filteredBookmarks: ... }) // stale data waiting to happen
```

**Multiple stores are fine.** Split state by domain:

```js
export const playerStore = new Store({ track: null, playing: false })
export const playlistStore = new Store({ playlists: [], active: null })
```

### When to use what

| Pattern | Use when |
|---|---|
| `this.state` + `this.render()` | State is local to one component |
| `static events` + `emit()` | Child needs to notify parent (or any ancestor) |
| `Store` + `static subscribe` | Multiple unrelated components need the same data |

### Bring your own

`Store` is intentionally minimal — no middleware, no devtools, no selectors. If you want something more, use any state library that has a subscribe pattern. The component side is always the same:

```js
static subscribe = [yourThing]
// or manually:
connected()    { this._unsub = yourThing.subscribe(() => this.render()) }
disconnected() { this._unsub() }
```

See [`examples/6-bookmarks/`](./examples/6-bookmarks/) for a full working example with search, tag filtering, add/delete, and pin/unpin — all driven by a single shared store.

## Template Syntax (lit-html)

Coup uses [lit-html](https://lit.dev/docs/templates/overview/) for templating. The `html` tag, binding prefixes, and directives all come from lit-html — coup just re-exports them. For the full reference, see the [lit-html docs](https://lit.dev/docs/templates/overview/).

### Binding reference

| Syntax | Name | What it does | Example |
|---|---|---|---|
| `${val}` | Text | Renders text content | `<h2>${this.title}</h2>` |
| `attr=${val}` | Attribute | Sets an HTML attribute | `<img src=${this.url}>` |
| `.prop=${val}` | Property | Sets a JS property on the element | `<my-child .items=${data}></my-child>` |
| `?attr=${bool}` | Boolean attribute | Adds attr when true, removes when false | `<button ?disabled=${this.loading}>` |
| `@event=${fn}` | Event listener | Adds an event listener | `<button @click=${() => this.save()}>` |

**Property binding (`.prop`) is how you pass data between coup components.** When a parent template has `<my-child .items=${this.data}>`, lit-html calls the child's `.items` setter directly. If the child declares `static props = { items: Array }`, this triggers the auto-generated setter which schedules a re-render.

```js
html`
  <div class="card ${active ? 'active' : ''}">
    <!-- Text interpolation -->
    <h2>${this.title}</h2>

    <!-- Property binding: passes JS objects/arrays to child components -->
    <my-child .data=${this.items}></my-child>

    <!-- Attribute binding: sets HTML attributes (always strings) -->
    <img src=${this.imageUrl} alt=${this.alt}>

    <!-- Boolean attribute: present when true, absent when false -->
    <button ?disabled=${this.loading}>Submit</button>

    <!-- Event listener -->
    <button @click=${(e) => this.handleClick(e)}>Click me</button>
    <input @input=${(e) => this.onType(e.target.value)}>

    <!-- Conditional rendering -->
    ${this.loading
      ? html`<spinner-el></spinner-el>`
      : html`<p>Ready</p>`
    }
  </div>
`
```

> **Attribute vs property:** `src=${val}` sets the HTML attribute (string). `.data=${val}` sets the JS property (any type). For passing strings to plain HTML elements, use attributes. For passing objects/arrays/functions to coup components, use `.property` binding.

### Keyed Lists with `repeat()`

Use `repeat` from lit-html when items can be reordered, added, or removed:

```js
import { CoupElement, html } from 'coup'
import { repeat } from 'lit-html/directives/repeat.js'

class TodoList extends CoupElement {
  static tag = 'todo-list'
  state = { items: [] }

  connected() {
    this.state.items = [
      { id: 1, text: 'First' },
      { id: 2, text: 'Second' },
    ]
  }

  template() {
    return html`
      <ul>
        ${repeat(
          this.state.items,
          item => item.id,       // key function
          item => html`<li>${item.text}</li>`  // template function
        )}
      </ul>
    `
  }
}
```

Without `repeat`, lit-html reuses DOM nodes positionally — if you reorder a list, the text might not move with its element. `repeat` ensures DOM nodes follow their data by key.

### Other lit-html directives

Coup re-exports `html`, `svg`, and `nothing`. For lit-html directives like `repeat`, import directly:

```js
import { ref, createRef } from 'lit-html/directives/ref.js'
import { classMap } from 'lit-html/directives/class-map.js'
import { ifDefined } from 'lit-html/directives/if-defined.js'
```

See the full list: [lit-html built-in directives](https://lit.dev/docs/templates/directives/).

## Complete Example

A parent/child component pair using props, state, events, and keyed lists:

```js
import { CoupElement, html } from 'coup'
import { repeat } from 'lit-html/directives/repeat.js'

// ── Child: receives data via props, emits events upward ──
class TaskItem extends CoupElement {
  static tag = 'task-item'
  static props = { task: Object }

  toggle() {
    this.emit('tasks:toggle', { id: this.task.id })
  }

  removeTask() {
    this.emit('tasks:remove', { id: this.task.id })
  }

  template() {
    const t = this.task
    if (!t) return html``
    return html`
      <div class="task ${t.done ? 'done' : ''}">
        <input type="checkbox" .checked=${t.done}
          @change=${() => this.toggle()} />
        <span>${t.name}</span>
        <button @click=${() => this.removeTask()}>✕</button>
      </div>
    `
  }
}
TaskItem.define()

// ── Parent: owns state, listens for child events ──
class TaskApp extends CoupElement {
  static tag = 'task-app'
  static events = {
    'tasks:toggle': 'onToggle',
    'tasks:remove': 'onRemove',
  }
  state = {
    tasks: [
      { id: 1, name: 'Read coup source', done: false },
      { id: 2, name: 'Build a component', done: true },
    ]
  }

  onToggle(e) {
    this.state.tasks = this.state.tasks.map(t =>
      t.id === e.detail.id ? { ...t, done: !t.done } : t
    )
    this.render()
  }

  onRemove(e) {
    this.state.tasks = this.state.tasks.filter(t => t.id !== e.detail.id)
    this.render()
  }

  template() {
    return html`
      ${repeat(
        this.state.tasks,
        t => t.id,
        t => html`<task-item .task=${t}></task-item>`
      )}
      <p>${this.state.tasks.filter(t => t.done).length} done</p>
    `
  }
}
TaskApp.define()
```

## Import Maps (Zero-Build Setup)

Coup has no build step. Instead of bundling with Webpack/Vite, you use a browser-native [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap) to tell the browser where to find modules.

**The problem import maps solve:** When your JS says `import { html } from 'lit-html'`, the browser doesn't know where `'lit-html'` lives — it's not a file path. In Node.js, this resolves via `node_modules/`. In the browser, you need to tell it explicitly.

**`<script type="importmap">`** is a special script tag that maps bare module names to URLs:

```html
<script type="importmap">
{
  "imports": {
    "lit-html": "https://esm.sh/lit-html@3",
    "lit-html/": "https://esm.sh/lit-html@3/",
    "coup": "./path/to/coup/index.js"
  }
}
</script>

<!-- Your app code uses ES module imports as usual -->
<script type="module" src="app.js"></script>
```

Now when `app.js` does `import { html } from 'lit-html'`, the browser resolves it to `https://esm.sh/lit-html@3`. When `coup/index.js` does `import { render } from 'lit-html'`, same thing.

| Entry | What it maps |
|---|---|
| `"lit-html"` | Exact match — `import ... from 'lit-html'` |
| `"lit-html/"` | Prefix match — `import ... from 'lit-html/directives/repeat.js'` resolves to `https://esm.sh/lit-html@3/directives/repeat.js`. **Required for directives.** |
| `"coup"` | Your local coup library |

**Rules:**
- The import map must appear **before** any `<script type="module">` tags
- Only one import map per page
- [Supported in all modern browsers](https://caniuse.com/import-maps) (Chrome 89+, Safari 16.4+, Firefox 108+)

## Gotchas

### 1. Don't shadow built-in DOM methods

`HTMLElement` has methods like `remove()`, `append()`, `closest()`, `click()`, `focus()`. If you name your method the same, lit-html or the browser may call yours instead of the built-in. This causes bizarre bugs.

```js
// ❌ BAD — shadows Element.prototype.remove()
// When lit-html removes this element from a list, it calls .remove()
// which fires YOUR method instead of removing the element from the DOM
class TaskItem extends CoupElement {
  remove() {
    this.emit('tasks:remove', { id: this.task.id })
  }
}

// ✅ GOOD — use a descriptive name
class TaskItem extends CoupElement {
  removeTask() {
    this.emit('tasks:remove', { id: this.task.id })
  }
}
```

### 2. Object mutation doesn't trigger re-renders

Props use strict equality (`!==`) for change detection. Mutating an object in place won't trigger a re-render because the reference hasn't changed.

```js
// ❌ WRONG — same reference, setter doesn't fire
this.items.push(newItem)

// ✅ CORRECT — new reference, triggers re-render
this.items = [...this.items, newItem]
```

This applies to any nested mutation:

```js
// ❌ Mutates in place — no re-render
const task = this.tasks.find(t => t.id === id)
task.done = !task.done

// ✅ Creates new objects — re-renders
this.tasks = this.tasks.map(t =>
  t.id === id ? { ...t, done: !t.done } : t
)
```

Mutate `this.state.items`, then call `this.render()`. Auto-rendering only applies to `static props`.

### 3. Use `connected()` / `disconnected()`, not raw lifecycle hooks

Coup provides `connected()` and `disconnected()` hooks that don't require `super`. If you override `connectedCallback` or `disconnectedCallback` directly, you **must** call `super` — but there's no reason to do that.

```js
// ❌ Risky — forgetting super breaks everything
connectedCallback() {
  this.player.addListener('change', this.onChange)
}

// ✅ Use connected() instead — no super needed
connected() {
  this.player.addListener('change', this.onChange)
}
```

### 4. `template()` vs `render()` — don't mix them up

`template()` returns markup. `render()` applies it. Don't call `this.template()` to trigger a re-render — it just returns a value and does nothing. Don't override `render()` to return markup — it's the trigger, not the definition.

```js
// ❌ WRONG — overriding render() to return html
render() {
  return html`<p>This won't work</p>`
}

// ❌ WRONG — calling template() to re-render
this.template()  // does nothing visible

// ✅ CORRECT
template() {
  return html`<p>This works</p>`
}
// ...somewhere in an event handler:
this.render()  // applies template() to the DOM
```

### 5. Events emitted during render are dangerous

`emit()` dispatches synchronously on `window`. If a listener calls `render()` on the same component that's already mid-render, the re-entrancy guard silently drops it.

```js
// ❌ RISKY — if parentHandler calls this.render() while already rendering
template() {
  this.emit('something')  // fires during render!
  return html`...`
}

// ✅ SAFE — emit from event handlers, not from template()
handleClick() {
  this.emit('something')  // outside of render cycle
}
```

### 6. Don't forget `e.preventDefault()` on form submits

Form submissions reload the page. Always prevent default.

```js
template() {
  return html`
    <form @submit=${(e) => this.addTask(e)}>
      <input type="text" />
      <button type="submit">Add</button>
    </form>
  `
}

addTask(e) {
  e.preventDefault()  // ← without this, page reloads
  // ...
}
```

### 7. The `id` attribute is special

`id` is a built-in HTML attribute that every element has. If you use `static attrs = { id: String }` to observe it, be aware that `this.id` already exists as a native property. If you also declare `static props = { id: String }`, your prop setter will shadow the native `id` getter. This works but can surprise you. Consider using a prefixed name:

```js
// ⚠️ Works, but shadows native Element.id
static attrs = { id: String }
static props = { id: String }

// ✅ Clearer — use a different name
static attrs = { 'playlist-id': String }
// Access via this._attrs['playlist-id']
```

## Examples

```
examples/
  1-hello/      — 2 components, prop passing, input binding
  2-tasks/      — add, remove, reorder, keyed lists, emit/events
  3-kanban/     — drag-and-drop columns, CRUD, cross-component events
  4-chat/       — room switching, component destruction, timers
  5-github/     — fetch API, loading/error states, sorting
  6-bookmarks/  — shared Store, static subscribe, search, tag filtering
  7-editor/     — block editor, Tiptap + CodeMirror, bidirectional sync
  8-chatbot/    — streaming AI chat, tool calls, file attachments
  9-lightbox/   — media lightbox, gallery + single-image, keyboard nav, video
  10-datatable/ — sortable, filterable, paginated data table (250 countries, embedded data)
  11-crypto/    — infinite scroll with crypto prices (IntersectionObserver, paginated API)
  12-form/      — signup form with field-level validation, dirty/touched tracking, async submit
```

Run any example: `npx serve . -p 3000` then open `/examples/1-hello/`.

## Testing

```bash
npm install
node test.mjs
```

Runs a headless Playwright test suite covering rendering, adding, removing, reordering, shuffling, attribute changes, and prop→attr bridging.

## Design Decisions

| Decision | Rationale |
|---|---|
| **No shadow DOM** | Global CSS just works. No slots, no style encapsulation headaches. |
| **Manual `this.state` + `render()`** | [We tried reactive state and reverted.](./REACTIVE_STATE_POSTMORTEM.md) Auto-rendering hides over-renders behind reference identity checks and external event timing. Explicit `this.render()` makes every render visible and grep-able — if the UI is wrong, search for the missing call. |
| **Auto-render on prop changes** | Props come from a parent — the parent is saying "your inputs changed." |
| **`template()` vs `render()`** | Separating definition from trigger prevents accidental recursion. |
| **Global events via `window`** | Simple pub/sub. No event bus library. Auto-cleanup on disconnect. |
| **lit-html for templating** | Battle-tested, 3KB, efficient diffing, keyed lists via `repeat()`. |
| **No build step** | Import maps + CDN. Copy `index.js` into your project and go. |

---

One file. 2KB gzipped. Zero build. That's a coup.
