import { CoupElement, html, nothing } from 'coup'
CoupElement.debug = true

// ============================================================
// data-table — sortable, filterable, paginated product data
// Demonstrates: static state with multiple interacting filters,
// derived data in template(), debounced search
// ============================================================

const PER_PAGE = 20

const COLUMNS = [
  { key: 'name',     label: 'Product',  sortable: true  },
  { key: 'category', label: 'Category', sortable: true  },
  { key: 'price',    label: 'Price',    sortable: true  },
  { key: 'rating',   label: 'Rating',   sortable: true  },
  { key: 'stock',    label: 'Stock',    sortable: true  },
]

// --- Seed data (no API dependency — table demo is about the UI pattern) ---

const CATEGORIES = ['Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books', 'Toys', 'Food', 'Health']
const ADJECTIVES = ['Premium', 'Classic', 'Ultra', 'Pro', 'Essential', 'Deluxe', 'Compact', 'Smart']
const NOUNS = {
  Electronics: ['Headphones', 'Speaker', 'Keyboard', 'Monitor', 'Webcam', 'Charger', 'Cable', 'Mouse'],
  Clothing: ['T-Shirt', 'Jacket', 'Sneakers', 'Hat', 'Hoodie', 'Jeans', 'Socks', 'Scarf'],
  'Home & Garden': ['Lamp', 'Planter', 'Rug', 'Candle', 'Cushion', 'Vase', 'Clock', 'Mirror'],
  Sports: ['Water Bottle', 'Yoga Mat', 'Dumbbells', 'Jump Rope', 'Resistance Band', 'Gloves', 'Towel', 'Bag'],
  Books: ['Novel', 'Cookbook', 'Biography', 'Textbook', 'Journal', 'Planner', 'Guide', 'Atlas'],
  Toys: ['Puzzle', 'Building Set', 'Board Game', 'Action Figure', 'Stuffed Animal', 'Card Game', 'Drone', 'Robot'],
  Food: ['Coffee', 'Chocolate', 'Granola', 'Hot Sauce', 'Honey', 'Olive Oil', 'Tea', 'Protein Bar'],
  Health: ['Vitamins', 'Sunscreen', 'Hand Cream', 'Lip Balm', 'Shampoo', 'Toothpaste', 'Face Mask', 'Soap'],
}

function seededRandom(seed) {
  let s = seed
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647 }
}

function generateProducts(count) {
  const rand = seededRandom(42)
  const products = []
  for (let i = 0; i < count; i++) {
    const cat = CATEGORIES[Math.floor(rand() * CATEGORIES.length)]
    const adj = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)]
    const noun = NOUNS[cat][Math.floor(rand() * NOUNS[cat].length)]
    products.push({
      id: i + 1,
      name: `${adj} ${noun}`,
      category: cat,
      price: Math.round((rand() * 200 + 5) * 100) / 100,
      rating: Math.round((rand() * 4 + 1) * 10) / 10,
      stock: Math.floor(rand() * 500),
    })
  }
  return products
}

const ALL_PRODUCTS = generateProducts(200)

// --- Component ---

class DataTable extends CoupElement {
  static tag = 'data-table'

  static state = {
    search: '',
    category: '',
    sortBy: 'name',
    sortDir: 'asc',
    page: 1,
  }

  #debounceTimer = null

  disconnected() {
    clearTimeout(this.#debounceTimer)
  }

  onSearch(e) {
    clearTimeout(this.#debounceTimer)
    const value = e.target.value
    this.#debounceTimer = setTimeout(() => {
      this.search = value
      this.page = 1
    }, 250)
  }

  onCategory(e) {
    this.category = e.target.value
    this.page = 1
  }

  onSort(key) {
    if (this.sortBy === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'
    } else {
      this.sortBy = key
      this.sortDir = 'asc'
    }
  }

  prevPage() { this.page = Math.max(1, this.page - 1) }
  nextPage(totalPages) { this.page = Math.min(totalPages, this.page + 1) }

  #processRows() {
    let rows = ALL_PRODUCTS

    const q = this.search.toLowerCase().trim()
    if (q) {
      rows = rows.filter(r => r.name.toLowerCase().includes(q))
    }

    if (this.category) {
      rows = rows.filter(r => r.category === this.category)
    }

    const dir = this.sortDir === 'asc' ? 1 : -1
    const key = this.sortBy
    rows = [...rows].sort((a, b) => {
      const av = a[key], bv = b[key]
      if (typeof av === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })

    const totalRows = rows.length
    const totalPages = Math.max(1, Math.ceil(totalRows / PER_PAGE))
    const page = Math.min(this.page, totalPages)
    const start = (page - 1) * PER_PAGE
    const pageRows = rows.slice(start, start + PER_PAGE)

    return { pageRows, totalRows, totalPages, page, start }
  }

  template() {
    const { pageRows, totalRows, totalPages, page, start } = this.#processRows()

    return html`
      <div class="controls">
        <input type="text" placeholder="Search products…"
          .value=${this.search} @input=${(e) => this.onSearch(e)}>
        <select @change=${(e) => this.onCategory(e)}>
          <option value="">All Categories</option>
          ${CATEGORIES.map(c => html`
            <option value=${c} ?selected=${c === this.category}>${c}</option>
          `)}
        </select>
      </div>

      ${pageRows.length === 0
        ? html`<div class="empty">No products match your filters.</div>`
        : html`
          <div class="table-wrap">
            <table>
              <thead><tr>
                ${COLUMNS.map(col => html`
                  <th @click=${() => this.onSort(col.key)}>
                    ${col.label}${this.sortBy === col.key
                      ? html`<span class="sort-arrow">${this.sortDir === 'asc' ? '▲' : '▼'}</span>`
                      : nothing}
                  </th>
                `)}
              </tr></thead>
              <tbody>
                ${pageRows.map(row => html`
                  <tr>
                    <td>${row.name}</td>
                    <td><span class="badge">${row.category}</span></td>
                    <td class="numeric">$${row.price.toFixed(2)}</td>
                    <td class="numeric">${'★'.repeat(Math.round(row.rating))}${'☆'.repeat(5 - Math.round(row.rating))} <span class="rating-num">${row.rating.toFixed(1)}</span></td>
                    <td class="numeric ${row.stock < 10 ? 'low-stock' : ''}">${row.stock}</td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        `}

      <div class="pagination">
        <div class="info">
          <span>${totalRows} products</span>
          <span>Showing ${totalRows === 0 ? 0 : start + 1}–${start + pageRows.length} of ${totalRows}</span>
        </div>
        <div class="pages">
          <button ?disabled=${page <= 1} @click=${() => this.prevPage()}>← Prev</button>
          <span>Page ${page} of ${totalPages}</span>
          <button ?disabled=${page >= totalPages} @click=${() => this.nextPage(totalPages)}>Next →</button>
        </div>
      </div>
    `
  }
}

DataTable.define()
