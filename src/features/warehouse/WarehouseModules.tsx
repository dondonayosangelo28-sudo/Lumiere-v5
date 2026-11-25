import { ArrowRight } from "lucide-react"
import { Badge, Button, Card } from "../../components/ui/ui"
import { fmtStamp } from "../event-manager/shared"
import {
  resolveOperationsRoute,
  useOperationsNavigationContext,
  useOperationsStore,
  type OperationsNavigationContext,
  type OpsActor,
} from "../../operations/store"
import { OperationsPersistenceBanner } from "../../operations/OperationsPersistenceBanner"
import AssetInventoryModule from "./modules/AssetInventoryModule"
import OrderRequestsModule from "./modules/OrderRequestsModule"
import DeficitQueueModule from "./modules/DeficitQueueModule"
import AssetAcquisitionModule from "./modules/AssetAcquisitionModule"
import CustomFabricationModule from "./modules/CustomFabricationModule"
import PersonnelDeploymentModule from "./modules/PersonnelDeploymentModule"
import DamageAssessmentModule from "./modules/DamageAssessmentModule"
import DamageMissingReportsModule from "./modules/DamageMissingReportsModule"
import DispatchReturnsModule from "./modules/DispatchReturnsModule"
import ReplenishmentDeficitsModule from "./modules/ReplenishmentDeficitsModule"
import VendorsModule from "./modules/VendorsModule"

export {
  AssetInventoryModule,
  OrderRequestsModule,
  DeficitQueueModule,
  AssetAcquisitionModule,
  CustomFabricationModule,
  PersonnelDeploymentModule,
  DamageAssessmentModule,
  DamageMissingReportsModule,
  DispatchReturnsModule,
  ReplenishmentDeficitsModule,
  VendorsModule,
}

export function WarehouseDashboardSummary({
  onNavigate,
}: {
  onNavigate: (
    route: string,
    ctx?: string | Partial<OperationsNavigationContext>,
  ) => void
}) {
  const state = useOperationsStore()
  const orders = state.orderRequests.filter((order) => !order.warehouseClosed)
  const openDeficits = state.deficitQueue.filter((item) => item.status !== "Fulfilled").length
  const pendingRentals = orders
    .flatMap((order) => order.rentals)
    .filter((rental) => rental.confirmationStatus !== "Confirmed").length
  const blockers = orders.reduce(
    (count, order) =>
      count +
      order.crewAssignments.filter((assignment) => assignment.taskStatus === "Blocked").length,
    0,
  )

  return (
    <div className="mb-6 space-y-4">
      <OperationsPersistenceBanner />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Event fulfillment</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Track active orders from asset preparation through return.
            </p>
          </div>
          <Button
            type="button"
            icon={ArrowRight}
            onClick={() => onNavigate("module-events", { subView: "orders" })}
          >
            Open events
          </Button>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line px-5 py-3 sm:grid-cols-4">
          {[
            ["Active orders", orders.length],
            ["Stock shortages", openDeficits],
            ["Pending rentals", pendingRentals],
            ["Crew blockers", blockers],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        {orders.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            Approved events will appear here when their asset plans reach Warehouse.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {orders.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-start justify-between gap-2 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold">{order.eventTitle}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {order.venue} · {fmtStamp(order.startDateTime)}
                  </p>
                </div>
                <Badge tone={order.returnChecklist ? "info" : "neutral"}>
                  {order.returnChecklist
                    ? "Ready for review"
                    : order.outboundDeparture
                      ? "Dispatched"
                      : "Preparing"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

export default function WarehouseModulePage({
  moduleKey,
  rawRoute,
  actor,
  onNavigate,
}: {
  moduleKey: string
  rawRoute?: string
  actor: OpsActor
  onNavigate: (
    route: string,
    ctx?: string | Partial<OperationsNavigationContext>,
  ) => void
}) {
  const state = useOperationsStore()
  const navCtx = useOperationsNavigationContext()
  const resolved = resolveOperationsRoute(rawRoute || `module-${moduleKey}`)
  const effectiveKey = resolved.moduleKey

  const renderModule = () => {
    switch (effectiveKey) {
      case "events":
      case "order-requests":
        return (
          <OrderRequestsModule
            actor={actor}
            initialEventId={navCtx.eventId}
            onNavigate={onNavigate}
          />
        )

      case "asset-inventory":
        return <AssetInventoryModule actor={actor} onNavigate={onNavigate} />

      case "deficit-queue":
      case "asset-acquisition":
      case "replenishment-deficits":
        return (
          <ReplenishmentDeficitsModule
            actor={actor}
            initialEventId={navCtx.eventId}
            initialSubView={
              effectiveKey === "asset-acquisition" || navCtx.subView === "acquisitions"
                ? "acquisitions"
                : navCtx.subView === "consolidated"
                  ? "consolidated"
                  : "deficits"
            }
            onNavigate={onNavigate}
          />
        )

      case "vendors":
        return <VendorsModule actor={actor} />

      case "crew-scheduling":
      case "personnel-deployment":
        return (
          <PersonnelDeploymentModule
            actor={actor}
            initialEventId={navCtx.eventId}
            initialJobId={navCtx.jobId}
            onNavigate={onNavigate}
          />
        )

      case "production":
      case "custom-fabrication":
        return (
          <CustomFabricationModule
            actor={actor}
            mode="production"
            initialEventId={navCtx.eventId}
            initialJobId={navCtx.jobId}
            onNavigate={onNavigate}
          />
        )

      case "verification":
        return (
          <CustomFabricationModule
            actor={actor}
            mode="verification"
            initialEventId={navCtx.eventId}
            initialJobId={navCtx.jobId}
            onNavigate={onNavigate}
          />
        )

      case "damage-missing-reports":
      case "damage-assessment":
        return (
          <DamageMissingReportsModule
            actor={actor}
            initialEventId={navCtx.eventId}
            initialReportId={navCtx.reportId}
            onNavigate={onNavigate}
          />
        )

      case "dispatch-returns":
        return (
          <DispatchReturnsModule
            actor={actor}
            initialEventId={navCtx.eventId}
            initialSubView={resolved.impliedContext.subView ?? navCtx.subView}
            navUpdatedAt={navCtx.updatedAt}
            onNavigate={onNavigate}
          />
        )

      default:
        return (
          <OrderRequestsModule
            actor={actor}
            initialEventId={navCtx.eventId}
            onNavigate={onNavigate}
          />
        )
    }
  }

  return (
    <div className="space-y-4">
      <OperationsPersistenceBanner />
      {renderModule()}
    </div>
  )
}
