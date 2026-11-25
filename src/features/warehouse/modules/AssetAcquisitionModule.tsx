import { ArrowRight, ShoppingCart } from "lucide-react"
import { Badge, Button, Card, PageHeader } from "../../../components/ui/ui"
import {
  useOperationsStore,
  type OperationsNavigationContext,
  type OpsActor,
} from "../../../operations/store"

export default function AssetAcquisitionModule({
  onNavigate,
}: {
  actor: OpsActor
  onNavigate?: (
    route: string,
    ctx?: string | Partial<OperationsNavigationContext>,
  ) => void
}) {
  const state = useOperationsStore()
  const pendingCount = state.acquisitions.filter(
    (a) => a.status !== "Received & Stocked",
  ).length

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "Asset Inventory", "Acquisitions & Replenishment"]}
        title="Acquisitions & Replenishment"
        subtitle="Acquisition order preparation and receipt confirmation now live in Replenishment & Deficits."
        actions={
          onNavigate ? (
            <Button
              type="button"
              icon={ShoppingCart}
              onClick={() =>
                onNavigate("module-replenishment-deficits", {
                  subView: "acquisitions",
                })
              }
            >
              Open Replenishment &amp; Deficits
            </Button>
          ) : undefined
        }
      />

      <Card className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Acquisition Orders ({state.acquisitions.length} total · {pendingCount} pending receipt)
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Select active vendors, place orders without prematurely inflating available stock, and confirm partial or full deliveries in Replenishment &amp; Deficits.
            </p>
          </div>
          {onNavigate && (
            <Button
              type="button"
              variant="outline"
              icon={ArrowRight}
              onClick={() =>
                onNavigate("module-replenishment-deficits", {
                  subView: "acquisitions",
                })
              }
            >
              Manage Acquisitions &amp; Receipts
            </Button>
          )}
        </div>

        {state.acquisitions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No acquisition orders recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-line rounded-md border border-line">
            {state.acquisitions.slice(0, 8).map((acq) => (
              <div
                key={acq.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs"
              >
                <div>
                  <span className="font-mono font-semibold text-foreground">
                    {acq.id}
                  </span>{" "}
                  · <span className="font-semibold text-foreground">{acq.assetName}</span>{" "}
                  <span className="text-muted-foreground">
                    ({acq.receivedQty ?? (acq.status === "Received & Stocked" ? acq.quantity : 0)}/{acq.quantity} received · {acq.supplierName})
                  </span>
                </div>
                <Badge tone={acq.status === "Received & Stocked" ? "success" : "info"}>
                  {acq.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
