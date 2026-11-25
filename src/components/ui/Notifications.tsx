import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { Check, CircleAlert, X } from "lucide-react"

export const TOAST_DURATION = 4000
export type Notification = {
  tone: "success" | "error"
  text: string
  action?: {
    label: string
    onClick: () => void
  }
}
type Toast = Notification & { id: number }
const NotificationContext = createContext<((
  notification: Notification,
) => void) | null>(null)
let nextId = 0

export function useNotify() {
  const notify = useContext(NotificationContext)
  if (!notify) throw new Error("Notifications require NotificationProvider.")
  return notify
}

// Extracted from the Admin overview toast; all accounts share its layout and timing.
function AdminToast({
  toast,
  dismiss,
}: {
  toast: Toast
  dismiss: (id: number) => void
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), TOAST_DURATION)
    return () => window.clearTimeout(timer)
  }, [toast.id, dismiss])
  const colour = toast.tone === "error" ? "#ef4444" : "#22c55e"
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className="pointer-events-auto relative overflow-hidden rounded-lg border border-edge bg-card text-foreground shadow-[0_10px_30px_rgba(0,0,0,0.5)] animate-toast-in"
    >
      <div className="flex items-center gap-2.5 px-4 py-3 pr-8 text-[13px] font-medium">
        <span
          className="grid size-5 shrink-0 place-items-center rounded-full text-white"
          style={{ backgroundColor: colour }}
        >
          {toast.tone === "error" ? (
            <CircleAlert size={12} strokeWidth={3} aria-hidden />
          ) : (
            <Check size={12} strokeWidth={3} aria-hidden />
          )}
        </span>
        <span className="min-w-0 break-words">{toast.text}</span>
        {toast.action && (
          <button
            type="button"
            className="shrink-0 underline underline-offset-2"
            onClick={() => {
              toast.action!.onClick()
              dismiss(toast.id)
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => dismiss(toast.id)}
        className="absolute right-2 top-1.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X size={12} aria-hidden />
      </button>
      <span
        className="absolute inset-x-0 bottom-0 h-1 rounded-full animate-shrink"
        style={{
          backgroundColor: colour,
          animationDuration: `${TOAST_DURATION}ms`,
        }}
        aria-hidden
      />
    </div>
  )
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const notify = useCallback((notification: Notification) => {
    const toast = { ...notification, id: ++nextId }
    setToasts((items) => [...items, toast])
  }, [])
  const dismiss = useCallback(
    (id: number) => setToasts((items) => items.filter((t) => t.id !== id)),
    [],
  )
  return (
    <NotificationContext.Provider value={notify}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed left-1/2 top-24 z-[100] flex w-[356px] max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col gap-2">
          {toasts.map((toast) => (
            <AdminToast key={toast.id} toast={toast} dismiss={dismiss} />
          ))}
        </div>,
        document.body,
      )}
    </NotificationContext.Provider>
  )
}
