import { CoupElement, html, nothing } from 'coup'
CoupElement.debug = true

// ============================================================
// signup-form — field-level validation, dirty/touched tracking,
// async submit with loading/success/error states
//
// Demonstrates: state is a property, a handler is a method.
// No controlled-input dance, no useState/useCallback/useMemo.
// Each field validates on blur (touched) and on submit.
// ============================================================

// --- Validators ---
// Each returns an error string or '' if valid.

const required = (label) => (v) => v.trim() ? '' : `${label} is required`

const minLength = (n, label) => (v) =>
  v.trim().length >= n ? '' : `${label} must be at least ${n} characters`

const email = (v) => {
  if (!v.trim()) return 'Email is required'
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Enter a valid email address'
}

const matchesField = (field, label) => function(v) {
  return v === this.state[field] ? '' : `${label} must match`
}

// --- Field definitions ---

const FIELDS = [
  { name: 'name',     label: 'Full Name',        type: 'text',     validators: [required('Full name'), minLength(2, 'Name')] },
  { name: 'email',    label: 'Email',             type: 'email',    validators: [email] },
  { name: 'password', label: 'Password',          type: 'password', validators: [required('Password'), minLength(8, 'Password')] },
  { name: 'confirm',  label: 'Confirm Password',  type: 'password', validators: [required('Confirmation'), matchesField('password', 'Passwords')] },
]

// --- Component ---

class SignupForm extends CoupElement {
  static tag = 'signup-form'

  state = {
    // Field values
    name: '',
    email: '',
    password: '',
    confirm: '',

    // Tracking
    touched: {},       // { fieldName: true } — set on blur
    errors: {},        // { fieldName: 'error message' }
    submitted: false,  // true after first submit attempt

    // Async submit
    submitting: false,
    result: '',        // 'success' | 'error' | ''
    resultMessage: '',
  }

  // --- Validation ---

  validateField(field) {
    const value = this.state[field.name]
    for (const fn of field.validators) {
      const err = fn.call(this, value)
      if (err) return err
    }
    return ''
  }

  validateAll() {
    const errors = {}
    let valid = true
    for (const field of FIELDS) {
      const err = this.validateField(field)
      if (err) {
        errors[field.name] = err
        valid = false
      }
    }
    this.state.errors = errors
    this.render()
    return valid
  }

  // --- Handlers ---

  onInput(fieldName, e) {
    this.state[fieldName] = e.target.value

    // Live-validate if already touched or submitted
    if (this.state.touched[fieldName] || this.state.submitted) {
      const field = FIELDS.find(f => f.name === fieldName)
      const err = this.validateField(field)
      this.state.errors = { ...this.state.errors, [fieldName]: err }
    }

    // Re-validate confirm when password changes
    if (fieldName === 'password' && (this.state.touched.confirm || this.state.submitted)) {
      const confirmField = FIELDS.find(f => f.name === 'confirm')
      const err = this.validateField(confirmField)
      this.state.errors = { ...this.state.errors, confirm: err }
    }

    this.render()
  }

  onBlur(fieldName) {
    this.state.touched = { ...this.state.touched, [fieldName]: true }
    const field = FIELDS.find(f => f.name === fieldName)
    const err = this.validateField(field)
    this.state.errors = { ...this.state.errors, [fieldName]: err }
    this.render()
  }

  async onSubmit(e) {
    e.preventDefault()
    this.state.submitted = true
    this.state.result = ''

    // Mark all touched
    const allTouched = {}
    for (const f of FIELDS) allTouched[f.name] = true
    this.state.touched = allTouched
    this.render()

    if (!this.validateAll()) return

    // Simulate async submit
    this.state.submitting = true
    this.render()
    try {
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          // Simulate server-side email conflict
          if (this.state.email === 'taken@example.com') {
            reject(new Error('An account with this email already exists'))
          } else {
            resolve()
          }
        }, 1500)
      })
      this.state.result = 'success'
      this.state.resultMessage = `Account created for ${this.state.name}!`
    } catch (err) {
      this.state.result = 'error'
      this.state.resultMessage = err.message
    } finally {
      this.state.submitting = false
      this.render()
    }
  }

  onReset() {
    this.state.name = ''
    this.state.email = ''
    this.state.password = ''
    this.state.confirm = ''
    this.state.touched = {}
    this.state.errors = {}
    this.state.submitted = false
    this.state.result = ''
    this.state.resultMessage = ''
    this.render()
  }

  // --- Derived ---

  get isDirty() {
    return FIELDS.some(f => this.state[f.name] !== '')
  }

  get hasErrors() {
    return Object.values(this.state.errors).some(e => e)
  }

  // --- Password strength ---

  passwordStrength(pw) {
    if (!pw) return { score: 0, label: '', color: '' }
    let score = 0
    if (pw.length >= 8) score++
    if (pw.length >= 12) score++
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
    if (/\d/.test(pw)) score++
    if (/[^a-zA-Z0-9]/.test(pw)) score++

    const levels = [
      { label: 'Very weak', color: '#f85149' },
      { label: 'Weak',      color: '#f0883e' },
      { label: 'Fair',      color: '#d29922' },
      { label: 'Good',      color: '#3fb950' },
      { label: 'Strong',    color: '#58a6ff' },
    ]
    const level = levels[Math.min(score, levels.length) - 1] || levels[0]
    return { score, ...level }
  }

  // --- Template ---

  template() {
    if (this.state.result === 'success') {
      return html`
        <div class="success-card">
          <div class="success-icon">✓</div>
          <h2>${this.state.resultMessage}</h2>
          <p>Check your email to verify your account.</p>
          <button @click=${() => this.onReset()}>Create another</button>
        </div>
      `
    }

    const strength = this.passwordStrength(this.state.password)

    return html`
      <form @submit=${(e) => this.onSubmit(e)} novalidate>
        <h2>Create Account</h2>

        ${this.state.result === 'error' ? html`
          <div class="alert error">${this.state.resultMessage}</div>
        ` : nothing}

        ${FIELDS.map(field => {
          const err = this.state.errors[field.name]
          const show = err && (this.state.touched[field.name] || this.state.submitted)
          return html`
            <div class="field ${show ? 'invalid' : ''}">
              <label for=${field.name}>${field.label}</label>
              <input
                id=${field.name}
                type=${field.type}
                .value=${this.state[field.name]}
                @input=${(e) => this.onInput(field.name, e)}
                @blur=${() => this.onBlur(field.name)}
                ?disabled=${this.state.submitting}
                autocomplete=${field.name === 'confirm' ? 'new-password' : field.name}
              >
              ${field.name === 'password' && this.state.password ? html`
                <div class="strength">
                  <div class="strength-bar">
                    ${[1,2,3,4,5].map(i => html`
                      <div class="segment ${i <= strength.score ? 'active' : ''}"
                           style="background:${i <= strength.score ? strength.color : ''}"></div>
                    `)}
                  </div>
                  <span class="strength-label" style="color:${strength.color}">${strength.label}</span>
                </div>
              ` : nothing}
              ${show ? html`<div class="error-msg">${err}</div>` : nothing}
            </div>
          `
        })}

        <div class="actions">
          <button type="submit" ?disabled=${this.state.submitting}>
            ${this.state.submitting ? html`<span class="spinner"></span> Creating…` : 'Create Account'}
          </button>
          ${this.isDirty && !this.state.submitting ? html`
            <button type="button" class="secondary" @click=${() => this.onReset()}>Reset</button>
          ` : nothing}
        </div>

        <p class="hint">Try <code>taken@example.com</code> to see server-side error handling.</p>
      </form>
    `
  }
}

SignupForm.define()
