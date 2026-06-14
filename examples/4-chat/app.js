import { CoupElement, html, repeat } from 'coup'
import { Router } from '../../router.js'

// ────────────────────────────────────────────────────
// Fake data & helpers
// ────────────────────────────────────────────────────

let msgId = 100

const ROOMS = ['general', 'random', 'music']

const BOTS = ['Ada', 'Grace', 'Linus']
const BOT_MESSAGES = [
  'has anyone tried coup?', 'nice!', 'lol', 'brb', '👀', 'totally agree',
  "that's a good point", 'wait what', '🎵', 'shipped it 🚀',
  'same', 'works on my machine', '😂', '+1', 'interesting...',
]

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function timestamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ────────────────────────────────────────────────────
// Router — room switching via URL hash
// ────────────────────────────────────────────────────

const router = new Router([
  '/',
  '/:room',
])


// ────────────────────────────────────────────────────
// chat-message: a single message bubble
// ────────────────────────────────────────────────────

class ChatMessage extends CoupElement {
  static tag = 'chat-message'
  static props = { msg: Object, currentUser: String }

  template() {
    const m = this.msg
    if (!m) return html``

    if (m.system) {
      return html`<div class="system-msg">${m.text}</div>`
    }

    const mine = m.author === this.currentUser
    return html`
      <div class="msg ${mine ? 'mine' : 'theirs'}">
        ${!mine ? html`<div class="author">${m.author}</div>` : ''}
        <div class="text">${m.text}</div>
        <div class="time">${m.time}</div>
      </div>
    `
  }
}
ChatMessage.define()


// ────────────────────────────────────────────────────
// chat-room: messages + compose box for a single room
// Destroyed and re-created when switching rooms.
// ────────────────────────────────────────────────────

class ChatRoom extends CoupElement {
  static tag = 'chat-room'
  static props = { room: String, messages: Array, currentUser: String }

  state = { typing: null }

  connected() {
    this._onTyping = (e) => {
      if (e.detail.room !== this.room) return
      this.state.typing = e.detail.author
      this.render()
    }
    this._onTypingDone = (e) => {
      if (e.detail.room !== this.room) return
      this.state.typing = null
      this.render()
    }
    window.addEventListener('chat:typing', this._onTyping)
    window.addEventListener('chat:typing-done', this._onTypingDone)
  }

  disconnected() {
    window.removeEventListener('chat:typing', this._onTyping)
    window.removeEventListener('chat:typing-done', this._onTypingDone)
  }

  sendMessage(e) {
    e.preventDefault()
    const input = this.$('input')
    const text = input.value.trim()
    if (!text) return
    this.emit('chat:send', { room: this.room, text })
    input.value = ''
  }

  updated() {
    const msgs = this.$('.messages')
    if (msgs) msgs.scrollTop = msgs.scrollHeight
  }

  render() {
    super.render()
    this.updated()
  }

  template() {
    const msgs = this.messages || []

    return html`
      <div class="chat-header"># ${this.room}</div>

      <div class="messages">
        ${repeat(
          msgs,
          m => m.id,
          m => html`
            <chat-message .msg=${m} .currentUser=${this.currentUser}></chat-message>
          `
        )}
      </div>

      ${this.state.typing
        ? html`<div class="typing">${this.state.typing} is typing…</div>`
        : ''}

      <form class="compose" @submit=${(e) => this.sendMessage(e)}>
        <input type="text" placeholder="Message #${this.room}…" />
        <button type="submit">Send</button>
      </form>
    `
  }
}
ChatRoom.define()


// ────────────────────────────────────────────────────
// chat-app: top-level — sidebar + active room
// ────────────────────────────────────────────────────

class ChatApp extends CoupElement {
  static tag = 'chat-app'

  static events = {
    'chat:send': 'onSend',
  }

  state = {
    user: 'you',
    messages: {
      general: [
        { id: 1, author: 'Ada',   text: 'welcome to #general!', time: '9:00 AM', system: false },
        { id: 2, author: 'Grace', text: 'hey everyone 👋',       time: '9:01 AM', system: false },
      ],
      random: [
        { id: 3, text: 'Channel created', system: true },
        { id: 4, author: 'Linus', text: 'first!', time: '9:15 AM', system: false },
      ],
      music: [
        { id: 5, text: 'Channel created', system: true },
      ],
    },
  }

  constructor() {
    super()
    this._botTimer = setInterval(() => this.botMessage(), 5000)
  }

  connected() {
    this._unsubRouter = router.subscribe(() => this.render())
  }

  disconnected() {
    this._unsubRouter()
    clearInterval(this._botTimer)
  }

  get activeRoom() {
    const room = router.params.room
    return ROOMS.includes(room) ? room : 'general'
  }

  botMessage() {
    const room = randomFrom(ROOMS)
    const author = randomFrom(BOTS)
    const text = randomFrom(BOT_MESSAGES)

    window.dispatchEvent(new CustomEvent('chat:typing', {
      detail: { room, author }
    }))

    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('chat:typing-done', {
        detail: { room, author }
      }))

      const msg = {
        id: msgId++,
        author,
        text,
        time: timestamp(),
        system: false,
      }
      this.state.messages = {
        ...this.state.messages,
        [room]: [...this.state.messages[room], msg],
      }
      if (room === this.activeRoom) {
        this.render()
      }
    }, 1500)
  }

  onSend(e) {
    const { room, text } = e.detail
    const msg = {
      id: msgId++,
      author: this.state.user,
      text,
      time: timestamp(),
      system: false,
    }
    this.state.messages = {
      ...this.state.messages,
      [room]: [...this.state.messages[room], msg],
    }
    this.render()
  }

  changeUser(e) {
    const name = e.target.value.trim()
    if (name) this.state.user = name
  }

  template() {
    const activeRoom = this.activeRoom
    const { messages, user } = this.state
    const roomMsgs = messages[activeRoom] || []

    return html`
      <div class="sidebar">
        <h2>Rooms</h2>
        ${ROOMS.map(room => html`
          <a
            class="room-btn ${room === activeRoom ? 'active' : ''}"
            href="#/${room}"
          >
            # ${room}
            ${messages[room]?.length ? html`<span>(${messages[room].length})</span>` : ''}
          </a>
        `)}
        <div class="user-label">
          <input
            type="text"
            .value=${user}
            @change=${(e) => this.changeUser(e)}
            placeholder="Your name"
          />
        </div>
      </div>

      <div class="chat-area">
        <chat-room
          .room=${activeRoom}
          .messages=${roomMsgs}
          .currentUser=${user}
        ></chat-room>
      </div>
    `
  }
}
ChatApp.define()
