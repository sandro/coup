import { CoupElement, html } from 'coup'

class MediaLightbox extends CoupElement {
  static tag = 'media-lightbox'
  static state = { open: false, index: 0 }
  static events = { 'keydown': 'onKeydown' }

  items = []

  connected() {
    // Scan direct child <img> and <video> before first render replaces innerHTML
    this.items = [...this.querySelectorAll(':scope > img, :scope > video')].map(el => {
      if (el.tagName === 'VIDEO') {
        return {
          type: 'video',
          src: el.src || el.querySelector('source')?.src || '',
          poster: el.poster || '',
          caption: el.dataset.caption || '',
        }
      }
      return {
        type: 'image',
        src: el.src,
        caption: el.alt || '',
      }
    })
  }

  openAt(i) {
    this.index = i
    this.open = true
    document.body.style.overflow = 'hidden'
    this._preload()
  }

  close() {
    this._pauseVideo()
    this.open = false
    document.body.style.overflow = ''
  }

  next() {
    if (this.items.length <= 1) return
    this._pauseVideo()
    this.index = (this.index + 1) % this.items.length
    this._preload()
  }

  prev() {
    if (this.items.length <= 1) return
    this._pauseVideo()
    this.index = (this.index - 1 + this.items.length) % this.items.length
    this._preload()
  }

  goTo(i) {
    if (i === this.index) return
    this._pauseVideo()
    this.index = i
    this._preload()
  }

  onKeydown(e) {
    if (!this.open) return
    if (e.key === 'Escape') this.close()
    else if (e.key === 'ArrowRight') this.next()
    else if (e.key === 'ArrowLeft') this.prev()
  }

  _pauseVideo() {
    const v = this.$('.lb-main video')
    if (v) v.pause()
  }

  _preload() {
    const len = this.items.length
    if (len <= 1) return
    ;[(this.index + 1) % len, (this.index - 1 + len) % len].forEach(i => {
      if (this.items[i]?.type === 'image') {
        const img = new Image()
        img.src = this.items[i].src
      }
    })
  }

  disconnected() {
    document.body.style.overflow = ''
  }

  template() {
    const item = this.items[this.index]
    const multi = this.items.length > 1

    return html`
      <div class="lb-grid">
        ${this.items.map((it, i) => html`
          <div class="lb-grid-item" @click=${() => this.openAt(i)}>
            ${it.type === 'video'
              ? html`
                <img src="${it.poster}" alt="${it.caption}" draggable="false">
                <div class="lb-grid-play">▶</div>
              `
              : html`<img src="${it.src}" alt="${it.caption}" draggable="false">`
            }
          </div>
        `)}
      </div>

      <div class="lb-overlay ${this.open ? 'lb-open' : ''}"
           @click=${(e) => { if (e.target.classList.contains('lb-overlay')) this.close() }}>
        ${item ? html`
          <button class="lb-close" @click=${() => this.close()} aria-label="Close">✕</button>

          ${multi ? html`
            <button class="lb-arrow lb-arrow-left" @click=${() => this.prev()} aria-label="Previous">‹</button>
            <button class="lb-arrow lb-arrow-right" @click=${() => this.next()} aria-label="Next">›</button>
          ` : ''}

          <div class="lb-main">
            ${item.type === 'video'
              ? html`<video src="${item.src}" controls autoplay poster="${item.poster || ''}"></video>`
              : html`<img src="${item.src}" alt="${item.caption}" draggable="false">`
            }
          </div>

          ${item.caption ? html`<div class="lb-caption">${item.caption}</div>` : ''}
          ${multi ? html`<div class="lb-counter">${this.index + 1} / ${this.items.length}</div>` : ''}

          ${multi ? html`
            <div class="lb-thumbs">
              ${this.items.map((t, i) => html`
                <div class="lb-thumb ${i === this.index ? 'active' : ''}" @click=${() => this.goTo(i)}>
                  <img src="${t.type === 'video' ? t.poster : t.src}" alt="" draggable="false">
                </div>
              `)}
            </div>
          ` : ''}
        ` : ''}
      </div>
    `
  }
}

MediaLightbox.define()
