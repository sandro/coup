import { CoupElement, html, Store, repeat } from 'coup'
import { Router } from '../../router.js'

// ============================================================
// Store — the single source of truth, shared across components
// ============================================================

let nextId = 1

const bookmarkStore = new Store({
  bookmarks: [
    { id: nextId++, title: 'MDN Web Docs', url: 'https://developer.mozilla.org', tags: ['docs', 'reference'], pinned: true },
    { id: nextId++, title: 'lit-html Guide', url: 'https://lit.dev/docs/templates/overview/', tags: ['docs', 'lit'], pinned: false },
    { id: nextId++, title: 'Can I Use', url: 'https://caniuse.com', tags: ['tools', 'reference'], pinned: true },
    { id: nextId++, title: 'GitHub', url: 'https://github.com', tags: ['tools'], pinned: false },
    { id: nextId++, title: 'Hacker News', url: 'https://news.ycombinator.com', tags: ['news'], pinned: false },
    { id: nextId++, title: 'CSS Tricks', url: 'https://css-tricks.com', tags: ['docs', 'css'], pinned: false },
  ],
  search: '',
})

// ============================================================
// Router — views for browsing, adding, and filtering by tag
// ============================================================

const router = new Router({
  '/':          () => ({ view: 'list', tag: null }),
  '/add':       () => ({ view: 'add', tag: null }),
  '/tag/:tag':  ({ tag }) => ({ view: 'list', tag }),
})

// Derived data — computed from store + router, not stored
function getFilteredBookmarks() {
  const { bookmarks, search } = bookmarkStore.state
  const { tag } = router.render() || { tag: null }
  return bookmarks
    .filter(b => {
      if (tag && !b.tags.includes(tag)) return false
      if (search && !b.title.toLowerCase().includes(search.toLowerCase()) &&
          !b.url.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
}

function getAllTags() {
  const tags = new Set()
  for (const b of bookmarkStore.state.bookmarks) {
    for (const t of b.tags) tags.add(t)
  }
  return [...tags].sort()
}

// ============================================================
// bookmark-toolbar — search + tag filter via router links
// ============================================================

class BookmarkToolbar extends CoupElement {
  static tag = 'bookmark-toolbar'

  connected() {
    this._unsubStore = bookmarkStore.subscribe(() => this.render())
    this._unsubRouter = router.subscribe(() => this.render())
  }

  disconnected() {
    this._unsubStore()
    this._unsubRouter()
  }

  onSearch(e) {
    bookmarkStore.set({ search: e.target.value })
  }

  template() {
    const { search } = bookmarkStore.state
    const tags = getAllTags()
    const activeTag = (router.render() || {}).tag

    return html`
      <div class="toolbar">
        <input
          type="text"
          placeholder="Search bookmarks…"
          .value=${search}
          @input=${(e) => this.onSearch(e)}
        />
        <div class="tag-filters">
          <a class="tag-btn ${!activeTag ? 'active' : ''}" href="#/">all</a>
          ${tags.map(tag => html`
            <a
              class="tag-btn ${activeTag === tag ? 'active' : ''}"
              href="#/tag/${tag}"
            >${tag}</a>
          `)}
        </div>
      </div>
    `
  }
}
BookmarkToolbar.define()

// ============================================================
// bookmark-stats — shows counts, subscribes independently
// ============================================================

class BookmarkStats extends CoupElement {
  static tag = 'bookmark-stats'

  connected() {
    this._unsubStore = bookmarkStore.subscribe(() => this.render())
    this._unsubRouter = router.subscribe(() => this.render())
  }

  disconnected() {
    this._unsubStore()
    this._unsubRouter()
  }

  template() {
    const { bookmarks } = bookmarkStore.state
    const filtered = getFilteredBookmarks()
    const pinned = bookmarks.filter(b => b.pinned).length

    return html`
      <div class="stats">
        <span><strong>${bookmarks.length}</strong> total</span>
        <span><strong>${pinned}</strong> pinned</span>
        <span><strong>${filtered.length}</strong> showing</span>
        <span><strong>${getAllTags().length}</strong> tags</span>
      </div>
    `
  }
}
BookmarkStats.define()

// ============================================================
// bookmark-card — displays a single bookmark
// ============================================================

class BookmarkCard extends CoupElement {
  static tag = 'bookmark-card'
  static props = { bookmark: Object }

  togglePin() {
    bookmarkStore.set(s => ({
      bookmarks: s.bookmarks.map(b =>
        b.id === this.bookmark.id ? { ...b, pinned: !b.pinned } : b
      )
    }))
  }

  deleteBookmark() {
    bookmarkStore.set(s => ({
      bookmarks: s.bookmarks.filter(b => b.id !== this.bookmark.id)
    }))
  }

  template() {
    const b = this.bookmark
    if (!b) return html``
    const domain = new URL(b.url).hostname

    return html`
      <div class="bookmark">
        <img class="favicon"
          src="https://www.google.com/s2/favicons?domain=${domain}&sz=32"
          alt="" />
        <div class="info">
          <div class="title-row">
            <span class="title">
              ${b.pinned ? '⭐ ' : ''}
              <a href=${b.url} target="_blank">${b.title}</a>
            </span>
          </div>
          <div class="url">${b.url}</div>
        </div>
        <div class="tags">
          ${b.tags.map(t => html`<a class="tag" href="#/tag/${t}">${t}</a>`)}
        </div>
        <div class="actions">
          <button @click=${() => this.togglePin()} title=${b.pinned ? 'Unpin' : 'Pin'}>
            ${b.pinned ? '⭐' : '☆'}
          </button>
          <button class="delete" @click=${() => this.deleteBookmark()} title="Delete">✕</button>
        </div>
      </div>
    `
  }
}
BookmarkCard.define()

// ============================================================
// bookmark-list — renders the filtered list
// ============================================================

class BookmarkList extends CoupElement {
  static tag = 'bookmark-list'

  connected() {
    this._unsubStore = bookmarkStore.subscribe(() => this.render())
    this._unsubRouter = router.subscribe(() => this.render())
  }

  disconnected() {
    this._unsubStore()
    this._unsubRouter()
  }

  template() {
    const bookmarks = getFilteredBookmarks()

    if (bookmarks.length === 0) {
      return html`<div class="empty">No bookmarks match your search.</div>`
    }

    return html`
      <div class="bookmark-list">
        ${repeat(bookmarks, b => b.id, b => html`
          <bookmark-card .bookmark=${b}></bookmark-card>
        `)}
      </div>
    `
  }
}
BookmarkList.define()

// ============================================================
// bookmark-add — form to add new bookmarks (its own route)
// ============================================================

class BookmarkAdd extends CoupElement {
  static tag = 'bookmark-add'

  addBookmark(e) {
    e.preventDefault()
    const title = this.$('.title-input').value.trim()
    const url = this.$('.url-input').value.trim()
    const tags = this.$('.tags-input').value.trim()
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean)

    if (!title || !url) return

    bookmarkStore.set(s => ({
      bookmarks: [
        ...s.bookmarks,
        { id: nextId++, title, url, tags, pinned: false }
      ]
    }))

    // Navigate back to list after adding
    router.go('/')
  }

  template() {
    return html`
      <form class="add-form" @submit=${(e) => this.addBookmark(e)}>
        <h3>Add Bookmark</h3>
        <input class="title-input" type="text" placeholder="Title" required />
        <input class="url-input" type="text" placeholder="https://..." required />
        <input class="tags-input" type="text" placeholder="Tags (comma-separated)" />
        <div class="form-actions">
          <a href="#/" class="cancel-btn">Cancel</a>
          <button type="submit">Add Bookmark</button>
        </div>
      </form>
    `
  }
}
BookmarkAdd.define()

// ============================================================
// bookmark-app — top-level shell, uses router for views
// ============================================================

class BookmarkApp extends CoupElement {
  static tag = 'bookmark-app'

  connected() {
    this._unsubRouter = router.subscribe(() => this.render())
  }

  disconnected() {
    this._unsubRouter()
  }

  template() {
    const route = router.render() || { view: 'list' }

    return html`
      <nav class="app-nav">
        <a class="nav-link ${route.view === 'list' ? 'active' : ''}" href="#/">
          📑 Bookmarks
        </a>
        <a class="nav-link ${route.view === 'add' ? 'active' : ''}" href="#/add">
          + Add New
        </a>
      </nav>
      <bookmark-toolbar></bookmark-toolbar>
      <bookmark-stats></bookmark-stats>

      ${route.view === 'add'
        ? html`<bookmark-add></bookmark-add>`
        : html`<bookmark-list></bookmark-list>`
      }
    `
  }
}
BookmarkApp.define()
