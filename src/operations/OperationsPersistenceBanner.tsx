import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "../components/ui/ui"
import {
  OPERATIONS_PERSISTENCE_WARNING_TEXT,
  useOperationsPersistenceWarning,
} from "./store-core"

export function OperationsPersistenceBanner() {
  const { warning, retry } = useOperationsPersistenceWarning()

  if (!warning) {
    return null
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
    >
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="font-medium">
          {warning || OPERATIONS_PERSISTENCE_WARNING_TEXT}
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        icon={RefreshCw}
        onClick={() => {
          retry()
        }}
        className="h-8 shrink-0 px-3 text-xs"
      >
        Retry
      </Button>
    </div>
  )
}

export default OperationsPersistenceBanner
