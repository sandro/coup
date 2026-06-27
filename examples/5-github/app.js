import { CoupElement, html, nothing } from 'coup'
import { repeat } from 'lit-html/directives/repeat.js'
CoupElement.debug = true

// ============================================================
// github-explorer — search for a user, show their repos
// Demonstrates: fetch, loading/error states, sorting, this.$()
// ============================================================

class GithubExplorer extends CoupElement {
  static tag = 'github-explorer'

  state = {
    query: '',
    user: null,
    repos: [],
    loading: false,
    error: null,
    sort: 'stars',
  }

  // Load a default user on mount — demonstrates async on connect
  connected() {
    this.loadUser('octocat')
  }

  async search(e) {
    e.preventDefault()
    const query = this.$('input').value.trim()
    if (!query) return
    this.loadUser(query)
  }

  async loadUser(query) {
    this.state.query = query
    this.state.loading = true
    this.state.error = null
    this.state.user = null
    this.state.repos = []
    this.render()

    try {
      const [userRes, reposRes] = await Promise.all([
        fetch(`https://api.github.com/users/${query}`),
        fetch(`https://api.github.com/users/${query}/repos?per_page=100&sort=updated`),
      ])

      if (!userRes.ok) {
        throw new Error(userRes.status === 404
          ? `User "${query}" not found`
          : `GitHub API error: ${userRes.status}`
        )
      }

      this.state.user = await userRes.json()
      this.state.repos = reposRes.ok ? await reposRes.json() : []
      this.state.loading = false
      this.render()
    } catch (err) {
      this.state.error = err.message
      this.state.loading = false
      this.render()
    }
  }

  setSort(sort) {
    this.state.sort = sort
    this.render()
  }

  get sortedRepos() {
    const repos = [...this.state.repos]
    switch (this.state.sort) {
      case 'stars': return repos.sort((a, b) => b.stargazers_count - a.stargazers_count)
      case 'forks': return repos.sort((a, b) => b.forks_count - a.forks_count)
      case 'updated': return repos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      case 'name': return repos.sort((a, b) => a.name.localeCompare(b.name))
      default: return repos
    }
  }

  template() {
    return html`
      <form class="search-bar" @submit=${(e) => this.search(e)}>
        <input
          type="text"
          placeholder="Enter a GitHub username..."
          value=${this.state.query}
          ?disabled=${this.state.loading}
        >
        <button type="submit" ?disabled=${this.state.loading}>
          ${this.state.loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      ${this.state.error ? html`<div class="error">⚠️ ${this.state.error}</div>` : nothing}

      ${this.state.loading ? html`<div class="loading">Loading...</div>` : nothing}

      ${this.state.user ? html`
        <div class="user-card">
          <img src=${this.state.user.avatar_url} alt=${this.state.user.login}>
          <div>
            <h2>${this.state.user.name || this.state.user.login}</h2>
            ${this.state.user.bio ? html`<p>${this.state.user.bio}</p>` : nothing}
            <div class="stats">
              <span>📦 ${this.state.user.public_repos} repos</span>
              <span>👥 ${this.state.user.followers} followers</span>
              <span>👤 ${this.state.user.following} following</span>
              <a href=${this.state.user.html_url} target="_blank">View on GitHub ↗</a>
            </div>
          </div>
        </div>

        ${this.state.repos.length > 0 ? html`
          <div class="sort-bar">
            ${['stars', 'forks', 'updated', 'name'].map(s => html`
              <button
                class=${s === this.state.sort ? 'active' : ''}
                @click=${() => this.setSort(s)}
              >
                ${{ stars: '⭐ Stars', forks: '🍴 Forks', updated: '🕐 Updated', name: '🔤 Name' }[s]}
              </button>
            `)}
          </div>

          <div class="repos">
            ${repeat(this.sortedRepos, r => r.id, r => html`
              <repo-card .repo=${r}></repo-card>
            `)}
          </div>
        ` : html`<div class="empty">No public repositories</div>`}
      ` : nothing}
    `
  }
}

// ============================================================
// repo-card — displays a single repository
// ============================================================

// GitHub language → color (subset)
const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572a5',
  Go: '#00add8', Rust: '#dea584', Ruby: '#701516', Java: '#b07219',
  'C++': '#f34b7d', C: '#555555', 'C#': '#178600', PHP: '#4f5d95',
  Swift: '#f05138', Kotlin: '#a97bff', Shell: '#89e051', HTML: '#e34c26',
  CSS: '#563d7c', Vue: '#41b883', Svelte: '#ff3e00', Dart: '#00b4ab',
}

class RepoCard extends CoupElement {
  static tag = 'repo-card'
  static props = { repo: Object }

  template() {
    const r = this.repo
    if (!r) return nothing

    const lang = r.language
    const langColor = LANG_COLORS[lang] || '#8b949e'
    const updated = new Date(r.updated_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    })

    return html`
      <h3><a href=${r.html_url} target="_blank">${r.name}</a></h3>
      ${r.description
        ? html`<p>${r.description}</p>`
        : html`<p><em>No description</em></p>`
      }
      <div class="meta">
        ${lang ? html`
          <span>
            <span class="lang-dot" style="background:${langColor}"></span>${lang}
          </span>
        ` : nothing}
        ${r.stargazers_count > 0 ? html`<span>⭐ ${r.stargazers_count}</span>` : nothing}
        ${r.forks_count > 0 ? html`<span>🍴 ${r.forks_count}</span>` : nothing}
        <span>Updated ${updated}</span>
      </div>
    `
  }
}

// Register
GithubExplorer.define()
RepoCard.define()
