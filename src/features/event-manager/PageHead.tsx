import { useContext, type ReactNode } from "react"
import { ChevronRight, Home, Presentation, type LucideIcon } from "lucide-react"
import { cx } from "../../components/ui/ui"
import { NavigationContext } from "../../components/layout/NavigationContext"

export function PageHead({
  eyebrow,
  title,
  copy,
  action,
  subAction,
  crumb,
}: {
  eyebrow?: string
  title: string
  copy: string
  action?: ReactNode
  subAction?: ReactNode
  crumb?: string
}) {
  const navigation = useContext(NavigationContext)
  const home = () => navigation?.go("overview")
  const crumbs = crumb ? ["Dashboard", crumb] : ["Dashboard"]
  return (
    <>
      {/* Same breadcrumb trail as the admin PageHeader. */}
      <nav
        aria-label="Breadcrumb"
        className="mb-4 flex flex-wrap items-center gap-2 text-[14px] text-muted-foreground"
      >
        <button
          type="button"
          onClick={home}
          className="transition-colors hover:text-foreground"
          aria-label="Home"
        >
          <Home size={16} />
        </button>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <span key={c} className="flex items-center gap-2">
              <ChevronRight size={16} aria-hidden="true" />
              <button
                type="button"
                aria-current={last ? "page" : undefined}
                onClick={() => !last && home()}
                className={cx(
                  "rounded-sm transition-colors hover:text-foreground",
                  last && "font-semibold text-foreground",
                )}
              >
                {c}
              </button>
            </span>
          )
        })}
      </nav>
      <header className="em-page-head">
        <div className={subAction ? "w-full" : "min-w-0"}>
          {eyebrow ? <p className="em-eyebrow">{eyebrow}</p> : null}
          <h1 className={cx("em-title", !eyebrow && "!mt-0")}>{title}</h1>
          {subAction ? (
            <div className="mt-2 flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <p className="em-lede max-w-[640px]" style={{ marginTop: 0 }}>
                {copy}
              </p>
              <div className="shrink-0">{subAction}</div>
            </div>
          ) : (
            <p className="em-lede">{copy}</p>
          )}
        </div>
        {action && <div className="em-page-head-action">{action}</div>}
      </header>
    </>
  )
}

export function StateCard({
  icon: Icon,
  title,
  copy,
  action,
  compact,
}: {
  icon: LucideIcon | typeof Presentation
  title: string
  copy: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={cx("em-state", compact && "em-state--compact")}>
      <span className="em-state-icon" aria-hidden>
        <Icon size={20} strokeWidth={1.4} />
      </span>
      <h2 className="em-state-title">{title}</h2>
      <p className="em-copy max-w-md">{copy}</p>
      {action}
    </div>
  )
}

export default PageHead

