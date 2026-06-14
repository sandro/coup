import { CoupElement, html, Store, repeat } from 'coup'
import { Router } from '../../router.js'

// ────────────────────────────────────────────────────
// Store — single source of truth for bookmarks
// ────────────────────────────────────────────────────

const bookmarkStore = new Store({
  bookmarks: [
    { id: 1, title: 'MDN Web Docs',    url: 'https://developer.mozilla.org', tags: ['docs', 'reference'], pinned: true },
    { id: 2, title: 'GitHub',          url: 'https://github.com',            tags: ['tools', 'code'],      pinned: true },
    { id: 3, title: 'Hacker News',     url: 'https://news.ycombinator.com',  tags: ['news', 'tech'],       pinned: false },
    { id: 4, title: 'Can I Use',       url: 'https://caniuse.com',           tags: ['docs', 'reference'],  pinned: false },
    { id: 5, title: 'Lobsters',        url: 'https://lobste.rs',             tags: ['news', 'tech'],       pinned: false },
    { id: 6, title: 'Bundlephobia',    url: 'https://bundlephobia.com',      tags: ['tools', 'docs'],      pinned: false },
  ],
  search: '',
  nextId: 7,
})

// ────────────────────────────────────────────────────
// Router
// ────────────────────────────────────────────────────

const router = new Router([
  '/',
  '/add',
  '/tag/:tag',
])

// ────────────────────────────────────────────────────
// Derived data — computed from store + router
// ────────────────────────────────────────────────────

function getFilteredBookmarks() {
  const { bookmarks, search } = bookmarkStore.state
  const tag = router.params.tag || null
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
  bookmarkStore.state.bookmarks.forEach(b => b.tags.forEach(t => tags.add(t)))
  return [...tags].sort()
}


// ────────────────────────────────────────────────────
// bookmark-toolbar: search + tag filter
// ────────────────────────────────────────────────────

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
    const activeTag = router.params.tag || null

    return html`
      <div class="toolbar">
        <input
          type="text"
          placeholder="Search bookmarks…"
          .value=${search}
          @input=${(e) => this.onSearch(e)}
        />
        <div class="tags">
          <a
            class="tag-btn ${!activeTag ? 'active' : ''}"
            href="#/"
          >all</a>
          ${tags.map(tag => html`
            <a
              class="tag-btn ${tag === activeTag ? 'active' : ''}"
              href="#/tag/${tag}"
            >${tag}</a>
          `)}
        </div>
      </div>
    `
  }
}
BookmarkToolbar.define()


// ────────────────────────────────────────────────────
// bookmark-stats: shows counts
// ────────────────────────────────────────────────────

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
    const all = bookmarkStore.state.bookmarks.length
    const filtered = getFilteredBookmarks().length
    const pinned = bookmarkStore.state.bookmarks.filter(b => b.pinned).length

    return html`
      <div class="stats">
        Showing ${filtered} of ${all} bookmarks · ${pinned} pinned
      </div>
    `
  }
}
BookmarkStats.define()


// ────────────────────────────────────────────────────
// bookmark-card: a single bookmark
// ────────────────────────────────────────────────────

class BookmarkCard extends CoupElement {
  static tag = 'bookmark-card'
  static props = { bookmark: Object }

  togglePin() {
    const b = this.bookmark
    bookmarkStore.set(s => ({
      bookmarks: s.bookmarks.map(x =>
        x.id === b.id ? { ...x, pinned: !x.pinned } : x
      )
    }))
  }

  deleteBookmark() {
    const b = this.bookmark
    bookmarkStore.set(s => ({
      bookmarks: s.bookmarks.filter(x => x.id !== b.id)
    }))
  }

  template() {
    const b = this.bookmark
    if (!b) return html``

    return html`
      <div class="bookmark">
        <div class="bookmark-header">
          <button @click=${() => this.togglePin()} title="${b.pinned ? 'Unpin' : 'Pin'}">
            ${b.pinned ? '⭐' : '☆'}
          </button>
          <a href=${b.url} target="_blank" class="bookmark-title">
            ${b.pinned ? '⭐ ' : ''}${b.title}
          </a>
          <button class="delete" @click=${() => this.deleteBookmark()}>✕</button>
        </div>
        <div class="bookmark-url">${b.url}</div>
        <div class="bookmark-tags">
          ${b.tags.map(t => html`<a class="tag" href="#/tag/${t}">${t}</a>`)}
        </div>
      </div>
    `
  }
}
BookmarkCard.define()


// ────────────────────────────────────────────────────
// bookmark-list: filtered list of bookmark-cards
// ────────────────────────────────────────────────────

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

    return html`
      ${repeat(bookmarks, b => b.id, b => html`
        <bookmark-card .bookmark=${b}></bookmark-card>
      `)}
      ${bookmarks.length === 0 ? html`
        <div class="empty">No bookmarks match your search.</div>
      ` : ''}
    `
  }
}
BookmarkList.define()


// ────────────────────────────────────────────────────
// bookmark-add: form to add new bookmarks
// ────────────────────────────────────────────────────

class BookmarkAdd extends CoupElement {
  static tag = 'bookmark-add'

  addBookmark(e) {
    e.preventDefault()
    const title = this.$('.title-input').value.trim()
    const url = this.$('.url-input').value.trim()
    const tagsStr = this.$('.tags-input').value.trim()
    if (!title || !url) return

    bookmarkStore.set(s => ({
      bookmarks: [...s.bookmarks, {
        id: s.nextId,
        title,
        url: url.startsWith('http') ? url : `https://${url}`,
        tags: tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [],
        pinned: false,
      }],
      nextId: s.nextId + 1,
    }))

    router.go('/')
  }

  template() {
    return html`
      <form class="add-form" @submit=${(e) => this.addBookmark(e)}>
        <h3>Add Bookmark</h3>
        <input class="title-input" type="text" placeholder="Title" required />
        <input class="url-input" type="url" placeholder="https://example.com" required />
        <input class="tags-input" type="text" placeholder="Tags (comma separated)" />
        <div class="form-actions">
          <a class="cancel-btn" href="#/">Cancel</a>
          <button type="submit">Add Bookmark</button>
        </div>
      </form>
    `
  }
}
BookmarkAdd.define()


// ────────────────────────────────────────────────────
// bookmark-app: top-level shell with route-based views
// ────────────────────────────────────────────────────

class BookmarkApp extends CoupElement {
  static tag = 'bookmark-app'

  connected() {
    this._unsubRouter = router.subscribe(() => this.render())
  }

  disconnected() {
    this._unsubRouter()
  }

  template() {
    if (router.pattern === null) {
      return html`
        <div style="padding: 2rem; text-align: center;">
          <h2>Page not found</h2>
          <p><a href="#/" style="color: #60a5fa;">Back to bookmarks</a></p>
        </div>
      `
    }

    const isAdd = router.pattern === '/add'

    return html`
      <nav class="app-nav">
        <a class="nav-link ${!isAdd ? 'active' : ''}" href="#/">
          📑 Bookmarks
        </a>
        <a class="nav-link ${isAdd ? 'active' : ''}" href="#/add">
          + Add New
        </a>
      </nav>

      ${isAdd ? html`
        <bookmark-add></bookmark-add>
      ` : html`
        <bookmark-toolbar></bookmark-toolbar>
        <bookmark-stats></bookmark-stats>
        <bookmark-list></bookmark-list>
      `}
    `
  }
}
BookmarkApp.define()
