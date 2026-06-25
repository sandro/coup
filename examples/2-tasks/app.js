import { CoupElement, html, repeat } from 'coup'

// ============================================================
// task-item: receives props from parent, emits events upward
// Demonstrates: static props, auto-render on prop change, emit()
// ============================================================
class TaskItem extends CoupElement {
  static tag = 'task-item'
  static props = { task: Object }

  toggle() {
    this.emit('tasks:toggle', { id: this.task.id })
  }

  removeTask() {
    this.emit('tasks:remove', { id: this.task.id })
  }

  moveUp() {
    this.emit('tasks:move', { id: this.task.id, direction: -1 })
  }

  moveDown() {
    this.emit('tasks:move', { id: this.task.id, direction: 1 })
  }

  template() {
    const t = this.task
    if (!t) return html``
    return html`
      <div class="task-item ${t.done ? 'done' : ''}">
        <input
          type="checkbox"
          .checked=${t.done}
          @change=${() => this.toggle()}
        />
        <span class="task-name">${t.name}</span>
        <span class="task-id">#${t.id}</span>
        <button @click=${() => this.moveUp()} title="Move up">↑</button>
        <button @click=${() => this.moveDown()} title="Move down">↓</button>
        <button @click=${() => this.removeTask()} title="Remove">✕</button>
      </div>
    `
  }
}
TaskItem.define()

// ============================================================
// task-app: owns the data, listens for child events
// Demonstrates: static state for reactive state, repeat() with keys,
//   static events for child-to-parent communication, reordering
// ============================================================
let nextId = 4
const INITIAL_TASKS = [
  { id: 1, name: 'Read coup source code', done: false },
  { id: 2, name: 'Build a component', done: true },
  { id: 3, name: 'Test keyed reordering', done: false },
]

class TaskApp extends CoupElement {
  static tag = 'task-app'

  // Listen for events emitted by child components
  static events = {
    'tasks:toggle': 'onToggle',
    'tasks:remove': 'onRemove',
    'tasks:move': 'onMove',
  }

  static state = {
    tasks: [...INITIAL_TASKS],
    newTaskName: '',
  }

  onToggle(e) {
    this.tasks = this.tasks.map(t =>
      t.id === e.detail.id ? { ...t, done: !t.done } : t
    )
  }

  onRemove(e) {
    this.tasks = this.tasks.filter(t => t.id !== e.detail.id)
  }

  onMove(e) {
    const { id, direction } = e.detail
    const tasks = [...this.tasks]
    const idx = tasks.findIndex(t => t.id === id)
    const newIdx = idx + direction
    if (newIdx < 0 || newIdx >= tasks.length) return

    // Swap
    ;[tasks[idx], tasks[newIdx]] = [tasks[newIdx], tasks[idx]]
    this.tasks = tasks
  }

  addTask(e) {
    e.preventDefault()
    const name = this.newTaskName.trim()
    if (!name) return
    this.tasks = [...this.tasks, { id: nextId++, name, done: false }]
    this.newTaskName = ''
  }

  onInput(e) {
    this.newTaskName = e.target.value
  }

  selectAll() {
    this.tasks = this.tasks.map(t => ({ ...t, done: true }))
  }

  reverse() {
    this.tasks = [...this.tasks].reverse()
  }

  shuffle() {
    const tasks = [...this.tasks]
    for (let i = tasks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[tasks[i], tasks[j]] = [tasks[j], tasks[i]]
    }
    this.tasks = tasks
  }

  get doneCount() {
    return this.tasks.filter(t => t.done).length
  }

  template() {
    return html`
      <form class="task-form" @submit=${(e) => this.addTask(e)}>
        <input
          type="text"
          placeholder="Add a task…"
          .value=${this.newTaskName}
          @input=${(e) => this.onInput(e)}
        />
        <button type="submit">Add</button>
      </form>

      <div class="controls">
        <button @click=${() => this.reverse()}>Reverse</button>
        <button @click=${() => this.shuffle()}>Shuffle</button>
        <button @click=${() => this.selectAll()}>Complete All</button>
      </div>

      ${repeat(
        this.tasks,
        t => t.id,
        t => html`<task-item .task=${t}></task-item>`
      )}

      <div class="status-bar">
        ${this.doneCount} of ${this.tasks.length} tasks done
      </div>
    `
  }
}
TaskApp.define()
