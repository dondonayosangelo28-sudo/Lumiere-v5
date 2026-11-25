import type { OperationsNavigationContext, OpsActor } from "../../../operations/store"
import ProductionWorkspaceModule from "./ProductionWorkspaceModule"
import VerificationWorkspaceModule from "./VerificationWorkspaceModule"

export default function CustomFabricationModule({
  actor,
  mode = "production",
  initialEventId,
  initialJobId,
  embedded = false,
  onNavigate,
}: {
  actor: OpsActor
  mode?: "production" | "verification"
  initialEventId?: string
  initialJobId?: string
  embedded?: boolean
  onNavigate?: (
    route: string,
    ctx?: string | Partial<OperationsNavigationContext>,
  ) => void
}) {
  if (mode === "verification") {
    return (
      <VerificationWorkspaceModule
        actor={actor}
        initialEventId={initialEventId}
        initialJobId={initialJobId}
        embedded={embedded}
        onNavigate={onNavigate}
      />
    )
  }

  return (
    <ProductionWorkspaceModule
      actor={actor}
      initialEventId={initialEventId}
      initialJobId={initialJobId}
      embedded={embedded}
      onNavigate={onNavigate}
    />
  )
}
