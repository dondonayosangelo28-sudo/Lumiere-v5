import { type ReactNode } from "react"

export function StepHead({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <div className="em-step-head">
      <div className="min-w-0">
        <p className="em-eyebrow">{eyebrow}</p>
        <h3 className="em-step-title">{title}</h3>
        <p className="em-step-copy">{description}</p>
      </div>
      {actions && <div className="em-step-head-actions">{actions}</div>}
    </div>
  )
}

export default StepHead

