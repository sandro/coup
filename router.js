// coup/router.js — lightweight hash-based SPA router
//
// Usage:
//   import { Router } from './router.js'
//
//   const router = new Router([
//     '/',
//     '/add',
//     '/chat/:room',
//   ])
//
//   // In a component template:
//   if (router.pattern === '/chat/:room') {
//     return html`<chat-room .name=${router.params.room}></chat-room>`
//   }
//
//   // Navigate:
//   router.go('/chat/general')
//
//   // Links:
//   html`<a href="#/chat/general">General</a>`

export class Router {
  constructor(patterns = []) {
    this._routes = patterns.map(p => ({
      pattern: p,
      regex: this._toRegex(p),
      paramNames: (p.match(/:[a-zA-Z_]+/g) || []).map(m => m.slice(1)),
    }))

    /** Current matched pattern (e.g. '/chat/:room') or null */
    this.pattern = null
    /** Extracted params from the current route (e.g. { room: 'general' }) */
    this.params = {}

    this._listeners = new Set()
    this._onHashChange = () => {
      this._resolve()
      this._listeners.forEach(fn => fn())
    }
    window.addEventListener('hashchange', this._onHashChange)

    if (!location.hash) location.hash = '#/'
    this._resolve()
  }

  /** Current hash path (without the #) */
  get path() {
    return location.hash.slice(1) || '/'
  }

  /** Navigate to a path */
  go(path) {
    location.hash = '#' + path
  }

  /** Subscribe to route changes. Returns unsubscribe function. */
  subscribe(fn) {
    this._listeners.add(fn)
    return () => this._listeners.delete(fn)
  }

  /** Check if a path matches the current route */
  isActive(path) {
    return this.path === path
  }

  /** Clean up */
  destroy() {
    window.removeEventListener('hashchange', this._onHashChange)
    this._listeners.clear()
  }

  _resolve() {
    const path = this.path
    for (const route of this._routes) {
      const m = path.match(route.regex)
      if (m) {
        this.pattern = route.pattern
        this.params = {}
        route.paramNames.forEach((name, i) => {
          this.params[name] = decodeURIComponent(m[i + 1])
        })
        return
      }
    }
    this.pattern = null
    this.params = {}
  }

  _toRegex(pattern) {
    const escaped = pattern
      .replace(/:[a-zA-Z_]+/g, '([^/]+)')
      .replace(/\*/g, '(.*)')
    return new RegExp(`^${escaped}$`)
  }
}
