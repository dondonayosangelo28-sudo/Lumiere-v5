import { useNotify as useRawNotify } from "../../components/ui/Notifications"
import {
  getOperationsPersistenceWarning,
  OPERATIONS_PERSISTENCE_WARNING_TEXT,
} from "../../operations/store"
import type { IssueResolutionType } from "../../operations/types"

export function useNotify() {
  const raw = useRawNotify()
  return (text: string) => {
    const persistenceWarning = getOperationsPersistenceWarning()
    const isErr =
      Boolean(persistenceWarning) ||
      /cannot|blocked|error|require|only|select|specify|enter|describe|provide|prepare|not found|assign the|not saved/i.test(
        text,
      )
    if (persistenceWarning && !/not saved/i.test(text)) {
      raw({
        tone: "error",
        text: OPERATIONS_PERSISTENCE_WARNING_TEXT,
      })
      return
    }
    raw({ tone: isErr ? "error" : "success", text })
  }
}

export function notifyMutationResult(
  notify: (text: string) => void,
  res: { ok: boolean; error?: string; savedToStorage?: boolean },
  successMessage: string,
) {
  if (!res.ok) {
    notify(res.error || "Operation could not be completed.")
    return
  }
  if (res.savedToStorage === false || getOperationsPersistenceWarning()) {
    notify(OPERATIONS_PERSISTENCE_WARNING_TEXT)
    return
  }
  notify(successMessage)
}

export const RESOLUTION_OPTIONS: IssueResolutionType[] = [
  "Recovered",
  "Repair Scheduled",
  "Approved Write-off",
  "Supplier Settled",
  "Charged to Client",
]

