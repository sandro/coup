# coup cheatsheet

## Setup (single file, zero build)

```html
<!DOCTYPE html>
<html>
<head></head>
<body>
  <my-app></my-app>
  <script type="module">
    import { CoupElement, html, nothing, Store, repeat, Router }
      from 'https://esm.sh/coup-js/standalone'

    // components here
  </script>
</body>
</html>
```

Alternative: importmap (better caching for multi-page sites):

```html
<script type="importmap">
{ "imports": {
  "lit-html": "https://esm.sh/lit-html@3",
  "lit-html/": "https://esm.sh/lit-html@3/",
  "coup": "https://esm.sh/coup-js"
}}
</script>
<script type="module">
  import { CoupElement, html } from 'coup'
  import { repeat } from 'lit-html/directives/repeat.js'
  import { Router } from 'coup/router.js'
</script>
```

## Component

```js
class MyThing extends CoupElement {
  static tag = 'my-thing'
  template() { return html`<p>hello</p>` }
}
MyThing.define()
```

## State (manual render)

```js
state = { count: 0, items: [], user: null }

// read/write on this.state
this.state.count++
this.state.items = [...this.state.items, item]
this.state.user = { ...this.state.user, name: 'Ada' }
this.render() // explicit — you control when UI updates
```

## Props (parent → child, auto-renders on change)

```js
// child declares:
static props = { user: Object, label: String }

// parent passes via property binding:
html`<my-child .user=${{ name: 'Ada' }} .label=${'hello'}></my-child>`

// child reads: this.user, this.label
```

## HTML attributes → props

```js
static attrs = { count: Number, active: Boolean, label: String }
// <my-thing count="5" active label="hi">
// Boolean: present = true, absent = false
// Number: coerced via Number()
// String: value as-is
```

## Template syntax (lit-html)

```js
template() {
  return html`
    <!-- text -->
    <h1>${this.title}</h1>

    <!-- attribute -->
    <img src=${this.url}>

    <!-- boolean attribute -->
    <button ?disabled=${this.loading}>Go</button>

    <!-- property (pass objects/arrays to child components) -->
    <my-child .items=${this.list}></my-child>

    <!-- event -->
    <button @click=${() => { this.state.count++; this.render() }}>+</button>
    <input @input=${(e) => { this.state.query = e.target.value; this.render() }}>

    <!-- conditional -->
    ${this.show ? html`<p>visible</p>` : nothing}

    <!-- list -->
    ${this.items.map(item => html`<li>${item.name}</li>`)}

    <!-- keyed list (for reorder/add/remove) -->
    ${repeat(this.items, i => i.id, i => html`<li>${i.name}</li>`)}
  `
}
```

## Lifecycle

```js
connected()      // added to DOM, before first render
firstUpdated()   // once, after first render — DOM exists, safe to query/focus
updated()        // after every render
disconnected()   // removed from DOM — clean up listeners, timers

// no super() calls needed
```

## Change callbacks

```js
// fires once per microtask with all batched changes
propsChanged(changes)  // { propName: { old, new } }
```

## Events (child → parent, or any → any)

```js
// sender:
this.emit('task:delete', { id: 42 })

// receiver declares:
static events = { 'task:delete': 'onDelete' }
onDelete(e) { console.log(e.detail.id) } // 42

// events dispatch on window, auto-bind on connect, auto-unbind on disconnect
```

## Store (shared state across components)

```js
import { Store } from 'coup'

export const appStore = new Store({ user: null, items: [] })

// update:
appStore.set({ user: { name: 'Ada' } })
appStore.set(s => ({ items: [...s.items, newItem] }))

// read:
appStore.state.user
```

## Subscribe to stores (auto-render on store change)

```js
static subscribe = [appStore]

template() {
  const { user } = appStore.state
  return html`<span>${user?.name}</span>`
}

// optional: control render timing for async work
storeChanged(store, newState) {
  // auto-render is skipped when this is defined
  // call this.render() when ready
}
```

## Router (hash-based SPA)

```js
const router = new Router(['/', '/about', '/user/:id', '/files/*'])

// in a component:
static subscribe = [router]

template() {
  if (router.pattern === '/')           return html`<home-page></home-page>`
  if (router.pattern === '/user/:id')   return html`<user-page .id=${router.params.id}></user-page>`
  if (router.pattern === '/files/*')    return html`<p>${router.params.wild}</p>`
  return html`<p>404</p>`
}

// navigate:
router.go('/user/42')
router.replace('/login')  // no history entry

// links:
html`<a href="#/about">About</a>`
```

## QueryClient (fetch cache)

```js
import { QueryClient } from 'coup/query.js'

const qc = new QueryClient({ staleTime: 60_000, gcTime: 300_000 })

// fetch with cache + dedup + retry:
const users = await qc.fetch(['users', page], {
  fn: ({ signal }) => fetch(`/api/users?page=${page}`, { signal }).then(r => r.json()),
})

// read cache synchronously (undefined on miss):
const cached = qc.get(['users', page])

// prefetch next page (fire-and-forget):
qc.prefetch(['users', page + 1], { fn })

// invalidate (prefix match), cancel, clear:
qc.invalidate(['users'])   // mark stale
qc.cancel(['users'])       // abort in-flight
qc.clear()                 // nuke everything

// optimistic update:
qc.set(['users', page], optimisticData)

// debug — expose in DevTools:
if (CoupElement.debug) window.__qc = qc
// then: __qc._cache, __qc._inflight, __qc._aborts
```

## DOM queries

```js
this.$('.title')    // querySelector
this.$$('input')    // querySelectorAll
```

## Debug mode

```js
CoupElement.debug = true
// warns: undefined template(), shadowed method names
// freezes prop objects to catch accidental mutation
// logs render triggers to console
// shows visible error overlay when template() throws
```
