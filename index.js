const SvgList = ["svg", "use"]
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
  } else {
    tag = tag.toLowerCase()
    if (SvgList.includes(tag)) {
      el = document.createElementNS("http://www.w3.org/2000/svg", tag)
    } else {
      el = document.createElement(tag)
    }
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
      const types = Array.from(eles).filter(e => e.tagName.toLowerCase() === tag)
      if (types.length) {
        if (attributes["data-key"]) {
          el = types.find(e => e.dataset.key == String(attributes["data-key"]))
        } else {
          el = types[0]
        }
        eles.delete(el)
      }
    }
    return this(el || tag, attributes, text, children, key)
  }
}

window.ELCache = new WeakMap()

function pushChildren(set, node) {
  if (customElements.get(node.tagName.toLowerCase())) {
    set.add(node)
  } else {
    for (const n of node.children) {
      pushChildren(set, n)
    }
  }
}

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
    tree.push = function(val) {
      tree.constructor.prototype.push.call(tree, val)
      return val
    }
    this.build(tree)
    const all = ELCache.get(this) || new Set()
    for (const item of tree) {
      pushChildren(all, item)
    }
    ELCache.set(this, all)
    tree.forEach(el => this.appendChild(el))
    console.timeEnd(`render ${renderID}`)
  }
}

