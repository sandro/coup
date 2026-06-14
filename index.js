// coup - a web component library that puts you in control of the render loop
// Uses lit-html for efficient tagged template rendering + diffing
// Zero build, zero shadow DOM, zero magic renders you didn't ask for

import { render as litRender, html, svg, nothing } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'

export { html, svg, nothing, repeat }

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
  _renderPending = false
  _rendering = false
  _connected = false

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
    try {
      litRender(this.template(), this)
    } catch (err) {
      console.error(`[coup] ${this.constructor.tag} template() error:`, err)
    } finally {
      this._rendering = false
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
    this._scheduleRender()
    this.connected()
  }

  disconnectedCallback() {
    this._connected = false
    this._unbindEvents()
    this.disconnected()
  }

  /** Called when the element is added to the DOM. Override freely — no super needed. */
  connected() {}

  /** Called when the element is removed from the DOM. Override freely — no super needed. */
  disconnected() {}

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
