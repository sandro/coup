import { CoupElement, html, Store, repeat } from 'coup'

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
  activeTag: null,
})

// Derived data — computed from the store, not stored separately
function getFilteredBookmarks() {
  const { bookmarks, search, activeTag } = bookmarkStore.state
  return bookmarks
    .filter(b => {
      if (activeTag && !b.tags.includes(activeTag)) return false
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
// bookmark-toolbar — search + tag filter
// Subscribes to the store to highlight active tag
// ============================================================

class BookmarkToolbar extends CoupElement {
  static tag = 'bookmark-toolbar'

  connected() {
    this._unsub = bookmarkStore.subscribe(() => this.render())
  }

  disconnected() {
    this._unsub()
  }

  onSearch(e) {
    bookmarkStore.set({ search: e.target.value })
  }

  toggleTag(tag) {
    const current = bookmarkStore.state.activeTag
    bookmarkStore.set({ activeTag: current === tag ? null : tag })
  }

  template() {
    const { search, activeTag } = bookmarkStore.state
    const tags = getAllTags()

    return html`
      <div class="toolbar">
        <input
          type="text"
          placeholder="Search bookmarks…"
          .value=${search}
          @input=${(e) => this.onSearch(e)}
        />
        <div class="tag-filters">
          ${tags.map(tag => html`
            <button
              class="tag-btn ${activeTag === tag ? 'active' : ''}"
              @click=${() => this.toggleTag(tag)}
            >${tag}</button>
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
    this._unsub = bookmarkStore.subscribe(() => this.render())
  }

  disconnected() {
    this._unsub()
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
              ${b.pinned ? '📌 ' : ''}
              <a href=${b.url} target="_blank">${b.title}</a>
            </span>
          </div>
          <div class="url">${b.url}</div>
        </div>
        <div class="tags">
          ${b.tags.map(t => html`<span class="tag">${t}</span>`)}
        </div>
        <div class="actions">
          <button @click=${() => this.togglePin()} title=${b.pinned ? 'Unpin' : 'Pin'}>
            ${b.pinned ? '📌' : '📎'}
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
    this._unsub = bookmarkStore.subscribe(() => this.render())
  }

  disconnected() {
    this._unsub()
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
// bookmark-add — form to add new bookmarks
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

    this.$('.title-input').value = ''
    this.$('.url-input').value = ''
    this.$('.tags-input').value = ''
  }

  template() {
    return html`
      <form class="add-form" @submit=${(e) => this.addBookmark(e)}>
        <input class="title-input" type="text" placeholder="Title" required />
        <input class="url-input" type="text" placeholder="https://..." required />
        <input class="tags-input" type="text" placeholder="Tags (comma-separated)" style="grid-column: 1 / 3" />
        <button type="submit">Add</button>
      </form>
    `
  }
}
BookmarkAdd.define()

// ============================================================
// bookmark-app — top-level shell, composes the others
// Does NOT subscribe to the store — it's static layout
// ============================================================

class BookmarkApp extends CoupElement {
  static tag = 'bookmark-app'

  template() {
    return html`
      <bookmark-toolbar></bookmark-toolbar>
      <bookmark-stats></bookmark-stats>
      <bookmark-add></bookmark-add>
      <bookmark-list></bookmark-list>
    `
  }
}
BookmarkApp.define()
