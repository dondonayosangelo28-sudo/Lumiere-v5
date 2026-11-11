import { useState } from 'react'
import { useCloseOnOverlay, useOverlayContainer } from './OverlayLayer'
import { Menu } from '@base-ui/react/menu'
import { MoreVertical, type LucideIcon } from 'lucide-react'
import { cx } from './ui'
import { dropdownItem, dropdownSurface } from './Dropdown'

export default function RowMenu({ items, menuClassName }: { items: { label: string; icon: LucideIcon; danger?: boolean; disabled?: string; onClick: () => void }[]; menuClassName?: string }) {
  const container = useOverlayContainer()
  const [open, setOpen] = useState(false)
  useCloseOnOverlay(() => setOpen(false))
  return (
    <Menu.Root modal={false} open={open} onOpenChange={setOpen}>
      <Menu.Trigger aria-label="Row actions" className="grid size-8 place-items-center rounded-full bg-fg/[0.08] text-foreground outline-none transition-colors hover:bg-fg/[0.16] focus-visible:ring-2 focus-visible:ring-fg/30">
        <MoreVertical size={15} />
      </Menu.Trigger>
      <Menu.Portal container={container}>
        <Menu.Positioner sideOffset={8} align="end" collisionPadding={8} className="z-[100] max-w-[calc(100vw-16px)]">
          <Menu.Popup className={cx(dropdownSurface, 'min-w-44 max-h-[min(24rem,var(--available-height))] max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain outline-none', menuClassName)}>
            {items.map((it) => <Menu.Item key={it.label} disabled={!!it.disabled} title={it.disabled} onClick={() => { if (!it.disabled) it.onClick() }} className={cx(dropdownItem, 'w-full', it.danger && !it.disabled && 'text-danger')}>
              <it.icon size={16} strokeWidth={1.75} className="shrink-0" />
              <span className="flex min-w-0 flex-col">
                {it.label}
                {it.disabled && <span className="max-w-52 whitespace-normal text-[11px] leading-4">{it.disabled}</span>}
              </span>
            </Menu.Item>)}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
