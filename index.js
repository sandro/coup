function EL(tag, attributes={}, text="", children=[], container=null) {
  let el
  if (tag instanceof HTMLElement) {
    el = tag
    if (el.hasAttributes()) {
      const keys = Object.keys(attributes)
      const removals = []
      for (const key of el.attributes) {
        if (keys.indexOf(key.name) < 0) {
          removals.push(key.name)
        }
      }
      removals.forEach(key => el.removeAttribute(key))
    }
  }
  if (!el) {
    el = document.createElement(tag)
  }
  for (const [key, value] of Object.entries(attributes)) {
    el.setAttribute(key, value)
  }
  el.textContent = text
  children.forEach(child => el.appendChild(child))
  return el
}

EL.cacheKey = function(key) {
  return (tag, attributes={}, text="", children=[]) => {
    tag = tag.toUpperCase()
    let el
    const eles = ELCache.get(key)
    if (eles) {
      const types = eles.filter(e => e.tagName === tag)
      if (types.length) {
        if (attributes["data-key"]) {
          el = types.find(e => e.dataset.key == attributes["data-key"])
        } else {
          el = types[0]
        }
        eles.splice(eles.indexOf(el), 1)
      }
    }
    return this(el || tag, attributes, text, children, key)
  }
}

window.ELCache = new WeakMap()

let renders = 0
class Coup extends HTMLElement {
  constructor() {
    super()
    this.EL = EL.cacheKey(this)
  }
  connectedCallback() {
    this.render()
  }
  build(tree) {}
  render() {
    const renderID = renders++
    console.time(`render ${renderID}`)
    this.textContent = ""
    const tree = []
    this.build(tree)
    const all = [...(ELCache.get(this) || []), ...tree]
    ELCache.set(this, all)
    tree.forEach(el => this.appendChild(el))
    console.timeEnd(`render ${renderID}`)
  }
}

