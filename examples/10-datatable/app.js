import { CoupElement, html, nothing } from 'coup'
import { COUNTRIES } from './data.js'
CoupElement.debug = true

// ============================================================
// data-table — sortable, filterable, paginated country data
// Demonstrates: static state with multiple interacting filters,
// derived data in template(), debounced search, embedded data
// ============================================================

const PER_PAGE = 20

// Data format: [name, capital, region, population, area, flag]
const COLS = [
  { key: 0, label: 'Country',    sortable: true  },
  { key: 1, label: 'Capital',    sortable: true  },
  { key: 2, label: 'Region',     sortable: true  },
  { key: 3, label: 'Population', sortable: true, numeric: true },
  { key: 4, label: 'Area (km²)', sortable: true, numeric: true },
]

const REGIONS = [...new Set(COUNTRIES.map(c => c[2]))].sort()

function fmtNum(n) {
  return n ? n.toLocaleString() : '—'
}

// --- Component ---

class DataTable extends CoupElement {
  static tag = 'data-table'

  static state = {
    search: '',
    region: '',
    sortBy: 0,
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
    }, 200)
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

  #processRows() {
    let rows = COUNTRIES

    const q = this.search.toLowerCase().trim()
    if (q) {
      rows = rows.filter(r =>
        r[0].toLowerCase().includes(q) || // name
        r[1].toLowerCase().includes(q)    // capital
      )
    }

    if (this.region) {
      rows = rows.filter(r => r[2] === this.region)
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
        <input type="text" placeholder="Search countries or capitals…"
          .value=${this.search} @input=${(e) => this.onSearch(e)}>
        <select @change=${(e) => this.onRegion(e)}>
          <option value="">All Regions</option>
          ${REGIONS.map(r => html`
            <option value=${r} ?selected=${r === this.region}>${r}</option>
          `)}
        </select>
        <span class="count">${totalRows} countries</span>
      </div>

      ${pageRows.length === 0
        ? html`<div class="empty">No countries match your filters.</div>`
        : html`
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th class="flag-col"></th>
                ${COLS.map(col => html`
                  <th class=${col.numeric ? 'numeric' : ''}
                      @click=${() => this.onSort(col.key)}>
                    ${col.label}${this.sortBy === col.key
                      ? html`<span class="sort-arrow">${this.sortDir === 'asc' ? '▲' : '▼'}</span>`
                      : nothing}
                  </th>
                `)}
              </tr></thead>
              <tbody>
                ${pageRows.map(row => html`
                  <tr>
                    <td class="flag">${row[5]}</td>
                    <td class="name">${row[0]}</td>
                    <td>${row[1]}</td>
                    <td><span class="badge">${row[2]}</span></td>
                    <td class="numeric">${fmtNum(row[3])}</td>
                    <td class="numeric">${fmtNum(row[4])}</td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        `}

      <div class="pagination">
        <span>Showing ${totalRows === 0 ? 0 : start + 1}–${start + pageRows.length} of ${totalRows}</span>
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
