import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import vm from "node:vm"
import ts from "typescript"

// Exercise the shared notification lifecycle with deterministic hooks and clocks.
// No browser or extra test dependencies are required.
const require = createRequire(import.meta.url)
let current
let clock = 0
let timerId = 0
const timers = new Map()
const context = { value: null }
const react = {
  createContext: () => context,
  useContext: () => context.value,
  useCallback: (callback, dependencies) => slot(() => callback, dependencies),
  useState(initial) {
    const index = current.cursor++
    if (!(index in current.slots)) current.slots[index] = initial
    const owner = current
    return [
      owner.slots[index],
      (update) => {
        owner.slots[index] =
          typeof update === "function" ? update(owner.slots[index]) : update
      },
    ]
  },
  useEffect(effect, dependencies) {
    slot(
      () => ({ cleanup: effect() }),
      dependencies,
      (old) => old.cleanup?.(),
    )
  },
}
function slot(make, dependencies, cleanup) {
  const index = current.cursor++
  const old = current.slots[index]
  if (!old || dependencies.some((value, i) => value !== old.dependencies[i])) {
    if (old) cleanup?.(old.value)
    current.slots[index] = { value: make(), dependencies }
  }
  return current.slots[index].value
}
const jsx = (type, props, key) => ({ type, props: props ?? {}, key })
const compiled = ts.transpileModule(
  readFileSync("src/components/Notifications.tsx", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText
const sandbox = {
  exports: {},
  document: { body: {} },
  window: {
    setTimeout(callback, delay) {
      const id = ++timerId
      timers.set(id, { callback, at: clock + delay })
      return id
    },
    clearTimeout(id) {
      timers.delete(id)
    },
  },
  require(name) {
    if (name === "react") return react
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx }
    if (name === "react-dom") return { createPortal: (element) => element }
    return require(name)
  },
}
vm.runInNewContext(compiled, sandbox)
const { NotificationProvider, useNotify, TOAST_DURATION } = sandbox.exports
const instance = () => ({ cursor: 0, slots: [] })
function render(component, props, owner) {
  current = owner
  current.cursor = 0
  return component(props)
}
function descendants(node) {
  if (!node || typeof node !== "object") return []
  return [node, ...[node.props?.children].flat(Infinity).flatMap(descendants)]
}
function advance(milliseconds) {
  clock += milliseconds
  for (const [id, timer] of [...timers]) {
    if (timer.at <= clock) {
      timers.delete(id)
      timer.callback()
    }
  }
}
const provider = instance()
const renderProvider = () =>
  render(NotificationProvider, { children: "app" }, provider)
let tree = renderProvider()
context.value = tree.props.value
const notify = useNotify()
notify({ tone: "success", text: "Mood board created and saved." })
tree = renderProvider()
const toastNodes = (node) =>
  descendants(node).filter((n) => typeof n.type === "function" && n.props.toast)
let nodes = toastNodes(tree)
assert.equal(nodes.length, 1, "one notification per action")
const toastOwner = instance()
let toast = render(nodes[0].type, nodes[0].props, toastOwner)
assert.equal(toast.props.role, "status")
assert.ok(toast.props.className.includes("rounded-lg"))
assert.equal(descendants(toast).filter((n) => n.type === "button").length, 1)
const bar = descendants(toast).find((n) =>
  n.props.className?.includes("animate-shrink"),
)
assert.equal(bar.props.style.animationDuration, "4000ms")
assert.equal(bar.props.style.backgroundColor, "#22c55e")
assert.equal(TOAST_DURATION, 4000)
advance(3999)
assert.equal(toastNodes(renderProvider()).length, 1)
// Rerenders must not restart the timer.
render(nodes[0].type, nodes[0].props, toastOwner)
advance(1)
assert.equal(
  toastNodes(renderProvider()).length,
  0,
  "dismisses after four seconds",
)

let undone = 0
notify({
  tone: "error",
  text: "Changes could not be saved. Please try again.",
  action: { label: "Retry", onClick: () => undone++ },
})
nodes = toastNodes(renderProvider())
toast = render(nodes[0].type, nodes[0].props, instance())
assert.equal(toast.props.role, "alert")
assert.equal(
  descendants(toast).find((n) => n.props.style?.backgroundColor)?.props.style
    .backgroundColor,
  "#ef4444",
)
descendants(toast)
  .find((n) => n.type === "button" && n.props.children === "Retry")
  .props.onClick()
assert.equal(undone, 1, "action callback preserved")
assert.equal(toastNodes(renderProvider()).length, 0)

notify({ tone: "success", text: "Image uploaded." })
nodes = toastNodes(renderProvider())
toast = render(nodes[0].type, nodes[0].props, instance())
descendants(toast)
  .find((n) => n.props["aria-label"] === "Dismiss notification")
  .props.onClick()
assert.equal(toastNodes(renderProvider()).length, 0, "close button dismisses")
notify({ tone: "success", text: "First action" })
nodes = toastNodes(renderProvider())
const firstOwner = instance()
render(nodes[0].type, nodes[0].props, firstOwner)
advance(2000)
notify({ tone: "success", text: "Second action" })
nodes = toastNodes(renderProvider())
render(nodes[1].type, nodes[1].props, instance())
advance(2000)
assert.equal(
  toastNodes(renderProvider()).length,
  1,
  "stacked toasts have independent timers",
)
assert.equal(toastNodes(renderProvider())[0].props.toast.text, "Second action")
advance(2000)
assert.equal(toastNodes(renderProvider()).length, 0)
assert.ok(
  descendants(renderProvider()).some((n) =>
    n.props.className?.includes("max-w-[calc(100vw-32px)]"),
  ),
  "mobile viewport constraint retained",
)
console.log(
  "Shared notification lifecycle, timing, status, action, close, and responsive constraints passed.",
)
