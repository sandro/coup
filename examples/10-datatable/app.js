import { CoupElement, html, nothing } from 'coup'
import { COUNTRIES } from './data.js'
CoupElement.debug = true

// ============================================================
// data-table — sortable, filterable, paginated, resizable,
// reorderable country data
//
// Demonstrates: static state with multiple interacting filters,
// derived data in template(), debounced search, pointer events
// for drag interactions, embedded data
// ============================================================

const PER_PAGE = 20

// Data format: [name, capital, region, population, area, flag]
const DEFAULT_COLS = [
  { key: 0, label: 'Country',    width: 180 },
  { key: 1, label: 'Capital',    width: 160 },
  { key: 2, label: 'Region',     width: 130 },
  { key: 3, label: 'Population', width: 130, numeric: true },
  { key: 4, label: 'Area (km²)', width: 130, numeric: true },
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
    columns: DEFAULT_COLS.map(c => ({ ...c })),
    columnFilters: {},  // { colKey: 'filter text' }
  }

  // --- Drag state (not reactive — no re-render needed) ---
  #debounceTimer = null
  #resizing = null     // { colIndex, startX, startWidth }
  #dragging = null     // { colIndex, startX }
  #dropTarget = -1

  disconnected() {
    clearTimeout(this.#debounceTimer)
  }

  // --- Search & region filter ---

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

  // --- Column filter ---

  onColumnFilter(colKey, e) {
    this.columnFilters = { ...this.columnFilters, [colKey]: e.target.value }
    this.page = 1
  }

  get hasColumnFilters() {
    return Object.values(this.columnFilters).some(v => v.trim())
  }

  clearColumnFilters() {
    this.columnFilters = {}
    this.page = 1
  }

  // --- Sort ---

  onSort(key) {
    if (this.sortBy === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'
    } else {
      this.sortBy = key
      this.sortDir = 'asc'
    }
  }

  // --- Pagination ---

  prevPage() { this.page = Math.max(1, this.page - 1) }
  nextPage(totalPages) { this.page = Math.min(totalPages, this.page + 1) }

  // --- Column resize ---

  onResizeStart(colIndex, e) {
    e.preventDefault()
    e.stopPropagation()
    const col = this.columns[colIndex]
    this.#resizing = { colIndex, startX: e.clientX, startWidth: col.width }
    const onMove = (ev) => {
      const delta = ev.clientX - this.#resizing.startX
      const newWidth = Math.max(60, this.#resizing.startWidth + delta)
      const cols = this.columns.map((c, i) =>
        i === this.#resizing.colIndex ? { ...c, width: newWidth } : c
      )
      this.columns = cols
    }
    const onUp = () => {
      this.#resizing = null
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  // --- Column reorder (drag & drop) ---

  onDragStart(colIndex, e) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', colIndex)
    this.#dragging = { colIndex }
    // Style the dragged header
    e.target.closest('th').classList.add('dragging')
  }

  onDragOver(colIndex, e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (this.#dropTarget !== colIndex) {
      this.#dropTarget = colIndex
      // Visual feedback: highlight drop target
      this.$$('thead th').forEach((th, i) => {
        // +1 because flag col is index 0
        th.classList.toggle('drop-target', i === colIndex + 1)
      })
    }
  }

  onDragEnd(e) {
    e.target.closest('th')?.classList.remove('dragging')
    this.$$('thead th').forEach(th => th.classList.remove('drop-target'))
    this.#dragging = null
    this.#dropTarget = -1
  }

  onDrop(targetIndex, e) {
    e.preventDefault()
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'))
    if (fromIndex === targetIndex) return

    const cols = [...this.columns]
    const [moved] = cols.splice(fromIndex, 1)
    cols.splice(targetIndex, 0, moved)
    this.columns = cols
  }

  // --- Process rows ---

  #processRows() {
    let rows = COUNTRIES

    // Global search
    const q = this.search.toLowerCase().trim()
    if (q) {
      rows = rows.filter(r =>
        r[0].toLowerCase().includes(q) ||
        r[1].toLowerCase().includes(q)
      )
    }

    // Region dropdown
    if (this.region) {
      rows = rows.filter(r => r[2] === this.region)
    }

    // Per-column filters
    for (const [colKey, filter] of Object.entries(this.columnFilters)) {
      const f = filter.toLowerCase().trim()
      if (!f) continue
      const key = parseInt(colKey)
      rows = rows.filter(r => {
        const val = r[key]
        if (typeof val === 'number') return fmtNum(val).toLowerCase().includes(f)
        return String(val).toLowerCase().includes(f)
      })
    }

    // Sort
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

  // --- Template ---

  template() {
    const { pageRows, totalRows, totalPages, page, start } = this.#processRows()
    const cols = this.columns

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
        ${this.hasColumnFilters ? html`
          <button class="clear-filters" @click=${() => this.clearColumnFilters()}>✕ Clear filters</button>
        ` : nothing}
        <span class="count">${totalRows} countries</span>
      </div>

      <div class="table-wrap">
        <table>
          <colgroup>
            <col style="width:36px">
            ${cols.map(col => html`<col style="width:${col.width}px">`)}
          </colgroup>
          <thead>
            <tr>
              <th class="flag-col"></th>
              ${cols.map((col, i) => html`
                <th class=${col.numeric ? 'numeric' : ''}
                    draggable="true"
                    @click=${() => this.onSort(col.key)}
                    @dragstart=${(e) => this.onDragStart(i, e)}
                    @dragover=${(e) => this.onDragOver(i, e)}
                    @dragend=${(e) => this.onDragEnd(e)}
                    @drop=${(e) => this.onDrop(i, e)}>
                  <span class="th-label">${col.label}${this.sortBy === col.key
                    ? html`<span class="sort-arrow">${this.sortDir === 'asc' ? '▲' : '▼'}</span>`
                    : nothing}</span>
                  <span class="resize-handle"
                    @pointerdown=${(e) => this.onResizeStart(i, e)}></span>
                </th>
              `)}
            </tr>
            <tr class="filter-row">
              <th class="flag-col"></th>
              ${cols.map(col => html`
                <th>
                  <input type="text" class="col-filter"
                    placeholder="Filter…"
                    .value=${this.columnFilters[col.key] || ''}
                    @input=${(e) => this.onColumnFilter(col.key, e)}
                    @click=${(e) => e.stopPropagation()}>
                </th>
              `)}
            </tr>
          </thead>
          <tbody>
            ${pageRows.length === 0
              ? html`<tr><td colspan=${cols.length + 1} class="empty">No countries match your filters.</td></tr>`
              : pageRows.map(row => html`
                <tr>
                  <td class="flag">${row[5]}</td>
                  ${cols.map(col => html`
                    <td class=${col.numeric ? 'numeric' : (col.key === 0 ? 'name' : '')}>
                      ${col.key === 2
                        ? html`<span class="badge">${row[col.key]}</span>`
                        : col.numeric
                          ? fmtNum(row[col.key])
                          : row[col.key]}
                    </td>
                  `)}
                </tr>
              `)}
          </tbody>
        </table>
      </div>

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
