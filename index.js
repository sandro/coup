// coup - a web component library that puts you in control of the render loop
// Uses lit-html for efficient tagged template rendering + diffing
// Zero build, zero shadow DOM, zero magic renders you didn't ask for
//
// Rendering model: manual this.render(). Props auto-render via _scheduleRender.
// All other state changes require explicit this.render() calls.

import { render as litRender, html, svg, nothing } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'

export { html, svg, nothing, repeat, shallowEqual }

// --- Shallow equality for arrays and plain objects ---
// Prevents re-renders when a parent passes a new array/object reference
// that contains the same data (e.g. .filter(), .map() with no changes, { ...same }).

function shallowEqual(a, b) {
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false

  const aIsArray = Array.isArray(a)
  const bIsArray = Array.isArray(b)
  if (aIsArray !== bIsArray) return false

  if (aIsArray) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }

  // Plain objects only — skip class instances, DOM nodes, etc.
  const aProto = Object.getPrototypeOf(a)
  if (aProto !== Object.prototype && aProto !== null) return false
  if (Object.getPrototypeOf(b) !== aProto) return false

  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false
  }
  return true
}

// --- Debug mode ---
// Set CoupElement.debug = true to enable dev warnings.
// Zero cost when off — all checks are gated behind the flag.

let _debug = false

function warn(tag, msg, ...args) {
  if (_debug) console.warn(`[coup] <${tag}> ${msg}`, ...args)
}

// --- Debug: error overlay ---
// Shows template errors visually when debug mode is on.
// Plain DOM — no lit-html, no coup — so it can't fail the same way.

let _overlay = null

function showErrorOverlay(tag, err) {
  if (!_overlay) {
    _overlay = document.createElement('div')
    _overlay.id = 'coup-error-overlay'
    _overlay.style.cssText = `
      position:fixed; inset:0; z-index:99999;
      background:rgba(0,0,0,0.85); color:#f8f8f8;
      font-family:'SF Mono',monospace; font-size:13px;
      padding:2rem; overflow:auto;
    `
    const close = document.createElement('button')
    close.textContent = '× Dismiss'
    close.style.cssText = `
      position:fixed; top:1rem; right:1.5rem; z-index:100000;
      background:none; border:1px solid #666; color:#ccc;
      font:inherit; padding:0.3rem 0.8rem; border-radius:4px; cursor:pointer;
    `
    close.onclick = () => { _overlay.remove(); _overlay = null }
    _overlay.appendChild(close)
  }
  const entry = document.createElement('div')
  entry.style.cssText = 'margin-top:1.5rem;'
  entry.innerHTML = `
    <div style="color:#ff6b6b;font-size:15px;font-weight:600;margin-bottom:0.5rem">
      &lt;${tag}&gt; template() error
    </div>
    <div style="color:#ffa07a;margin-bottom:0.75rem">${esc(err.message)}</div>
    <pre style="color:#888;white-space:pre-wrap;font-size:12px;line-height:1.5;margin:0">${esc(err.stack || '')}</pre>
  `
  _overlay.appendChild(entry)
  if (!_overlay.parentNode) document.body.appendChild(_overlay)
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const RESERVED = new Set([
  'template', 'render', 'connected', 'disconnected',
  'firstUpdated', 'updated', 'propsChanged',
  'storeChanged', 'emit', '$', '$$',
])

// --- Store: lightweight observable state ---

export class Store {
  constructor(initial = {}) {
    this._state = initial
    this._listeners = new Set()
  }

  /** Current state (read-only — use set() to update) */
  get state() {
    return this._state
  }

  /**
   * Update state. Accepts an object (shallow-merged) or a function
   * that receives the current state and returns updates.
   *
   *   store.set({ count: 1 })
   *   store.set(s => ({ count: s.count + 1 }))
   */
  set(updater) {
    const updates = typeof updater === 'function'
      ? updater(this._state)
      : updater
    this._state = { ...this._state, ...updates }
    this._listeners.forEach(fn => fn(this._state))
  }

  /**
   * Subscribe to state changes. Returns an unsubscribe function.
   *
   *   const unsub = store.subscribe(state => console.log(state))
   *   unsub() // stop listening
   */
  subscribe(fn) {
    this._listeners.add(fn)
    return () => this._listeners.delete(fn)
  }
}

export class CoupElement extends HTMLElement {
  _props = {}
  _propChanges = null
  _propChangePending = false
  _renderPending = false
  _rendering = false
  _connected = false

  /** Enable debug mode for all components */
  static set debug(val) { _debug = val }
  static get debug() { return _debug }

  constructor() {
    super()
    this._setupProps()
  }

  // --- Registration ---

  static define() {
    const tag = this.tag
    if (!tag) {
      throw new Error(`${this.name} must have a static 'tag' property`)
    }
    if (customElements.get(tag)) return
    customElements.define(tag, this)
  }

  // --- Attrs: HTML attributes mapped to props ---
  // static attrs = { id: String, count: Number, disabled: Boolean }
  //
  // Generates observedAttributes automatically. When an HTML attribute changes,
  // the value is coerced to the declared type and set as a prop (triggering
  // auto-re-render).
  //
  // Type coercion:
  //   String  → value as-is (null becomes undefined)
  //   Number  → Number(value)
  //   Boolean → attribute present = true, absent = false

  static get observedAttributes() {
    return this.attrs ? Object.keys(this.attrs) : []
  }

  attributeChangedCallback(name, oldValue, newValue) {
    const attrs = this.constructor.attrs
    if (!attrs || !(name in attrs)) return

    const type = attrs[name]
    let val
    if (type === Boolean) {
      val = newValue !== null
    } else if (type === Number) {
      val = newValue === null ? undefined : Number(newValue)
    } else {
      val = newValue === null ? undefined : newValue
    }

    if (this._props.hasOwnProperty(name)) {
      this[name] = val
    } else {
      this._attrs = this._attrs || {}
      const old = this._attrs[name]
      if (old !== val) {
        this._attrs[name] = val
        this._scheduleRender()
      }
    }
  }

  // --- Props: auto-generated getters/setters with auto-render ---

  _setupProps() {
    const props = this.constructor.props
    if (!props) return

    // Support both object and array forms:
    //   static props = { name: String, count: Number }
    //   static props = ['name', 'count']
    const entries = Array.isArray(props)
      ? props.map(name => [name, String])
      : Object.entries(props)

    for (const [name, _type] of entries) {
      if (_debug && RESERVED.has(name)) {
        warn(this.constructor.tag, `prop "${name}" shadows a CoupElement method — pick a different name`)
      }
      this._props[name] = undefined

      Object.defineProperty(this, name, {
        get() {
          return this._props[name]
        },
        set(val) {
          const old = this._props[name]
          if (!shallowEqual(old, val)) {
            if (_debug && val !== null && typeof val === 'object') {
              const p = Object.getPrototypeOf(val)
              if (Array.isArray(val) || p === Object.prototype || p === null) Object.freeze(val)
            }
            this._props[name] = val
            if (_debug) this._lastPropChange = name
            this._scheduleRender()
            if (this._connected && this.propsChanged) {
              // Batch prop changes — fire once after all props are set
              // in a single render pass (lit-html sets .a, .b, .c sequentially)
              if (!this._propChanges) this._propChanges = {}
              this._propChanges[name] = { old, new: val }
              if (!this._propChangePending) {
                this._propChangePending = true
                queueMicrotask(() => {
                  const changes = this._propChanges
                  this._propChanges = null
                  this._propChangePending = false
                  this.propsChanged(changes)
                })
              }
            }
          }
        },
        enumerable: true,
        configurable: true,
      })
    }
  }

  // --- Microtask-batched rendering ---

  _scheduleRender() {
    if (!this._connected) return
    if (this._renderPending) return
    this._renderPending = true
    queueMicrotask(() => {
      if (!this._renderPending) return  // already rendered (e.g. manual render() call)
      this._renderPending = false
      if (this._connected) {
        this._applyRender()
      }
    })
  }

  _applyRender() {
    if (this._rendering) return
    this._rendering = true
    this._renderPending = false  // clear so scheduled microtask is a no-op
    if (_debug) {
      const trigger = this._lastPropChange || 'manual'
      console.debug(`[coup] <${this.constructor.tag}> render (${trigger})`)
      this._lastPropChange = null
    }
    let ok = false
    try {
      const result = this.template()
      if (_debug && result === undefined) {
        warn(this.constructor.tag, 'template() returned undefined. Did you forget to return html`...`?')
      }
      litRender(result, this)
      ok = true
    } catch (err) {
      console.error(`[coup] <${this.constructor.tag}> template() error:`, err)
      if (_debug) showErrorOverlay(this.constructor.tag, err)
    } finally {
      this._rendering = false
    }
    // Post-render hooks — only fire on successful render
    if (ok) {
      if (!this._firstUpdated) {
        this._firstUpdated = true
        this.firstUpdated()
      }
      this.updated()
    }
  }

  // --- Public API ---

  /** Override this to return your html`...` template */
  template() {
    return nothing
  }

  /** Trigger a re-render. Call this after changing internal state. */
  render() {
    if (this._connected) {
      this._applyRender()
    }
  }

  /** querySelector shortcut */
  $(selector) {
    return this.querySelector(selector)
  }

  /** querySelectorAll shortcut */
  $$(selector) {
    return this.querySelectorAll(selector)
  }

  // --- Lifecycle ---
  // Override connected() and disconnected() instead of
  // connectedCallback/disconnectedCallback — no need to call super.

  connectedCallback() {
    this._connected = true
    this._unbindEvents()
    this._bindEvents()
    this._bindSubscriptions()
    this._scheduleRender()
    this.connected()

    // Fire propsChanged for any props set before connection (lit-html sets
    // props before inserting into DOM, so the setter's _connected check
    // skips propsChanged during initial prop setting).
    // Only fire on first connection — not on reconnection (element moved in DOM).
    if (this.propsChanged && !this._hasConnected) {
      this._hasConnected = true
      const props = this.constructor.props
      if (props) {
        const initial = {}
        let hasInitial = false
        const names = Array.isArray(props) ? props : Object.keys(props)
        for (const name of names) {
          if (this._props[name] !== undefined) {
            initial[name] = { old: undefined, new: this._props[name] }
            hasInitial = true
          }
        }
        if (hasInitial) {
          queueMicrotask(() => this.propsChanged(initial))
        }
      }
    } else {
      this._hasConnected = true
    }
  }

  disconnectedCallback() {
    this._connected = false
    this._unbindEvents()
    this._unbindSubscriptions()
    this.disconnected()
  }

  /** Called when the element is added to the DOM. Override freely — no super needed. */
  connected() {}

  /** Called when the element is removed from the DOM. Override freely — no super needed. */
  disconnected() {}

  /** Called once after the first render. DOM is populated. Override for one-time
   *  setup that needs DOM access (binding scroll listeners, initializing widgets, focusing). */
  firstUpdated() {}

  /** Called after every render (DOM is up to date). Override for post-render work like
   *  measuring elements, initializing third-party widgets, or scrolling. */
  updated() {}

  // --- Subscriptions ---
  //
  // Auto-subscribe to anything with a .subscribe(fn) → unsubscribe contract.
  // Renders are batched via _scheduleRender() so multiple stores updating on
  // the same tick only trigger one render.
  //
  // Usage:
  //   import { appStore, playerStore } from './stores.js'
  //
  //   class MyComponent extends CoupElement {
  //     static subscribe = [appStore, playerStore]
  //
  //     template() {
  //       const { user } = appStore.state
  //       const { playing } = playerStore.state
  //       return html`<span>${user} ${playing ? '▶' : '⏸'}</span>`
  //     }
  //   }
  //
  // Works with coup Store, or anything that has subscribe(fn) → unsubscribe.

  _bindSubscriptions() {
    const sources = this.constructor.subscribe
    if (!sources) return
    this._subs = sources.map(s => s.subscribe((newState) => {
      if (this.storeChanged) {
        // Component owns the render — call this.render() when ready.
        // Async storeChanged just works: do your awaits, render when done.
        this.storeChanged(s, newState)
      } else {
        // No storeChanged defined — auto-render.
        this._scheduleRender()
      }
    }))
  }

  _unbindSubscriptions() {
    if (this._subs) {
      this._subs.forEach(fn => fn())
      this._subs = null
    }
  }

  // --- Global events ---

  _bindEvents() {
    const events = this.constructor.events
    if (!events) return

    this._eventHandlers = this._eventHandlers || {}
    for (const [eventName, methodName] of Object.entries(events)) {
      if (typeof this[methodName] !== 'function') {
        throw new Error(
          `${this.constructor.name}: static events references '${methodName}' but no such method exists`
        )
      }
      if (this._eventHandlers[eventName]) continue
      const handler = this[methodName].bind(this)
      this._eventHandlers[eventName] = handler
      window.addEventListener(eventName, handler)
    }
  }

  _unbindEvents() {
    if (!this._eventHandlers) return
    for (const [eventName, handler] of Object.entries(this._eventHandlers)) {
      window.removeEventListener(eventName, handler)
    }
    this._eventHandlers = {}
  }

  // --- Emit ---

  emit(name, detail = null) {
    window.dispatchEvent(
      new CustomEvent(name, { detail })
    )
  }
}
