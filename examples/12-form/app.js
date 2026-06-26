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
  return v === this[field] ? '' : `${label} must match`
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

  static state = {
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
    const value = this[field.name]
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
    this.errors = errors
    return valid
  }

  // --- Handlers ---

  onInput(fieldName, e) {
    this[fieldName] = e.target.value

    // Live-validate if already touched or submitted
    if (this.touched[fieldName] || this.submitted) {
      const field = FIELDS.find(f => f.name === fieldName)
      const err = this.validateField(field)
      this.errors = { ...this.errors, [fieldName]: err }
    }

    // Re-validate confirm when password changes
    if (fieldName === 'password' && (this.touched.confirm || this.submitted)) {
      const confirmField = FIELDS.find(f => f.name === 'confirm')
      const err = this.validateField(confirmField)
      this.errors = { ...this.errors, confirm: err }
    }
  }

  onBlur(fieldName) {
    this.touched = { ...this.touched, [fieldName]: true }
    const field = FIELDS.find(f => f.name === fieldName)
    const err = this.validateField(field)
    this.errors = { ...this.errors, [fieldName]: err }
  }

  async onSubmit(e) {
    e.preventDefault()
    this.submitted = true
    this.result = ''

    // Mark all touched
    const allTouched = {}
    for (const f of FIELDS) allTouched[f.name] = true
    this.touched = allTouched

    if (!this.validateAll()) return

    // Simulate async submit
    this.submitting = true
    try {
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          // Simulate server-side email conflict
          if (this.email === 'taken@example.com') {
            reject(new Error('An account with this email already exists'))
          } else {
            resolve()
          }
        }, 1500)
      })
      this.result = 'success'
      this.resultMessage = `Account created for ${this.name}!`
    } catch (err) {
      this.result = 'error'
      this.resultMessage = err.message
    } finally {
      this.submitting = false
    }
  }

  onReset() {
    this.name = ''
    this.email = ''
    this.password = ''
    this.confirm = ''
    this.touched = {}
    this.errors = {}
    this.submitted = false
    this.result = ''
    this.resultMessage = ''
  }

  // --- Derived ---

  get isDirty() {
    return FIELDS.some(f => this[f.name] !== '')
  }

  get hasErrors() {
    return Object.values(this.errors).some(e => e)
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
    if (this.result === 'success') {
      return html`
        <div class="success-card">
          <div class="success-icon">✓</div>
          <h2>${this.resultMessage}</h2>
          <p>Check your email to verify your account.</p>
          <button @click=${() => this.onReset()}>Create another</button>
        </div>
      `
    }

    const strength = this.passwordStrength(this.password)

    return html`
      <form @submit=${(e) => this.onSubmit(e)} novalidate>
        <h2>Create Account</h2>

        ${this.result === 'error' ? html`
          <div class="alert error">${this.resultMessage}</div>
        ` : nothing}

        ${FIELDS.map(field => {
          const err = this.errors[field.name]
          const show = err && (this.touched[field.name] || this.submitted)
          return html`
            <div class="field ${show ? 'invalid' : ''}">
              <label for=${field.name}>${field.label}</label>
              <input
                id=${field.name}
                type=${field.type}
                .value=${this[field.name]}
                @input=${(e) => this.onInput(field.name, e)}
                @blur=${() => this.onBlur(field.name)}
                ?disabled=${this.submitting}
                autocomplete=${field.name === 'confirm' ? 'new-password' : field.name}
              >
              ${field.name === 'password' && this.password ? html`
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
          <button type="submit" ?disabled=${this.submitting}>
            ${this.submitting ? html`<span class="spinner"></span> Creating…` : 'Create Account'}
          </button>
          ${this.isDirty && !this.submitting ? html`
            <button type="button" class="secondary" @click=${() => this.onReset()}>Reset</button>
          ` : nothing}
        </div>

        <p class="hint">Try <code>taken@example.com</code> to see server-side error handling.</p>
      </form>
    `
  }
}

SignupForm.define()
