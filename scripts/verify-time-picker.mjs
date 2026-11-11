import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import vm from "node:vm"
import ts from "typescript"

const require = createRequire(import.meta.url)
const cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const exports = {}
  cache.set(name, exports)
  const source = ts.transpileModule(
    readFileSync(`src/components/${name}`, "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText
  vm.runInNewContext(source, {
    exports,
    require(specifier) {
      if (specifier === "./timeValues") return load("timeValues.ts")
      if (specifier === "react")
        return {
          useState: (initial) => [initial, () => {}],
          useEffect: () => {},
          useRef: () => ({ current: null }),
          useId: () => "test-id",
        }
      if (specifier === "./ui")
        return { cx: (...classes) => classes.filter(Boolean).join(" ") }
      if (specifier === "./Dropdown")
        return {
          dropdownSurface:
            "rounded-lg border border-line bg-card text-foreground shadow-xl",
        }
      if (specifier === "./OverlayLayer")
        return {
          useCloseOnOverlay: () => {},
          useOverlayContainer: () => undefined,
        }
      if (specifier === "@base-ui/react/popover")
        return {
          Popover: Object.fromEntries(
            ["Root", "Trigger", "Portal", "Positioner", "Popup", "Close"].map(
              (key) => [key, key],
            ),
          ),
        }
      return require(specifier)
    },
  })
  return exports
}
const { timeParts, timeValue } = load("timeValues.ts")
for (let hour = 0; hour < 24; hour++) {
  for (let minute = 0; minute < 60; minute++) {
    const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
    const parts = timeParts(value)
    assert.equal(timeValue(parts.hour, parts.minute, parts.period), value)
  }
}
assert.equal(timeValue(12, 0, "AM"), "00:00")
assert.equal(timeValue(12, 0, "PM"), "12:00")
const TimePicker = load("TimePicker.tsx").default
function nodes(element) {
  if (!element || typeof element !== "object") return []
  return [element, ...[element.props?.children].flat(Infinity).flatMap(nodes)]
}
let selected
const tree = TimePicker({
  value: "22:45",
  onChange: (value) => {
    selected = value
  },
  "aria-label": "Ends time",
})
const all = nodes(tree)
assert.equal(
  all.find((node) => node.type === "Trigger").props["aria-label"],
  "Ends time",
)
assert.ok(
  all.some((node) => node.props.className?.includes("bg-card")),
  "shared themed surface",
)
const columns = all.filter(
  (node) => typeof node.type === "function" && node.props.options,
)
assert.equal(columns.length, 3)
assert.equal(columns[0].props.value, "10")
assert.equal(columns[1].props.value, "45")
assert.equal(columns[2].props.value, "PM")
columns[2].props.onChange("AM")
assert.equal(selected, "10:45")
columns[0].props.onChange("12")
assert.equal(selected, "12:45")
columns[1].props.onChange("00")
assert.equal(selected, "22:00")
const disabled = nodes(
  TimePicker({ value: "", onChange() {}, disabled: true }),
).find((node) => node.type === "Trigger")
assert.equal(disabled.props.disabled, true)
console.log(
  "PASS: all 1,440 time conversions, midnight/noon, themed picker, hour/minute/period controls, compact list controls and disabled state.",
)
