// coup - a web component library that puts you in control of the render loop
// Uses lit-html for efficient tagged template rendering + diffing
// Zero build, zero shadow DOM, zero magic renders you didn't ask for

import { render as litRender, html, svg, nothing } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'

export { html, svg, nothing, repeat }

// --- Debug mode ---
// Set CoupElement.debug = true to enable dev warnings.
// Zero cost when off — all checks are gated behind the flag.

let _debug = false

function warn(tag, msg, ...args) {
  if (_debug) console.warn(`[coup] <${tag}> ${msg}`, ...args)
}

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

  // --- Debug: state mutation tracking ---

  _stateProxy() {
    this._stateProxied = true
    const tag = this.constructor.tag
    let dirty = false
    let renderCalled = false
    const origRender = this.render.bind(this)

    this.render = () => {
      renderCalled = true
      dirty = false
      origRender()
    }

    const handler = {
      set(target, prop, value) {
        target[prop] = value
        dirty = true
        renderCalled = false
        // Check on next microtask if render was called
        queueMicrotask(() => {
          if (dirty && !renderCalled) {
            warn(tag, `state.${prop} changed but render() was not called. UI is stale.`)
          }
        })
        return true
      }
    }

    this.state = new Proxy(this.state, handler)
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

    for (const [name, _type] of Object.entries(props)) {
      this._props[name] = undefined

      Object.defineProperty(this, name, {
        get() {
          return this._props[name]
        },
        set(val) {
          const old = this._props[name]
          if (old !== val) {
            this._props[name] = val
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
          } else if (_debug && val !== null && typeof val === 'object') {
            warn(this.constructor.tag,
              `prop "${name}" was set to the same object reference. ` +
              `If you mutated it, use a new object: { ...old, key: newVal }`)
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
      this._renderPending = false
      if (this._connected) {
        this._applyRender()
      }
    })
  }

  _applyRender() {
    if (this._rendering) return
    this._rendering = true
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
    } finally {
      this._rendering = false
    }
    // Post-render hook — only fires on successful render
    if (ok) this.updated()
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
    // Debug: wrap state in proxy on first connect (after class fields init)
    if (_debug && this.state && !this._stateProxied) {
      this._stateProxy()
    }
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
        for (const name of Object.keys(props)) {
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
      // If the component defines storeChanged(), call it AND schedule a render.
      // storeChanged can do async work or cancel the render by setting a flag,
      // but by default the component still re-renders.
      if (this.storeChanged) {
        this.storeChanged(s, newState)
      }
      this._scheduleRender()
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
