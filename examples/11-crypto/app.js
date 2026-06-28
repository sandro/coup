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

  state = {
    coins: [],
    page: 1,
    loading: false,
    done: false,
    error: null,
    status: '',      // visible status text for the demo
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
      ([entry]) => { if (entry.isIntersecting) this.loadPage(true) },
      { rootMargin: '200px' }
    )
    this._observer.observe(sentinel)
  }

  _setStatus(text) {
    this.state.status = text
    this.render()
    return new Promise(r => setTimeout(r, 600))
  }

  async loadPage(fromObserver = false) {
    if (this.state.loading || this.state.done) return

    this.state.loading = true
    this.state.error = null

    if (fromObserver) {
      await this._setStatus('⏎ Sentinel entered viewport — IntersectionObserver fired')
    }

    const page = this.state.page
    const url = `${API}?vs_currency=usd&order=market_cap_desc&per_page=50&page=${page}`

    await this._setStatus(`↑ fetch( page ${page} )  — requesting 50 coins…`)

    try {
      const res = await fetch(url)

      if (!res.ok) {
        throw new Error(
          res.status === 429
            ? 'Rate limited by CoinGecko — please wait a moment and scroll again'
            : `API error: ${res.status}`
        )
      }

      await this._setStatus(`↓ 200 OK — parsing JSON…`)

      const data = await res.json()

      if (!data.length) {
        this.state.done = true
      } else {
        await this._setStatus(`✓ Got ${data.length} coins — appending to DOM`)
        this.state.coins = [...this.state.coins, ...data]
        this.state.page = page + 1
      }
    } catch (err) {
      this.state.error = err.message
    } finally {
      this.state.loading = false
      this.state.status = ''
      this.render()
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

      ${this.state.coins.map(c => {
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

      ${this.state.error ? html`<div class="error-msg">⚠️ ${this.state.error}</div>` : nothing}

      ${this.state.status ? html`<div class="status-msg">${this.state.status}</div>` : nothing}

      ${this.state.done ? html`<div class="end-msg">All coins loaded</div>` : nothing}

      <div class="sentinel"></div>
    `
  }
}

CryptoList.define()
