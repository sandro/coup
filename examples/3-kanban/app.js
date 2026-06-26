import { CoupElement, html } from 'coup'
import { repeat } from 'lit-html/directives/repeat.js'
CoupElement.debug = true

// ────────────────────────────────────────────────────
// Data
// ────────────────────────────────────────────────────

let nextId = 7
const COLUMNS = ['todo', 'doing', 'done']

const SEED = [
  { id: 1, title: 'Design API surface',         column: 'done',  priority: 'high' },
  { id: 2, title: 'Write template engine',       column: 'done',  priority: 'high' },
  { id: 3, title: 'Add keyed list support',      column: 'doing', priority: 'medium' },
  { id: 4, title: 'Port set-list-app',           column: 'doing', priority: 'high' },
  { id: 5, title: 'Write docs',                  column: 'todo',  priority: 'medium' },
  { id: 6, title: 'Add SSR support',             column: 'todo',  priority: 'low' },
]


// ────────────────────────────────────────────────────
// kanban-card: a single draggable card
// ────────────────────────────────────────────────────

class KanbanCard extends CoupElement {
  static tag = 'kanban-card'
  static props = { card: Object }

  static state = { dragging: false }

  onDragStart(e) {
    this.dragging = true
    e.dataTransfer.setData('text/plain', String(this.card.id))
    e.dataTransfer.effectAllowed = 'move'
  }

  onDragEnd() {
    this.dragging = false
  }

  deleteCard() {
    this.emit('card:delete', { id: this.card.id })
  }

  moveCard(direction) {
    const idx = COLUMNS.indexOf(this.card.column)
    const newCol = COLUMNS[idx + direction]
    if (newCol) {
      this.emit('card:move', { id: this.card.id, column: newCol })
    }
  }

  template() {
    const c = this.card
    if (!c) return html``

    const colIdx = COLUMNS.indexOf(c.column)

    return html`
      <div
        class="card ${this.dragging ? 'dragging' : ''}"
        draggable="true"
        @dragstart=${(e) => this.onDragStart(e)}
        @dragend=${() => this.onDragEnd()}
      >
        <div class="title">${c.title}</div>
        <div class="meta">
          <span class="priority ${c.priority}">${c.priority}</span>
          <span>
            ${colIdx > 0
              ? html`<button @click=${() => this.moveCard(-1)} title="Move left">←</button>`
              : ''}
            ${colIdx < COLUMNS.length - 1
              ? html`<button @click=${() => this.moveCard(1)} title="Move right">→</button>`
              : ''}
            <button @click=${() => this.deleteCard()} title="Delete">✕</button>
          </span>
        </div>
      </div>
    `
  }
}
KanbanCard.define()


// ────────────────────────────────────────────────────
// kanban-column: a column of cards with drag-drop
// ────────────────────────────────────────────────────

class KanbanColumn extends CoupElement {
  static tag = 'kanban-column'
  static props = { name: String, cards: Array }

  static state = { dragOver: false, dropIndex: -1 }

  addCard(e) {
    e.preventDefault()
    const input = this.$('input')
    const title = input.value.trim()
    if (!title) return
    this.emit('card:add', { title, column: this.name })
    input.value = ''
  }

  _getDropIndex(e) {
    const cardEls = this.$$('kanban-card')
    for (let i = 0; i < cardEls.length; i++) {
      const rect = cardEls[i].getBoundingClientRect()
      if (e.clientY < rect.top + rect.height / 2) return i
    }
    return cardEls.length
  }

  onDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const idx = this._getDropIndex(e)
    if (!this.dragOver || this.dropIndex !== idx) {
      this.dragOver = true
      this.dropIndex = idx
    }
  }

  onDragLeave(e) {
    // Only leave if we actually left the column (not entering a child)
    if (e.currentTarget.contains(e.relatedTarget)) return
    this.dragOver = false
    this.dropIndex = -1
  }

  onDrop(e) {
    e.preventDefault()
    const dropIndex = this.dropIndex
    this.dragOver = false
    this.dropIndex = -1
    const cardId = Number(e.dataTransfer.getData('text/plain'))
    this.emit('card:move', { id: cardId, column: this.name, index: dropIndex })
  }

  template() {
    const cards = this.cards || []
    const { dragOver, dropIndex } = this
    const indicator = html`<div class="drop-indicator"></div>`

    return html`
      <div
        class="column ${dragOver ? 'drag-over' : ''}"
        @dragover=${(e) => this.onDragOver(e)}
        @dragleave=${(e) => this.onDragLeave(e)}
        @drop=${(e) => this.onDrop(e)}
      >
        <h2>${this.name} (${cards.length})</h2>

        ${cards.length === 0 && dragOver
          ? indicator
          : cards.map((c, i) => html`
              ${dragOver && dropIndex === i ? indicator : ''}
              <kanban-card .card=${c}></kanban-card>
            `)
        }
        ${dragOver && dropIndex >= cards.length && cards.length > 0
          ? indicator
          : ''}

        <form class="add-form" @submit=${(e) => this.addCard(e)}>
          <input type="text" placeholder="+ Add card…" />
          <button type="submit">Add</button>
        </form>
      </div>
    `
  }
}
KanbanColumn.define()


// ────────────────────────────────────────────────────
// kanban-board: top-level, owns all state
// ────────────────────────────────────────────────────

class KanbanBoard extends CoupElement {
  static tag = 'kanban-board'

  // Listen for events emitted by children
  static events = {
    'card:add':    'onAdd',
    'card:delete': 'onDelete',
    'card:move':   'onMove',
  }

  static state = { cards: [...SEED] }

  onAdd(e) {
    const card = {
      id: nextId++,
      title: e.detail.title,
      column: e.detail.column,
      priority: 'medium',
    }
    this.cards = [...this.cards, card]
  }

  onDelete(e) {
    this.cards = this.cards.filter(c => c.id !== e.detail.id)
  }

  onMove(e) {
    const { id, column, index } = e.detail
    const card = this.cards.find(c => c.id === id)
    if (!card) return
    const without = this.cards.filter(c => c.id !== id)
    const moved = { ...card, column }

    if (index !== undefined) {
      // Insert at a specific position within the target column.
      // We walk the full array and count cards in the target column
      // to find where to splice.
      const result = []
      let colCount = 0
      let inserted = false
      for (const c of without) {
        if (c.column === column) {
          if (colCount === index && !inserted) {
            result.push(moved)
            inserted = true
          }
          colCount++
        }
        result.push(c)
      }
      if (!inserted) result.push(moved) // append at end
      this.cards = result
    } else {
      // Button move — append to end
      this.cards = [...without, moved]
    }
  }

  template() {
    return html`
      <div class="board">
        ${COLUMNS.map(col => {
          const cards = this.cards.filter(c => c.column === col)
          return html`
            <kanban-column .name=${col} .cards=${cards}></kanban-column>
          `
        })}
      </div>
    `
  }
}
KanbanBoard.define()
