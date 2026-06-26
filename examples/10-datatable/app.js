import { CoupElement, html, nothing } from 'coup'
CoupElement.debug = true

// ============================================================
// data-table — sortable, filterable, paginated country data
// Demonstrates: fetch, derived state in template, debounce
// ============================================================

const PER_PAGE = 20

const REGIONS = ['All', 'Africa', 'Americas', 'Antarctic', 'Asia', 'Europe', 'Oceania']

const COLUMNS = [
  { key: 'flag',       label: '',           sortable: false },
  { key: 'name',       label: 'Country',    sortable: true  },
  { key: 'capital',    label: 'Capital',    sortable: true  },
  { key: 'region',     label: 'Region',     sortable: true  },
  { key: 'population', label: 'Population', sortable: true  },
  { key: 'area',       label: 'Area',       sortable: true  },
]

class DataTable extends CoupElement {
  static tag = 'data-table'

  static state = {
    countries: [],
    loading: true,
    error: null,
    search: '',
    region: '',
    sortBy: 'name',
    sortDir: 'asc',
    page: 1,
  }

  #debounceTimer = null

  async connected() {
    try {
      const res = await fetch('https://restcountries.com/v3.1/all')
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json()

      this.countries = data.map(c => ({
        name: c.name?.common ?? '—',
        capital: c.capital?.[0] ?? '—',
        region: c.region ?? '—',
        population: c.population ?? 0,
        area: c.area ?? 0,
        flag: c.flag ?? '',
      }))
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

  onRegion(e) {
    this.region = e.target.value
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
    let rows = this.countries

    // Filter by search
    const q = this.search.toLowerCase().trim()
    if (q) {
      rows = rows.filter(r => r.name.toLowerCase().includes(q))
    }

    // Filter by region
    if (this.region) {
      rows = rows.filter(r => r.region === this.region)
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
      return html`<div class="loading"><span class="spinner"></span> Loading countries…</div>`
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
          placeholder="Search countries…"
          .value=${this.search}
          @input=${(e) => this.onSearch(e)}
        >
        <select @change=${(e) => this.onRegion(e)}>
          ${REGIONS.map(r => html`
            <option value=${r === 'All' ? '' : r} ?selected=${(r === 'All' ? '' : r) === this.region}>
              ${r}
            </option>
          `)}
        </select>
      </div>
    `
  }

  #renderTable(rows) {
    if (rows.length === 0) {
      return html`<div class="empty">No countries match your filters.</div>`
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
                <td class="flag">${row.flag}</td>
                <td>${row.name}</td>
                <td>${row.capital}</td>
                <td>${row.region}</td>
                <td class="numeric">${row.population.toLocaleString()}</td>
                <td class="numeric">${row.area.toLocaleString()} km²</td>
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
          <span>${totalRows} ${totalRows === 1 ? 'country' : 'countries'}</span>
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
