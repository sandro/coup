// coup/router.js — lightweight hash-based SPA router
//
// Usage:
//   import { Router } from './router.js'
//
//   const router = new Router({
//     '/':           () => html`<home-page></home-page>`,
//     '/chat/:room': ({ room }) => html`<chat-room .name=${room}></chat-room>`,
//     '/bookmarks':  () => html`<bookmark-list></bookmark-list>`,
//   })
//
//   // In a component:
//   template() { return router.render() }
//
//   // Navigate:
//   router.go('/chat/general')
//
//   // Links:
//   html`<a href="#/chat/general">General</a>`

export class Router {
  constructor(routes = {}) {
    this._routes = Object.entries(routes).map(([pattern, handler]) => ({
      pattern,
      handler,
      regex: this._toRegex(pattern),
      paramNames: this._extractParams(pattern),
    }))
    this._listeners = new Set()
    this._current = null

    this._onHashChange = () => {
      this._current = null // bust cache
      this._listeners.forEach(fn => fn(this.match()))
    }
    window.addEventListener('hashchange', this._onHashChange)

    // Set initial route
    if (!location.hash) location.hash = '#/'
  }

  /** Convert a route pattern to a regex */
  _toRegex(pattern) {
    const escaped = pattern
      .replace(/:[a-zA-Z_]+/g, '([^/]+)')  // :param → capture group
      .replace(/\*/g, '(.*)')               // * → wildcard
    return new RegExp(`^${escaped}$`)
  }

  /** Extract param names from a pattern */
  _extractParams(pattern) {
    const matches = pattern.match(/:[a-zA-Z_]+/g)
    return matches ? matches.map(m => m.slice(1)) : []
  }

  /** Get current hash path (without the #) */
  get path() {
    return location.hash.slice(1) || '/'
  }

  /** Match current path against routes */
  match() {
    if (this._current) return this._current

    const path = this.path
    for (const route of this._routes) {
      const m = path.match(route.regex)
      if (m) {
        const params = {}
        route.paramNames.forEach((name, i) => {
          params[name] = decodeURIComponent(m[i + 1])
        })
        this._current = { path, pattern: route.pattern, params, handler: route.handler }
        return this._current
      }
    }
    return { path, pattern: null, params: {}, handler: null }
  }

  /** Render the matched route's template */
  render() {
    const { handler, params } = this.match()
    return handler ? handler(params) : null
  }

  /** Navigate to a path programmatically */
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

  /** Check if a path prefix matches (for nav highlighting) */
  isActivePrefix(prefix) {
    return this.path.startsWith(prefix)
  }

  /** Clean up — remove hashchange listener */
  destroy() {
    window.removeEventListener('hashchange', this._onHashChange)
    this._listeners.clear()
  }
}
