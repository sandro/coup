import { CoupElement, html, nothing } from 'coup'
import { QueryClient } from 'coup/query.js'
CoupElement.debug = true

// Movie Search — QueryClient demo
// Demonstrates: cache hits, prefetching, abort, pagination,
// rows-per-page with multi-page fetching, clear cache

const API = 'https://www.omdbapi.com/?apikey=30eac5ba'
const qc = new QueryClient({ staleTime: 300_000 }) // 5 min cache for movie data

const searchPage = (query, page, signal) =>
  fetch(`${API}&s=${encodeURIComponent(query)}&page=${page}`, { signal }).then(r => r.json())

const detailById = (id, signal) =>
  fetch(`${API}&i=${id}&plot=full`, { signal }).then(r => r.json())

const NO_POSTER = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22450%22><rect fill=%22%2321262d%22 width=%22300%22 height=%22450%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%23484f58%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2216%22>No Poster</text></svg>`
const poster = url => url !== 'N/A' ? url : NO_POSTER

class MovieSearch extends CoupElement {
  static tag = 'movie-search'

  state = {
    query: '', page: 1, perPage: 10,
    results: null,   // { movies: [], totalResults }
    loading: false, error: null, cached: false,
    detailId: null, detail: null, detailLoading: false, detailError: null,
  }

  connected() { requestAnimationFrame(() => this.$('input')?.focus()) }

  // --- Search with debounce + abort ---

  _onInput(e) {
    const query = e.target.value.trim()
    this.state.query = query
    this.state.page = 1
    qc.cancel(['search']) // abort in-flight — demonstrates AbortController
    clearTimeout(this._debounce)
    if (!query) {
      this.state.results = null
      this.state.error = null
      this.state.loading = false
      this.render()
      return
    }
    this._debounce = setTimeout(() => this._doSearch(query, 1), 350)
    this.render()
  }

  async _doSearch(query, page) {
    const { perPage } = this.state
    const pagesNeeded = perPage / 10  // OMDb returns 10 per page
    const startPage = (page - 1) * pagesNeeded + 1

    this.state.loading = true
    this.state.error = null
    this.state.cached = false
    this.render()

    try {
      // Check cache before fetching (for "cached" badge)
      let allCached = true
      for (let i = 0; i < pagesNeeded; i++)
        if (!qc.get(['search', query, startPage + i])) allCached = false

      // Fetch all needed OMDb pages (may resolve from cache instantly)
      const pages = await Promise.all(
        Array.from({ length: pagesNeeded }, (_, i) =>
          qc.fetch(['search', query, startPage + i], {
            fn: ({ signal }) => searchPage(query, startPage + i, signal),
          })
        )
      )
      if (pages[0].Response === 'False') throw new Error(pages[0].Error || 'No results found')

      const movies = pages.flatMap(p => p.Search || [])
      const totalResults = parseInt(pages[0].totalResults, 10)
      this.state.results = { movies, totalResults }
      this.state.cached = allCached
      this.state.loading = false
      this.render()

      // Prefetch next display page (fire-and-forget)
      const nextStart = startPage + pagesNeeded
      const totalOmdbPages = Math.ceil(totalResults / 10)
      for (let i = 0; i < pagesNeeded && nextStart + i <= totalOmdbPages; i++) {
        qc.prefetch(['search', query, nextStart + i], {
          fn: ({ signal }) => searchPage(query, nextStart + i, signal),
        })
      }
    } catch (err) {
      if (err.name === 'AbortError') return // user typed new query — ignore
      this.state.error = err.message
      this.state.results = null
      this.state.loading = false
      this.render()
    }
  }

  // --- Pagination ---

  _goToPage(page) {
    this.state.page = page
    this._doSearch(this.state.query, page)
    this.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  _onPerPageChange(e) {
    this.state.perPage = parseInt(e.target.value, 10)
    this.state.page = 1
    if (this.state.query) this._doSearch(this.state.query, 1)
    else this.render()
  }

  // --- Detail view ---

  async _showDetail(id) {
    this.state.detailId = id
    this.state.detail = qc.get(['detail', id]) || null  // instant if cached
    this.state.detailLoading = !this.state.detail
    this.state.detailError = null
    this.render()
    if (this.state.detail) return // cache hit — already rendered

    try {
      const data = await qc.fetch(['detail', id], {
        fn: ({ signal }) => detailById(id, signal),
      })
      if (data.Response === 'False') throw new Error(data.Error)
      this.state.detail = data
      this.state.detailLoading = false
    } catch (err) {
      this.state.detailError = err.message
      this.state.detailLoading = false
    }
    this.render()
  }

  _backToResults() {
    this.state.detailId = null
    this.state.detail = null
    this.state.detailError = null
    if (this.state.query) this._doSearch(this.state.query, this.state.page)
    else this.render()
  }

  _clearCache() {
    qc.clear()
    if (this.state.query) this._doSearch(this.state.query, this.state.page)
    else this.render()
  }

  // --- Templates ---

  template() {
    const { query, results, loading, error, perPage, cached } = this.state
    const { detailId, detail, detailLoading, detailError } = this.state

    if (detailId) return this._detailTemplate(detail, detailLoading, detailError)

    const totalResults = results?.totalResults || 0
    const totalPages = Math.ceil(totalResults / perPage)

    return html`
      <div class="search-bar">
        <input type="text" placeholder="Search movies, series, episodes…"
          .value=${query} @input=${e => this._onInput(e)}>
      </div>

      ${results || loading ? html`
        <div class="toolbar">
          <label>
            Rows per page:
            <select @change=${e => this._onPerPageChange(e)}>
              ${[10, 20, 30].map(n => html`
                <option value=${n} ?selected=${perPage === n}>${n}</option>
              `)}
            </select>
          </label>
          <button @click=${() => this._clearCache()}>🗑 Clear cache</button>
        </div>
      ` : nothing}

      ${results ? html`
        <div class="results-info">
          ${totalResults.toLocaleString()} results for "${query}"
          ${cached ? html`<span class="cached-badge">⚡ cached</span>` : nothing}
        </div>
      ` : nothing}

      ${loading ? html`<div class="spinner"></div>` : nothing}
      ${error ? html`<div class="error-msg">⚠️ ${error}</div>` : nothing}

      ${results && !loading ? html`
        <div class="movie-grid">
          ${results.movies.map(m => html`
            <div class="movie-card" @click=${() => this._showDetail(m.imdbID)}>
              <img src=${poster(m.Poster)} alt=${m.Title} loading="lazy">
              <div class="card-info">
                <div class="card-title">${m.Title}</div>
                <div class="card-meta">
                  <span>${m.Year}</span>
                  <span class="card-type">${m.Type}</span>
                </div>
              </div>
            </div>
          `)}
        </div>

        ${totalPages > 1 ? html`
          <div class="pagination">
            <button ?disabled=${this.state.page <= 1}
              @click=${() => this._goToPage(this.state.page - 1)}>← Prev</button>
            <span class="page-info">Page ${this.state.page} of ${totalPages}</span>
            <button ?disabled=${this.state.page >= totalPages}
              @click=${() => this._goToPage(this.state.page + 1)}>Next →</button>
          </div>
        ` : nothing}
      ` : nothing}

      ${!query && !results && !loading ? html`
        <div class="empty-state">
          <div class="emoji">🍿</div>
          <p>Search for a movie to get started</p>
        </div>
      ` : nothing}
    `
  }

  _detailTemplate(detail, loading, error) {
    return html`
      <button class="back-btn" @click=${() => this._backToResults()}>← Back to results</button>

      ${loading ? html`<div class="spinner"></div>` : nothing}
      ${error ? html`<div class="error-msg">⚠️ ${error}</div>` : nothing}

      ${detail ? html`
        <div class="detail">
          <img src=${poster(detail.Poster)} alt=${detail.Title}>
          <div class="detail-info">
            <h2>${detail.Title}</h2>
            <div class="detail-meta">${detail.Year} · ${detail.Rated} · ${detail.Runtime}</div>
            <div class="detail-row">${detail.Plot}</div>
            <div class="detail-row"><span class="detail-label">Director:</span> ${detail.Director}</div>
            <div class="detail-row"><span class="detail-label">Actors:</span> ${detail.Actors}</div>
            <div class="detail-row"><span class="detail-label">Genre:</span> ${detail.Genre}</div>
            ${detail.Ratings?.length ? html`
              <div class="ratings">
                ${detail.Ratings.map(r => html`
                  <div class="rating-badge">
                    <strong>${r.Value}</strong>
                    <span class="rating-source">${r.Source}</span>
                  </div>
                `)}
              </div>
            ` : nothing}
          </div>
        </div>
      ` : nothing}
    `
  }
}

MovieSearch.define()
