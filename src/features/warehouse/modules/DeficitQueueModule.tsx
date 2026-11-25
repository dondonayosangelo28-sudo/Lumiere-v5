import { useEffect, useState } from "react"
import { ArrowRight, ShoppingCart } from "lucide-react"
import { Badge, Button, Card, PageHeader } from "../../../components/ui/ui"
import {
  useOperationsStore,
  type OperationsNavigationContext,
  type OpsActor,
} from "../../../operations/store"

export default function DeficitQueueModule({
  onNavigate,
  initialEventId,
}: {
  actor: OpsActor
  onNavigate: (
    route: string,
    ctx?: string | Partial<OperationsNavigationContext>,
  ) => void
  initialEventId?: string
}) {
  const state = useOperationsStore()
  const [filterEventId, setFilterEventId] = useState<string>(initialEventId ?? "")

  useEffect(() => {
    if (initialEventId !== undefined) {
      setFilterEventId(initialEventId)
    }
  }, [initialEventId])

  const visibleDeficits = filterEventId
    ? state.deficitQueue.filter((d) => d.eventId === filterEventId)
    : state.deficitQueue
  const openCount = visibleDeficits.filter((d) => d.status !== "Fulfilled").length

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Dashboard", "Events", "Event Stock Shortages"]}
        title="Event Stock Shortages (Deficit Queue)"
        subtitle="Deficit resolution and replenishment ordering are centralized in Replenishment & Deficits."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {filterEventId && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setFilterEventId("")}
              >
                Show All Events ({state.deficitQueue.length})
              </Button>
            )}
            <Button
              type="button"
              icon={ShoppingCart}
              onClick={() =>
                onNavigate("module-replenishment-deficits", {
                  eventId: filterEventId || undefined,
                  subView: "deficits",
                })
              }
            >
              Open Replenishment &amp; Deficits
            </Button>
          </div>
        }
      />

      <Card className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {filterEventId
                ? `Active Shortages for Selected Event (${openCount} open of ${visibleDeficits.length})`
                : `Active Stock Shortages (${openCount} open of ${visibleDeficits.length})`}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Prepare consolidated purchase orders, add event-bound replenishment items, and record partial or full receipts in Replenishment &amp; Deficits.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            icon={ArrowRight}
            onClick={() =>
              onNavigate("module-replenishment-deficits", {
                eventId: filterEventId || undefined,
                subView: "deficits",
              })
            }
          >
            Manage in Replenishment &amp; Deficits
          </Button>
        </div>

        {visibleDeficits.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {filterEventId
              ? "No stock shortages recorded for the selected event."
              : "No active stock shortages in the Deficit Queue."}
          </p>
        ) : (
          <div className="divide-y divide-line rounded-md border border-line">
            {visibleDeficits.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs"
              >
                <div>
                  <span className="font-semibold text-foreground">
                    {d.assetName}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    ({d.assetCode}) · {d.eventTitle} · Shortage: {d.shortageQty}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={d.urgency === "Critical" ? "danger" : d.urgency === "High" ? "warning" : "neutral"}>
                    {d.urgency}
                  </Badge>
                  <Badge tone={d.status === "Fulfilled" ? "success" : "info"}>
                    {d.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
