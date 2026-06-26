import { CoupElement, html, nothing } from 'coup'
CoupElement.debug = true

// ============================================================
// crypto-list — infinite-scroll coin prices via CoinGecko API
// Demonstrates: IntersectionObserver, pagination, connected/disconnected lifecycle
// ============================================================

const API = 'https://api.coingecko.com/api/v3/coins/markets'

function formatPrice(n) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: n >= 1 ? 2 : 4 })
}

function formatMcap(n) {
  if (n == null) return '—'
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  return `$${n.toLocaleString()}`
}

function formatChange(n) {
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

class CryptoList extends CoupElement {
  static tag = 'crypto-list'

  static state = {
    coins: [],
    page: 1,
    loading: false,
    done: false,
    error: null,
  }

  connected() {
    this.loadPage()
  }

  disconnected() {
    if (this._observer) {
      this._observer.disconnect()
      this._observer = null
    }
  }

  firstUpdated() {
    const sentinel = this.$('.sentinel')
    if (!sentinel) return
    this._observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) this.loadPage() },
      { rootMargin: '200px' }
    )
    this._observer.observe(sentinel)
  }

  async loadPage() {
    if (this.loading || this.done) return

    this.loading = true
    this.error = null

    try {
      const url = `${API}?vs_currency=usd&order=market_cap_desc&per_page=50&page=${this.page}`
      const res = await fetch(url)

      if (!res.ok) {
        throw new Error(
          res.status === 429
            ? 'Rate limited by CoinGecko — please wait a moment and scroll again'
            : `API error: ${res.status}`
        )
      }

      const data = await res.json()

      if (!data.length) {
        this.done = true
      } else {
        this.coins = [...this.coins, ...data]
        this.page = this.page + 1
      }
    } catch (err) {
      this.error = err.message
    } finally {
      this.loading = false
    }
  }

  template() {
    return html`
      <div class="header-row">
        <span>#</span>
        <span>Coin</span>
        <span>Price</span>
        <span>24h</span>
        <span>Market Cap</span>
      </div>

      ${this.coins.map(c => {
        const pct = c.price_change_percentage_24h
        const changeClass = pct > 0 ? 'positive' : pct < 0 ? 'negative' : ''
        return html`
          <div class="coin-row">
            <span class="coin-rank">${c.market_cap_rank}</span>
            <div class="coin-id">
              <img src=${c.image} alt=${c.name} loading="lazy" width="28" height="28">
              <span class="coin-name">${c.name}<span class="coin-symbol">${c.symbol}</span></span>
            </div>
            <span class="coin-price">${formatPrice(c.current_price)}</span>
            <span class="coin-change ${changeClass}">${formatChange(pct)}</span>
            <span class="coin-mcap">${formatMcap(c.market_cap)}</span>
          </div>
        `
      })}

      ${this.error ? html`<div class="error-msg">⚠️ ${this.error}</div>` : nothing}

      ${this.loading ? html`<div class="spinner"></div>` : nothing}

      ${this.done ? html`<div class="end-msg">All coins loaded</div>` : nothing}

      <div class="sentinel"></div>
    `
  }
}

CryptoList.define()
