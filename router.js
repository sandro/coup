// coup/router.js — lightweight hash-based SPA router
//
// Usage:
//   import { Router } from './router.js'
//
//   const router = new Router([
//     '/',
//     '/add',
//     '/chat/:room',
//     '/files/*',         // wildcard — matches /files/a/b/c
//   ])
//
//   // In a component template:
//   if (router.pattern === '/chat/:room') {
//     return html`<chat-room .name=${router.params.room}></chat-room>`
//   }
//
//   // Wildcard match:
//   if (router.pattern === '/files/*') {
//     const filePath = router.params.wild  // 'a/b/c'
//   }
//
//   // Navigate (pushes history entry):
//   router.go('/chat/general')
//
//   // Replace (no history entry — good for redirects):
//   router.replace('/chat/general')
//
//   // Links:
//   html`<a href="#/chat/general">General</a>`

export class Router {
  constructor(patterns = []) {
    this._routes = patterns.map(p => ({
      pattern: p,
      regex: this._toRegex(p),
      paramNames: this._paramNames(p),
    }))

    /** Current matched pattern (e.g. '/chat/:room') or null */
    this.pattern = null
    /** Extracted params from the current route (e.g. { room: 'general' }) */
    this.params = {}

    this._listeners = new Set()
    this._onHashChange = () => this._resolveAndNotify()
    window.addEventListener('hashchange', this._onHashChange)

    if (!location.hash) {
      // Use replace so we don't fire a double hashchange on first load
      history.replaceState(null, '', '#/')
    }
    this._resolve()
  }

  /** Current hash path (without the #), normalized */
  get path() {
    return this._normalize(location.hash.slice(1) || '/')
  }

  /** Navigate to a path (pushes history entry) */
  go(path) {
    location.hash = '#' + path
  }

  /** Navigate without adding a history entry (good for redirects) */
  replace(path) {
    history.replaceState(null, '', '#' + path)
    this._resolveAndNotify()
  }

  /** Subscribe to route changes. Returns unsubscribe function. */
  subscribe(fn) {
    this._listeners.add(fn)
    return () => this._listeners.delete(fn)
  }

  /** Check if a path matches the current route */
  isActive(path) {
    return this._normalize(decodeURIComponent(this.path)) ===
           this._normalize(decodeURIComponent(path))
  }

  /** Clean up */
  destroy() {
    window.removeEventListener('hashchange', this._onHashChange)
    this._listeners.clear()
  }

  _resolveAndNotify() {
    const prevPattern = this.pattern
    const prevParams = this.params
    this._resolve()
    // Short-circuit: don't notify if nothing changed
    if (this.pattern === prevPattern &&
        JSON.stringify(this.params) === JSON.stringify(prevParams)) {
      return
    }
    this._listeners.forEach(fn => fn())
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

  /** Normalize path: strip trailing slash, collapse double slashes */
  _normalize(path) {
    let p = path.replace(/\/\/+/g, '/')
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
    return p || '/'
  }

  /** Extract param names from a pattern (e.g. ':room' → 'room', '*' → 'wild') */
  _paramNames(pattern) {
    const names = []
    for (const seg of pattern.split('/')) {
      if (seg.startsWith(':')) names.push(seg.slice(1))
      else if (seg === '*') names.push('wild')
    }
    return names
  }

  /** Convert a route pattern to a regex, escaping literal segments */
  _toRegex(pattern) {
    const parts = pattern.split('/')
    const regexParts = parts.map(part => {
      if (part.startsWith(':')) return '([^/]+)'
      if (part === '*') return '(.*)'
      // Escape regex metacharacters in literal segments
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    return new RegExp(`^${regexParts.join('/')}$`)
  }
}
