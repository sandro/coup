import { CoupElement, html } from 'coup'

// ── Child: receives a name prop from parent, renders a greeting ──
class HelloGreeting extends CoupElement {
  static tag = 'hello-greeting'
  static props = { name: String }

  template() {
    return html`
      <div class="greeting">
        <h3>Hello, ${this.name || 'world'}!</h3>
      </div>
    `
  }
}
HelloGreeting.define()

// ── Parent: owns the input, passes name down as a prop ──
class HelloApp extends CoupElement {
  static tag = 'hello-app'

  static state = { name: '' }

  onInput(e) {
    this.name = e.target.value
  }

  template() {
    return html`
      <input
        type="text"
        placeholder="Type your name…"
        .value=${this.name}
        @input=${(e) => this.onInput(e)}
      />
      <hello-greeting .name=${this.name}></hello-greeting>
    `
  }
}
HelloApp.define()
