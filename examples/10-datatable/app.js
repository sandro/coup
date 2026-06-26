import { CoupElement, html, nothing } from 'coup'
CoupElement.debug = true

// ============================================================
// data-table — sortable, filterable, paginated product data
// Demonstrates: fetch, derived state in template, debounce
// ============================================================

const PER_PAGE = 20

const COLUMNS = [
  { key: 'title',    label: 'Product',  sortable: true  },
  { key: 'category', label: 'Category', sortable: true  },
  { key: 'price',    label: 'Price',    sortable: true  },
  { key: 'rating',   label: 'Rating',   sortable: true  },
  { key: 'stock',    label: 'Stock',    sortable: true  },
  { key: 'brand',    label: 'Brand',    sortable: true  },
]

class DataTable extends CoupElement {
  static tag = 'data-table'

  static state = {
    products: [],
    categories: [],
    loading: true,
    error: null,
    search: '',
    category: '',
    sortBy: 'title',
    sortDir: 'asc',
    page: 1,
  }

  #debounceTimer = null

  async connected() {
    try {
      const [prodRes, catRes] = await Promise.all([
        fetch('https://dummyjson.com/products?limit=200'),
        fetch('https://dummyjson.com/products/categories'),
      ])
      if (!prodRes.ok || !catRes.ok) throw new Error(`API error`)
      const prodData = await prodRes.json()
      const catData = await catRes.json()

      this.products = prodData.products.map(p => ({
        title: p.title,
        category: p.category,
        price: p.price,
        rating: p.rating,
        stock: p.stock,
        brand: p.brand || '—',
        thumbnail: p.thumbnail,
      }))
      this.categories = catData.map(c => c.name)
      this.loading = false
    } catch (err) {
      this.error = err.message
      this.loading = false
    }
  }

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

  // --- Derive filtered/sorted/paginated rows ---

  #processRows() {
    let rows = this.products

    // Filter by search
    const q = this.search.toLowerCase().trim()
    if (q) {
      rows = rows.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.brand.toLowerCase().includes(q)
      )
    }

    // Filter by category
    if (this.category) {
      rows = rows.filter(r => r.category === this.category)
    }

    // Sort
    const dir = this.sortDir === 'asc' ? 1 : -1
    const key = this.sortBy
    rows = [...rows].sort((a, b) => {
      const av = a[key]
      const bv = b[key]
      if (typeof av === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })

    // Paginate
    const totalRows = rows.length
    const totalPages = Math.max(1, Math.ceil(totalRows / PER_PAGE))
    const page = Math.min(this.page, totalPages)
    const start = (page - 1) * PER_PAGE
    const pageRows = rows.slice(start, start + PER_PAGE)

    return { pageRows, totalRows, totalPages, page, start }
  }

  // --- Render ---

  template() {
    if (this.loading) {
      return html`<div class="loading"><span class="spinner"></span> Loading products…</div>`
    }

    if (this.error) {
      return html`<div class="error">⚠️ ${this.error}</div>`
    }

    const { pageRows, totalRows, totalPages, page, start } = this.#processRows()

    return html`
      ${this.#renderControls()}
      ${this.#renderTable(pageRows)}
      ${this.#renderPagination(totalRows, totalPages, page, start, pageRows.length)}
    `
  }

  #renderControls() {
    return html`
      <div class="controls">
        <input
          type="text"
          placeholder="Search products…"
          .value=${this.search}
          @input=${(e) => this.onSearch(e)}
        >
        <select @change=${(e) => this.onCategory(e)}>
          <option value="">All Categories</option>
          ${this.categories.map(c => html`
            <option value=${c.toLowerCase()} ?selected=${c.toLowerCase() === this.category}>
              ${c}
            </option>
          `)}
        </select>
      </div>
    `
  }

  #renderTable(rows) {
    if (rows.length === 0) {
      return html`<div class="empty">No products match your filters.</div>`
    }

    return html`
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              ${COLUMNS.map(col => html`
                <th @click=${col.sortable ? () => this.onSort(col.key) : null}>
                  ${col.label}${col.sortable ? this.#sortArrow(col.key) : nothing}
                </th>
              `)}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => html`
              <tr>
                <td class="product-name">
                  <img src=${row.thumbnail} alt="" loading="lazy">
                  ${row.title}
                </td>
                <td><span class="badge">${row.category}</span></td>
                <td class="numeric">$${row.price.toFixed(2)}</td>
                <td class="numeric">${'★'.repeat(Math.round(row.rating))}${'☆'.repeat(5 - Math.round(row.rating))} <span class="rating-num">${row.rating.toFixed(1)}</span></td>
                <td class="numeric ${row.stock < 10 ? 'low-stock' : ''}">${row.stock}</td>
                <td>${row.brand}</td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    `
  }

  #sortArrow(key) {
    if (this.sortBy !== key) return nothing
    return html`<span class="sort-arrow">${this.sortDir === 'asc' ? '▲' : '▼'}</span>`
  }

  #renderPagination(totalRows, totalPages, page, start, pageLen) {
    const end = start + pageLen

    return html`
      <div class="pagination">
        <div class="info">
          <span>${totalRows} ${totalRows === 1 ? 'product' : 'products'}</span>
          <span>Showing ${totalRows === 0 ? 0 : start + 1}–${end} of ${totalRows}</span>
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
