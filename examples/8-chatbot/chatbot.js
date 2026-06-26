// coup-chatbot — drop-in AI chatbot component
//
// Usage:
//   <coup-chatbot endpoint="/api/chat"></coup-chatbot>
//
// Props:
//   endpoint    — URL to POST messages to (expects streaming or JSON response)
//   system      — system prompt to include with each request
//   tools       — array of tool definitions for the LLM
//   placeholder — input placeholder text
//
// Events emitted:
//   chatbot:send      — { message, files }  (before sending to API)
//   chatbot:response  — { message }          (after full response)
//   chatbot:tool-call — { name, args }       (when LLM calls a tool)
//   chatbot:error     — { error }
//
// Events listened:
//   chatbot:append-message — { role, content } (inject a message externally)
//
// CSS custom properties:
//   --chatbot-height, --chatbot-max-width, --chatbot-bg, --chatbot-user-bg,
//   --chatbot-assistant-bg, --chatbot-font-size, --chatbot-radius

import { CoupElement, html, nothing } from 'coup'
import { repeat } from 'lit-html/directives/repeat.js'

// ────────────────────────────────────────────────────
// chatbot-message: a single message bubble
// ────────────────────────────────────────────────────

class ChatbotMessage extends CoupElement {
  static tag = 'chatbot-message'

  // msg is NOT a static prop — parent mutates the object in place during streaming.
  // Static props use identity comparison (===), so same-reference mutations wouldn't
  // trigger re-renders. Instead, we use a manual setter that always re-renders.
  set msg(val) { this._msg = val; if (this.isConnected) this.render() }
  get msg() { return this._msg }

  template() {
    const m = this.msg
    if (!m) return nothing

    const isUser = m.role === 'user'
    const hasImages = m.images?.length > 0

    // Hide empty streaming messages — typing dots show instead
    if (!isUser && m.streaming && !m.content) {
      return html`<div class="cb-msg cb-assistant" style="display:none"></div>`
    }

    return html`
      <div class="cb-msg ${isUser ? 'cb-user' : 'cb-assistant'}">
        ${!isUser ? html`<div class="cb-avatar">AI</div>` : ''}
        <div class="cb-bubble">${hasImages ? html`<div class="cb-images">${m.images.map(img => html`<img src=${img.url} alt=${img.name || 'uploaded'} class="cb-thumb" @click=${(e) => this._fullscreen(e)} />`)}</div>` : ''}${m.content}${!isUser && !m.streaming && m.content ? html`<div class="cb-actions"><button class="cb-action-btn" @click=${() => this._copy()}>copy</button></div>` : ''}</div>
      </div>
    `
  }

  _copy() {
    const text = this.msg?.content
    if (text) {
      navigator.clipboard.writeText(text)
      const btn = this.$('.cb-action-btn')
      if (btn) {
        btn.textContent = 'copied!'
        setTimeout(() => { btn.textContent = 'copy' }, 1500)
      }
    }
  }

  _fullscreen(e) {
    const img = e.target
    if (!img) return
    // Simple fullscreen overlay
    const overlay = document.createElement('div')
    overlay.className = 'cb-img-overlay'
    overlay.innerHTML = `<img src="${img.src}" alt="${img.alt}" />`
    overlay.onclick = () => overlay.remove()
    document.body.appendChild(overlay)
  }
}
ChatbotMessage.define()


// ────────────────────────────────────────────────────
// coup-chatbot: the main chatbot component
// ────────────────────────────────────────────────────

let msgId = 0

class CoupChatbot extends CoupElement {
  static tag = 'coup-chatbot'
  static attrs = { endpoint: String, placeholder: String }
  static props = { endpoint: String, system: String, tools: Array, placeholder: String }

  static events = {
    'chatbot:append-message': 'onAppendMessage',
  }

  static state = {
    messages: [],
    inputHistory: [],
    historyIndex: -1,
    currentInput: '',
    sending: false,
    dragOver: false,
    pendingFiles: [],
    userHasScrolled: false,
  }

  // Internal bookkeeping — not rendered, no auto-render needed
  _abortController = null
  _dragCounter = 0
  _streamRenderTimer = null
  _savedInput = ''

  connected() {
    // Track user scroll vs. autoscroll
    this._onScroll = () => {
      const el = this.$('.cb-messages')
      if (!el) return
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      this.userHasScrolled = !atBottom
    }

    // Paste images from clipboard
    this._onPaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      const imageFiles = []
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) imageFiles.push(file)
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault()
        this._processFiles(imageFiles)
      }
    }
  }

  firstUpdated() {
    // One-time bindings that need DOM access
    const el = this.$('.cb-messages')
    if (el) {
      el.addEventListener('scroll', this._onScroll)
    }
    const textarea = this.$('textarea')
    if (textarea) {
      textarea.addEventListener('paste', this._onPaste)
      textarea.focus()
    }
  }

  updated() {
    // Autoscroll only if user hasn't scrolled up
    const el = this.$('.cb-messages')
    if (el && !this.userHasScrolled) {
      el.scrollTop = el.scrollHeight
    }
  }

  // ── Input handling ──

  onInput(e) {
    this.currentInput = e.target.value
    this._autoResize(e.target)
  }

  onKeyDown(e) {
    const textarea = e.target

    // Escape to stop streaming
    if (e.key === 'Escape' && this.sending) {
      e.preventDefault()
      this._abortStream()
      return
    }

    // Enter to send (shift+enter for newline)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      this.send()
      return
    }

    // Up for input history — only when textarea is empty or cursor at start
    if (e.key === 'ArrowUp' && !e.shiftKey) {
      // Only navigate history when input is empty (matches yap behavior)
      if (!textarea.value) {
        e.preventDefault()
        this._navigateHistory(-1)
        return
      }
    }

    // Down for input history — only when input is empty
    if (e.key === 'ArrowDown' && !e.shiftKey) {
      if (!textarea.value) {
        e.preventDefault()
        this._navigateHistory(1)
        return
      }
    }
  }

  _navigateHistory(direction) {
    const { inputHistory, historyIndex } = this
    if (inputHistory.length === 0) return

    let newIndex = historyIndex + direction

    // Going down past the end restores current input
    if (newIndex > inputHistory.length - 1) {
      this.historyIndex = -1
      this._setInput(this._savedInput || '')
      return
    }

    if (newIndex < 0) return

    // Save current input when first pressing up
    if (historyIndex === -1) {
      this._savedInput = this.currentInput
    }

    this.historyIndex = newIndex
    // History is newest-first
    this._setInput(inputHistory[inputHistory.length - 1 - newIndex])
  }

  _setInput(text) {
    const textarea = this.$('textarea')
    if (!textarea) return
    textarea.value = text
    this.currentInput = text
    this._autoResize(textarea)
  }

  _autoResize(textarea) {
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
  }

  // ── Drag & Drop ──
  // Use dragCounter to handle nested elements (matches yap's pattern)

  onDragEnter(e) {
    e.preventDefault()
    this._dragCounter++
    this.dragOver = true
  }

  onDragOver(e) {
    e.preventDefault()
  }

  onDragLeave(e) {
    e.preventDefault()
    this._dragCounter--
    if (this._dragCounter <= 0) {
      this._dragCounter = 0
      this.dragOver = false
    }
  }

  onDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    this.dragOver = false
    this._dragCounter = 0

    if (e.dataTransfer?.files?.length) {
      this._processFiles(Array.from(e.dataTransfer.files))
    }
  }

  onFileSelect(e) {
    const files = Array.from(e.target.files)
    this._processFiles(files)
    e.target.value = '' // reset so same file can be re-selected
  }

  _processFiles(files) {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue

      const reader = new FileReader()
      reader.onload = (e) => {
        this.pendingFiles = [
          ...this.pendingFiles,
          { name: file.name, url: e.target.result, file }
        ]
      }
      reader.readAsDataURL(file)
    }
  }

  removePendingFile(index) {
    this.pendingFiles = this.pendingFiles.filter((_, i) => i !== index)
  }

  // ── Abort ──

  _abortStream() {
    if (this._abortController) {
      this._abortController.abort()
      this._abortController = null
    }
    this.sending = false

    // Mark the last assistant message as done
    const msgs = this.messages
    const last = msgs[msgs.length - 1]
    if (last?.streaming) {
      last.streaming = false
      last.content += ' [stopped]'
      this.messages = [...msgs]
    }
  }

  // ── Send ──

  async send() {
    const text = this.currentInput.trim()
    const files = this.pendingFiles

    if (!text && files.length === 0) return
    if (this.sending) return

    // Add user message
    const userMsg = {
      id: ++msgId,
      role: 'user',
      content: text,
      images: files.map(f => ({ name: f.name, url: f.url })),
    }
    this.messages = [...this.messages, userMsg]

    // Update input history (newest first, matches yap)
    if (text) {
      this.inputHistory = [...this.inputHistory, text]
    }

    // Reset input state
    this.currentInput = ''
    this.historyIndex = -1
    this.pendingFiles = []
    this.userHasScrolled = false
    this.sending = true

    this._setInput('')
    this.$('.cb-compose textarea')?.focus()

    this.emit('chatbot:send', { message: text, files })

    // Add placeholder assistant message
    const assistantMsg = {
      id: ++msgId,
      role: 'assistant',
      content: '',
      streaming: true,
    }
    this.messages = [...this.messages, assistantMsg]

    try {
      await this._callEndpoint(text, files, assistantMsg)
    } catch (err) {
      if (err.name === 'AbortError') {
        // User cancelled — already handled in _abortStream
        return
      }
      assistantMsg.content = `Error: ${err.message}`
      assistantMsg.streaming = false
      this.messages = [...this.messages]
      this.emit('chatbot:error', { error: err })
    } finally {
      this.sending = false
      this._abortController = null
    }
  }

  async _callEndpoint(text, files, assistantMsg) {
    const endpoint = this.endpoint
    if (!endpoint) {
      assistantMsg.content = 'No endpoint configured. Set the endpoint prop or attribute.'
      assistantMsg.streaming = false
      return
    }

    const body = {
      messages: this.messages
        .filter(m => !m.streaming)
        .map(m => ({ role: m.role, content: m.content })),
    }

    if (this.system) body.system = this.system
    if (this.tools) body.tools = this.tools

    if (files.length > 0) {
      body.images = files.map(f => ({
        name: f.name,
        data: f.url,
      }))
    }

    const abortController = new AbortController()
    this._abortController = abortController

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abortController.signal,
    })

    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`)
    }

    const contentType = res.headers.get('content-type') || ''

    if (contentType.includes('text/event-stream') || contentType.includes('stream')) {
      await this._readStream(res, assistantMsg)
    } else {
      const data = await res.json()
      assistantMsg.content = data.content || data.message || data.text || JSON.stringify(data)
      assistantMsg.streaming = false
      this.messages = [...this.messages]
      this.emit('chatbot:response', { message: assistantMsg.content })
    }
  }

  // Throttle renders during streaming (from yap: ~80ms debounce)
  _throttledStreamRender() {
    if (!this._streamRenderTimer) {
      this.messages = [...this.messages]
      this._streamRenderTimer = setTimeout(() => {
        this._streamRenderTimer = null
        this.messages = [...this.messages]
      }, 80)
    }
  }

  async _readStream(res, assistantMsg) {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop()

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const token = parsed.content || parsed.delta?.content || parsed.text || ''

            if (parsed.tool_call || parsed.type === 'tool_use') {
              this.emit('chatbot:tool-call', {
                name: parsed.tool_call?.name || parsed.name,
                args: parsed.tool_call?.arguments || parsed.input,
              })
              continue
            }

            assistantMsg.content += token
          } catch {
            assistantMsg.content += data
          }

          this._throttledStreamRender()
        }
      }
    }

    // Final render after stream completes
    clearTimeout(this._streamRenderTimer)
    this._streamRenderTimer = null
    assistantMsg.streaming = false
    this.messages = [...this.messages]
    this.emit('chatbot:response', { message: assistantMsg.content })
  }

  // ── External message injection ──

  onAppendMessage(e) {
    const { role, content } = e.detail
    this.messages = [
      ...this.messages,
      { id: ++msgId, role, content },
    ]
    this.userHasScrolled = false
  }

  // ── Clear conversation ──

  clearChat() {
    this.messages = []
    this.inputHistory = []
    this.historyIndex = -1
  }

  // ── Template ──

  template() {
    const { messages, dragOver, pendingFiles, sending } = this
    const placeholder = this.placeholder || 'Type a message…'

    return html`
      <div class="cb-container ${dragOver ? 'cb-dragover' : ''}"
        @dragenter=${(e) => this.onDragEnter(e)}
        @dragover=${(e) => this.onDragOver(e)}
        @dragleave=${(e) => this.onDragLeave(e)}
        @drop=${(e) => this.onDrop(e)}
      >
        <div class="cb-messages">
          ${messages.length === 0 ? html`
            <div class="cb-empty">Drop an image or type a message to start.</div>
          ` : ''}
          ${repeat(
            messages,
            m => m.id,
            m => html`<chatbot-message .msg=${m}></chatbot-message>`
          )}
          ${sending ? html`<div class="cb-typing"><span></span><span></span><span></span></div>` : ''}
        </div>

        ${pendingFiles.length > 0 ? html`
          <div class="cb-pending-files">
            ${pendingFiles.map((f, i) => html`
              <div class="cb-pending-file">
                <img src=${f.url} alt=${f.name} />
                <button class="cb-remove-file" @click=${() => this.removePendingFile(i)}>×</button>
              </div>
            `)}
          </div>
        ` : ''}

        <div class="cb-compose">
          <label class="cb-attach">
            <input type="file" accept="image/*" multiple
              @change=${(e) => this.onFileSelect(e)} hidden />
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </label>
          <textarea
            rows="1"
            placeholder=${placeholder}
            @input=${(e) => this.onInput(e)}
            @keydown=${(e) => this.onKeyDown(e)}
          ></textarea>
          ${sending ? html`
            <button class="cb-stop" @click=${() => this._abortStream()} title="Stop generating">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ` : html`
            <button class="cb-send" @click=${() => this.send()}
              ?disabled=${!this.currentInput.trim() && pendingFiles.length === 0}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          `}
        </div>
      </div>
    `
  }
}
CoupChatbot.define()

export { CoupChatbot, ChatbotMessage }
