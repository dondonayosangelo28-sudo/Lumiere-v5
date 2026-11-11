import { useEffect, useRef, useState } from "react"
import { Combobox } from "@base-ui/react/combobox"
import { Check, Search } from "lucide-react"
import { cx } from "./ui"
import { dropdownItem, dropdownSurface } from "./Dropdown"
import { useCloseOnOverlay, useOverlayContainer } from "./OverlayLayer"

type Option = {
  value: string
  label: string
  group?: string
}
export function matchesPickerOption(option: Option, query: string) {
  const text = `${option.label} ${option.group ?? ""}`.toLowerCase()
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .every((word) => text.includes(word))
}

type OptionGroup = {
  value: string
  items: Option[]
}

type Props = {
  options: Option[]
  value: string
  onChange: (value: string) => void
  placeholder: string
  disabled?: boolean
  className?: string
  openRequest?: number
  allowCustom?: boolean
  searchPlaceholder?: string
  emptyMessage?: string
  "aria-label": string
}

export default function SearchableDropdown({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  className,
  allowCustom,
  openRequest = 0,
  searchPlaceholder = "Search name or category…",
  emptyMessage = "No matching assets.",
  "aria-label": label,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const input = useRef<HTMLInputElement>(null)
  const container = useOverlayContainer()
  useCloseOnOverlay(() => setOpen(false))
  useEffect(() => { if (openRequest > 0) { setOpen(true); setQuery("") } }, [openRequest])
  const typed = query.trim()
  const hasMatch = options.some(
    (o) =>
      o.label.toLowerCase() === typed.toLowerCase() ||
      o.value.toLowerCase() === typed.toLowerCase(),
  )
  const items =
    allowCustom && typed && !hasMatch
      ? [...options, { value: typed, label: `Add “${typed}”` }]
      : options
  const selected =
    options.find((option) => option.value === value) ??
    (allowCustom && value ? { value, label: value } : null)
  const grouped = items.some((option) => option.group)
  const groups: OptionGroup[] = []
  if (grouped) {
    for (const option of items) {
      const name = option.group ?? "Other"
      let group = groups.find((entry) => entry.value === name)
      if (!group) {
        group = { value: name, items: [] }
        groups.push(group)
      }
      group.items.push(option)
    }
  }
  const renderOption = (option: Option) => (
    <Combobox.Item
      key={option.value}
      value={option}
      className={cx(dropdownItem, "justify-between")}
    >
      <span className="min-w-0 whitespace-normal break-words">
        {option.label}
      </span>
      <Combobox.ItemIndicator>
        <Check size={16} aria-hidden />
      </Combobox.ItemIndicator>
    </Combobox.Item>
  )
  return (
    <Combobox.Root<Option>
      items={grouped ? groups : items}
      filter={matchesPickerOption}
      value={selected}
      isItemEqualToValue={(option, selected) => option.value === selected.value}
      onValueChange={(option) => onChange(option?.value ?? "")}
      inputValue={query}
      onInputValueChange={setQuery}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setQuery("")
      }}
      disabled={disabled}
      autoHighlight
    >
      <Combobox.Trigger
        aria-label={label}
        className={cx(
          className,
          "flex items-center text-left text-foreground outline-none focus-visible:ring-2 focus-visible:ring-fg/30 disabled:cursor-default disabled:opacity-60",
        )}
      >
        <Combobox.Value placeholder={placeholder} />
      </Combobox.Trigger>
      <Combobox.Portal container={container}>
        <Combobox.Positioner
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="z-[100] max-w-[calc(100vw-16px)]"
        >
          <Combobox.Popup
            initialFocus={input}
            className={cx(
              dropdownSurface,
              "w-[var(--anchor-width)] max-w-[calc(100vw-16px)]",
            )}
          >
            <div className="relative mb-1 border-b border-line p-2">
              <Search
                size={16}
                aria-hidden
                className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Combobox.Input
                ref={input}
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                className="h-10 w-full rounded-md border border-line bg-field pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-fg/25"
              />
            </div>
            <Combobox.Empty className="text-center text-sm text-muted-foreground">
              <div className="px-3 py-5">{emptyMessage}</div>
            </Combobox.Empty>
            <Combobox.List className="max-h-[min(20rem,var(--available-height))] overflow-y-auto overscroll-contain">
              {(entry: Option | OptionGroup) =>
                "items" in entry ? (
                  <Combobox.Group key={entry.value} items={entry.items}>
                    <Combobox.GroupLabel className="px-3 pb-1 pt-3 text-xs font-semibold text-muted-foreground">
                      {entry.value}
                    </Combobox.GroupLabel>
                    <Combobox.Collection>{renderOption}</Combobox.Collection>
                  </Combobox.Group>
                ) : (
                  renderOption(entry)
                )
              }
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
