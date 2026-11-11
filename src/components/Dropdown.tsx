import { useCloseOnOverlay, useOverlayContainer } from './OverlayLayer'
import { Children, isValidElement, useState, type ReactNode, type SelectHTMLAttributes, type ChangeEvent } from 'react'
import { Select } from '@base-ui/react/select'
import { Check } from 'lucide-react'
import { cx } from './ui'

export const dropdownSurface = 'rounded-lg border border-line bg-card p-1 text-foreground shadow-xl'
export const dropdownItem = 'flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-fg/10 focus-visible:bg-fg/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fg/30 data-highlighted:bg-fg/10 data-highlighted:ring-1 data-highlighted:ring-inset data-highlighted:ring-fg/30 data-selected:bg-fg/15 data-selected:font-semibold data-disabled:cursor-default data-disabled:text-muted-foreground data-disabled:opacity-60'

// Accept existing option children so filters retain their values, labels, and validation.
export default function Dropdown({ children, value, defaultValue, onChange, className, disabled, required, name, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const container = useOverlayContainer()
  const [open, setOpen] = useState(false)
  useCloseOnOverlay(() => setOpen(false))
  const options: { value: string; label: ReactNode; disabled?: boolean }[] = []
  const collect = (nodes: ReactNode) => Children.forEach(nodes, (node) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(node)) return
    if (node.type === 'option') options.push({ value: String(node.props.value ?? Children.toArray(node.props.children).join('')), label: node.props.children, disabled: node.props.disabled })
    else collect(node.props.children)
  })
  collect(children)
  return (
    <Select.Root modal={false} open={open} onOpenChange={setOpen} value={value === undefined ? undefined : String(value)} defaultValue={defaultValue === undefined ? options[0]?.value : String(defaultValue)} disabled={disabled} required={required} name={name} items={options.map((o) => ({ value: o.value, label: o.label }))} onValueChange={(next) => {
      const target = { value: next ?? '', name: name ?? '' }
      onChange?.({ target, currentTarget: target } as ChangeEvent<HTMLSelectElement>)
    }}>
      <Select.Trigger id={props.id} title={props.title} tabIndex={props.tabIndex} aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby']} aria-invalid={props['aria-invalid']} aria-describedby={props['aria-describedby']} className={cx(className, 'flex items-center text-left text-foreground outline-none focus-visible:ring-2 focus-visible:ring-fg/30 disabled:cursor-default disabled:opacity-60')} >
        <Select.Value />
      </Select.Trigger>
      <Select.Portal container={container}>
        <Select.Positioner align="start" sideOffset={6} collisionPadding={8} alignItemWithTrigger={false} className="z-[100] max-w-[calc(100vw-16px)]">
          <Select.Popup className={cx(dropdownSurface, 'min-w-[var(--anchor-width)] max-w-[calc(100vw-16px)]')}>
            <Select.List className="max-h-[min(20rem,var(--available-height))] overflow-y-auto overscroll-contain">
              {options.map((o) => <Select.Item key={o.value} value={o.value} disabled={o.disabled} className={cx(dropdownItem, 'justify-between')}>
                <Select.ItemText className="min-w-0 whitespace-normal break-words">{o.label}</Select.ItemText>
                <Select.ItemIndicator><Check size={16} aria-hidden /></Select.ItemIndicator>
              </Select.Item>)}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
