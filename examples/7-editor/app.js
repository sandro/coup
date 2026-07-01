// Block Editor — coup + Tiptap + CodeMirror
// WYSIWYG editing with live HTML code view, bidirectional sync

import { CoupElement, html, nothing } from 'coup'
import { Editor } from '@tiptap/core'
CoupElement.debug = true
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
// ---------------------------------------------------------------------------
// Drag handle — inline Tiptap extension, no npm dependency
// Shows a grip icon next to each block. Drag to reorder.
// ---------------------------------------------------------------------------
import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { NodeSelection } from '@tiptap/pm/state'

function nearestBlock(view, y) {
  let best = null, bestDist = Infinity

  function check(node, pos) {
    // Recurse into lists to find individual list items
    if (node.type.name === 'bulletList' || node.type.name === 'orderedList') {
      node.forEach((child, offset) => check(child, pos + 1 + offset))
      return
    }
    const dom = view.nodeDOM(pos)
    if (!dom || dom.nodeType !== 1) return
    const rect = dom.getBoundingClientRect()
    const mid = rect.top + rect.height / 2
    const dist = Math.abs(y - mid)
    if (dist < bestDist) {
      bestDist = dist
      best = { pos, dom, rect }
    }
  }

  view.state.doc.forEach((node, pos) => check(node, pos))
  return best
}

const DragHandle = Extension.create({
  name: 'dragHandle',

  addProseMirrorPlugins() {
    const handle = document.createElement('div')
    handle.className = 'drag-handle'
    handle.draggable = true
    handle.setAttribute('data-drag-handle', '')

    let dragPos = null

    function positionHandle(view, block) {
      const wrapper = view.dom.closest('.wysiwyg-pane')
      if (!wrapper || !block) { handle.style.display = 'none'; return }
      const wrapperRect = wrapper.getBoundingClientRect()
      const style = window.getComputedStyle(block.dom)
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4
      const handleH = 20
      handle.style.display = ''
      handle.style.top = (block.rect.top - wrapperRect.top + (lineHeight - handleH) / 2) + 'px'
      if (handle.parentNode !== wrapper) wrapper.appendChild(handle)
    }

    handle.addEventListener('dragstart', (e) => {
      if (dragPos == null) return
      const { view } = this.editor
      const tr = view.state.tr
      const sel = NodeSelection.create(view.state.doc, dragPos)
      tr.setSelection(sel)
      view.dispatch(tr)
      view.dragging = { slice: sel.content(), move: true }
      // Drag image — clone the block
      const block = nearestBlock(view, handle.getBoundingClientRect().top + 10)
      if (block?.dom) {
        const clone = block.dom.cloneNode(true)
        clone.style.position = 'absolute'
        clone.style.left = '-9999px'
        clone.style.width = block.rect.width + 'px'
        document.body.appendChild(clone)
        e.dataTransfer.setDragImage(clone, 0, 0)
        setTimeout(() => clone.remove(), 0)
      }
    })

    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            mousemove: (view, event) => {
              const block = nearestBlock(view, event.clientY)
              if (!block) { handle.style.display = 'none'; return false }
              positionHandle(view, block)
              dragPos = block.pos
              return false
            },
            mouseleave: () => {
              // Delay hide so user can reach the handle
              setTimeout(() => {
                if (!handle.matches(':hover')) {
                  handle.style.display = 'none'
                }
              }, 200)
              return false
            },
            drop: (view, event) => {
              const dropY = event.clientY
              setTimeout(() => {
                // Auto-join adjacent lists of the same type
                const { state, dispatch } = view
                const { doc, tr } = state
                let joined = false
                doc.descendants((node, pos) => {
                  if (pos === 0) return
                  const $pos = doc.resolve(pos)
                  if ($pos.nodeBefore && $pos.nodeBefore.type === node.type &&
                      (node.type.name === 'bulletList' || node.type.name === 'orderedList')) {
                    tr.join(pos)
                    joined = true
                    return false
                  }
                })
                if (joined) dispatch(tr)
                // Reposition handle at the drop target
                requestAnimationFrame(() => {
                  const block = nearestBlock(view, dropY)
                  if (block) positionHandle(view, block)
                })
              }, 50)
              return false
            },
          },
        },
        view() {
          return { destroy() { handle.remove() } }
        },
      }),
    ]
  },
})

// Compact HTML formatter — block elements get their own lines,
// inline content stays with its parent tag.
const VOID_TAGS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr'])
const BLOCK_TAGS = new Set(['html','head','body','div','p','h1','h2','h3','h4','h5','h6',
  'ul','ol','li','table','thead','tbody','tfoot','tr','td','th','blockquote','pre',
  'section','article','aside','nav','header','footer','main','figure','figcaption',
  'details','summary','dl','dt','dd','hr','form','fieldset'])

function formatHTML(src) {
  let s = src.replace(/>\s+</g, '><').trim()
  if (!s) return s
  // Tokenize into tags and text runs
  const tokens = []
  let i = 0
  while (i < s.length) {
    if (s[i] === '<') {
      const end = s.indexOf('>', i)
      if (end === -1) { tokens.push(s.slice(i)); break }
      tokens.push(s.slice(i, end + 1))
      i = end + 1
    } else {
      const next = s.indexOf('<', i)
      if (next === -1) { tokens.push(s.slice(i)); break }
      tokens.push(s.slice(i, next))
      i = next
    }
  }

  // Check if a block's inner content is purely inline (no nested blocks).
  // If so, keep it all on one line: <p>Text with <strong>bold</strong>.</p>
  function isInlineRun(start) {
    let depth = 0
    for (let j = start; j < tokens.length; j++) {
      const t = tokens[j]
      if (!t.startsWith('<')) continue
      const m = t.match(/^<\/?(\w+)/)
      if (!m) continue
      const tag = m[1].toLowerCase()
      const closing = t.startsWith('</')
      if (closing) {
        depth--
        if (depth < 0) return true // hit our own closing tag — all inline
      } else if (BLOCK_TAGS.has(tag)) {
        return false // nested block found
      } else if (!VOID_TAGS.has(tag) && !t.endsWith('/>')) {
        depth++
      }
    }
    return true
  }

  let indent = 0
  const TAB = '  '
  const lines = []
  let j = 0

  while (j < tokens.length) {
    const tok = tokens[j]
    const isTag = tok.startsWith('<')
    const isClose = tok.startsWith('</')
    const m = isTag && tok.match(/^<\/?(\w+)/)
    const tagName = m ? m[1].toLowerCase() : ''
    const isBlock = BLOCK_TAGS.has(tagName)
    const isVoid = VOID_TAGS.has(tagName) || tok.endsWith('/>')

    if (isClose && isBlock) {
      indent = Math.max(0, indent - 1)
      lines.push(TAB.repeat(indent) + tok)
      j++
    } else if (isTag && isBlock && !isVoid) {
      // Opening block — check if inner content is all inline
      if (isInlineRun(j + 1)) {
        // Collect everything up to and including the matching close tag
        let line = TAB.repeat(indent) + tok
        let depth = 1
        j++
        while (j < tokens.length && depth > 0) {
          const t = tokens[j]
          if (t.startsWith('</')) {
            const cm = t.match(/^<\/(\w+)/)
            if (cm && cm[1].toLowerCase() === tagName) depth--
            if (depth > 0) line += t
            else line += t
          } else {
            line += t
          }
          j++
        }
        lines.push(line)
      } else {
        lines.push(TAB.repeat(indent) + tok)
        indent++
        j++
      }
    } else if (isTag && isVoid && isBlock) {
      lines.push(TAB.repeat(indent) + tok)
      j++
    } else {
      // Inline content between blocks — shouldn't happen often
      lines.push(TAB.repeat(indent) + tok)
      j++
    }
  }
  return lines.join('\n')
}

// CodeMirror — lazy-loaded when code view opens
let cmModules = null
// CodeMirror uses direct URLs to avoid importmap version conflicts.
// esm.sh resolves @codemirror/* deps internally — the importmap would
// cause duplicate @codemirror/state instances and break instanceof checks.
const CM_URL = 'https://esm.sh/codemirror@6.0.1'
const CM_HTML_URL = 'https://esm.sh/@codemirror/lang-html@6'

async function loadCodeMirror() {
  if (cmModules) return cmModules
  const [
    { EditorView, basicSetup },
    { html: htmlLang },
  ] = await Promise.all([
    import(/* @vite-ignore */ CM_URL),
    import(/* @vite-ignore */ CM_HTML_URL),
  ])
  cmModules = { EditorView, basicSetup, htmlLang }
  return cmModules
}


// ============================================================================
// Editor Toolbar
// ============================================================================

class EditorToolbar extends CoupElement {
  static tag = 'editor-toolbar'
  static props = { editor: Object, mode: String }

  // Track active marks/nodes to highlight buttons
  _active = {}

  propsChanged(changes) {
    if ('editor' in changes) {
      const old = changes.editor.old
      const editor = changes.editor.new
      if (old) {
        old.off('selectionUpdate', this._onUpdate)
        old.off('update', this._onUpdate)
      }
      if (editor) {
        this._onUpdate = () => {
          if (this._toolbarPending) return
          this._toolbarPending = true
          queueMicrotask(() => {
            this._toolbarPending = false
            this._refreshActive()
            this.render()
          })
        }
        editor.on('selectionUpdate', this._onUpdate)
        editor.on('update', this._onUpdate)
        this._refreshActive()
      }
      this.render()
    }
  }

  disconnected() {
    if (this.editor && this._onUpdate) {
      this.editor.off('selectionUpdate', this._onUpdate)
      this.editor.off('update', this._onUpdate)
    }
  }

  _refreshActive() {
    const e = this.editor
    if (!e) return
    this._active = {
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      blockquote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
    }
  }

  _cmd(action) {
    const e = this.editor
    if (!e) return
    const c = e.chain().focus()
    switch (action) {
      case 'bold': c.toggleBold().run(); break
      case 'italic': c.toggleItalic().run(); break
      case 'underline': c.toggleUnderline().run(); break
      case 'strike': c.toggleStrike().run(); break
      case 'code': c.toggleCode().run(); break
      case 'h1': c.toggleHeading({ level: 1 }).run(); break
      case 'h2': c.toggleHeading({ level: 2 }).run(); break
      case 'h3': c.toggleHeading({ level: 3 }).run(); break
      case 'bulletList': c.toggleBulletList().run(); break
      case 'orderedList': c.toggleOrderedList().run(); break
      case 'blockquote': c.toggleBlockquote().run(); break
      case 'codeBlock': c.toggleCodeBlock().run(); break
      case 'hr': c.setHorizontalRule().run(); break
      case 'image': this._insertImage(); break
      case 'undo': c.undo().run(); break
      case 'redo': c.redo().run(); break
    }
  }

  _insertImage() {
    const url = prompt('Image URL:')
    if (url) {
      this.editor.chain().focus().setImage({ src: url }).run()
    }
  }

  _btn(label, action, icon) {
    const active = this._active[action] ? 'active' : ''
    return html`<button class=${active} @click=${() => this._cmd(action)} title=${label}>${icon || label}</button>`
  }

  template() {
    if (!this.editor) return nothing

    return html`
      <div class="toolbar-row">
        ${this._btn('Bold', 'bold', 'B')}
        ${this._btn('Italic', 'italic', html`<em>I</em>`)}
        ${this._btn('Underline', 'underline', html`<u>U</u>`)}
        ${this._btn('Strikethrough', 'strike', html`<s>S</s>`)}
        ${this._btn('Code', 'code', html`<code>&lt;/&gt;</code>`)}
        <span class="sep"></span>
        ${this._btn('Heading 1', 'h1', 'H1')}
        ${this._btn('Heading 2', 'h2', 'H2')}
        ${this._btn('Heading 3', 'h3', 'H3')}
        <span class="sep"></span>
        ${this._btn('Bullet List', 'bulletList', '•')}
        ${this._btn('Ordered List', 'orderedList', '1.')}
        ${this._btn('Blockquote', 'blockquote', '❝')}
        ${this._btn('Code Block', 'codeBlock', '{ }')}
        ${this._btn('Horizontal Rule', 'hr', '—')}
        <span class="sep"></span>
        ${this._btn('Image', 'image', '🖼')}
        <span class="sep"></span>
        ${this._btn('Undo', 'undo', '↩')}
        ${this._btn('Redo', 'redo', '↪')}

        <div class="mode-toggle">
          <button class=${this.mode === 'write' ? 'active' : ''}
                  @click=${() => this.emit('mode:change', 'write')}>Write</button>
          <button class=${this.mode === 'split' ? 'active' : ''}
                  @click=${() => this.emit('mode:change', 'split')}>Split</button>
          <button class=${this.mode === 'code' ? 'active' : ''}
                  @click=${() => this.emit('mode:change', 'code')}>Code</button>
        </div>
      </div>
    `
  }
}
EditorToolbar.define()


// ============================================================================
// Code View (CodeMirror)
// ============================================================================

class CodeView extends CoupElement {
  static tag = 'code-view'
  static props = { content: String }

  _cm = null
  _updating = false  // prevent sync loops

  async connected() {
    const mods = await loadCodeMirror()
    this._mods = mods
    this.render()
  }

  disconnected() {
    if (this._cm) {
      this._cm.destroy()
      this._cm = null
    }
  }

  propsChanged(changes) {
    // Tiptap → CodeMirror: update content if not currently editing in CM
    if ('content' in changes && this._cm && !this._updating) {
      const current = this._cm.state.doc.toString()
      if (changes.content.new !== current) {
        this._updating = true
        this._cm.dispatch({
          changes: { from: 0, to: this._cm.state.doc.length, insert: changes.content.new || '' }
        })
        this._updating = false
      }
    }
  }

  updated() {
    if (!this._cm && this._mods) {
      this._createEditor()
    }
  }

  _createEditor() {
    const container = this.$('.code-editor-mount')
    if (!container || this._cm) return

    const { EditorView, basicSetup, htmlLang } = this._mods

    // Debounced change handler: CodeMirror → Tiptap
    let debounceId = null
    const onChange = EditorView.updateListener.of((update) => {
      if (update.docChanged && !this._updating) {
        clearTimeout(debounceId)
        debounceId = setTimeout(() => {
          const newHTML = this._cm.state.doc.toString()
          this.emit('code:changed', newHTML)
        }, 300)
      }
    })

    this._cm = new EditorView({
      doc: this.content || '',
      extensions: [
        basicSetup,
        htmlLang(),
        EditorView.lineWrapping,
        onChange,
        EditorView.theme({
          '&': { height: '100%', fontSize: '0.82rem' },
          '.cm-scroller': { overflow: 'auto' },
          '&.cm-focused': { outline: 'none' },
        }),
      ],
      parent: container,
    })
  }

  formatHTML() {
    if (!this._cm) return
    const raw = this._cm.state.doc.toString()
    const formatted = formatHTML(raw)
    if (formatted === raw) return
    this._updating = true
    this._cm.dispatch({
      changes: { from: 0, to: this._cm.state.doc.length, insert: formatted },
    })
    this._updating = false
    this.emit('code:changed', formatted)
  }

  template() {
    return html`
      <div class="code-pane-header">
        <span>HTML</span>
        <button class="format-btn" @click=${() => this.formatHTML()} title="Format HTML">Format</button>
      </div>
      <div class="code-editor-mount" style="flex:1; overflow:auto;"></div>
    `
  }
}
CodeView.define()


// ============================================================================
// Block Editor (shell)
// ============================================================================

const INITIAL_CONTENT = `
<h1>Block Editor</h1>
<p>A <strong>WYSIWYG editor</strong> built with <a href="https://github.com/sandro/coup">coup</a>, <a href="https://tiptap.dev">Tiptap</a>, and <a href="https://codemirror.net">CodeMirror</a>.</p>
<h2>Features</h2>
<ul>
  <li>Rich text editing with toolbar</li>
  <li>Live HTML code view (split pane)</li>
  <li>Bidirectional sync — edit in either pane</li>
  <li>Drag and drop blocks to reorder</li>
</ul>
<blockquote>Try switching between <strong>Write</strong>, <strong>Split</strong>, and <strong>Code</strong> modes using the toggle in the toolbar.</blockquote>
<h2>Code Example</h2>
<pre><code>import { CoupElement, html } from 'coup'

class MyComponent extends CoupElement {
  static tag = 'my-component'
  template() {
    return html\`&lt;p&gt;Hello!&lt;/p&gt;\`
  }
}
MyComponent.define()</code></pre>
<p>Edit this content, or switch to <strong>Code</strong> view to see and modify the HTML directly.</p>
`

class BlockEditor extends CoupElement {
  static tag = 'block-editor'

  static events = {
    'mode:change': 'onModeChange',
    'code:changed': 'onCodeChanged',
  }

  state = {
    mode: window.innerWidth <= 600 ? 'write' : 'split',  // default to Write on mobile
    htmlContent: '',     // current HTML string for code view
  }

  // Third-party DOM refs and flags — not reactive
  _editor = null        // Tiptap Editor instance
  _editorEl = null
  _suppressUpdate = false

  connected() {
    // Create Tiptap editor
    const editorEl = document.createElement('div')
    this._editorEl = editorEl

    const editor = new Editor({
      element: editorEl,
      extensions: [
        StarterKit,
        Underline,
        Image.configure({ inline: false, allowBase64: true }),
        Placeholder.configure({ placeholder: 'Start writing…' }),
        DragHandle,
      ],
      content: INITIAL_CONTENT.trim(),
      onUpdate: ({ editor }) => {
        if (this._suppressUpdate) return
        // Tiptap → code view sync
        this.state.htmlContent = editor.getHTML()
        this.render()
      },
    })

    this._editor = editor
    this.state.htmlContent = editor.getHTML()
    this.render()
  }

  disconnected() {
    if (this._editor) {
      this._editor.destroy()
      this._editor = null
    }
  }

  firstUpdated() {
    // Mount Tiptap's element into the wysiwyg pane
    const pane = this.$('.wysiwyg-pane')
    if (pane && this._editorEl) {
      pane.appendChild(this._editorEl)
    }
  }

  onModeChange(e) {
    this.state.mode = e.detail
    this.render()
  }

  onCodeChanged(e) {
    // CodeMirror → Tiptap sync
    const newHTML = e.detail
    if (!this._editor) return

    // Only update if content actually differs (prevents loops)
    const currentHTML = this._editor.getHTML()
    if (newHTML !== currentHTML) {
      // Temporarily suppress Tiptap's onUpdate to prevent bounce-back
      this._suppressUpdate = true
      this._editor.commands.setContent(newHTML, false)
      this.state.htmlContent = newHTML
      this._suppressUpdate = false
      this.render()
    }
  }

  template() {
    const { mode, htmlContent } = this.state
    const editor = this._editor
    const showWysiwyg = mode === 'write' || mode === 'split'
    const showCode = mode === 'split' || mode === 'code'

    return html`
      <div class="app-header">
        <h1>Block Editor</h1>
        <small>coup + Tiptap + CodeMirror</small>
      </div>

      <editor-toolbar .editor=${editor} .mode=${mode}></editor-toolbar>

      <div class="editor-split">
        <div class="wysiwyg-pane ${showWysiwyg ? '' : 'hidden'} ${!showCode ? 'full' : ''}"
             style="${showWysiwyg ? '' : 'display:none'}"></div>
        <div class="code-pane ${showCode ? '' : 'hidden'}"
             style="${showCode ? 'display:flex; flex-direction:column;' : 'display:none'}">
          ${showCode
            ? html`<code-view .content=${htmlContent}></code-view>`
            : nothing}
        </div>
      </div>
    `
  }
}

BlockEditor.define()
