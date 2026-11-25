import { useEffect, useMemo, useRef } from "react"

/** Coalesce updates to one commit per animation frame and preserve the final value. */
export function createFrameScheduler<T>(
  callback: (value: T) => void,
  requestFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancelFrame: (id: number) => void = cancelAnimationFrame,
) {
  let frame: number | null = null
  let pending: { value: T } | null = null
  const flush = () => {
    if (frame !== null) cancelFrame(frame)
    frame = null
    const next = pending
    pending = null
    if (next) callback(next.value)
  }
  return {
    schedule(value: T) {
      pending = { value }
      if (frame === null) frame = requestFrame(flush)
    },
    flush,
    cancel() {
      if (frame !== null) cancelFrame(frame)
      frame = null
      pending = null
    },
  }
}

export function useFrameCallback<T>(callback: (value: T) => void) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  const scheduler = useMemo(
    () => createFrameScheduler((value: T) => callbackRef.current(value)),
    [],
  )
  useEffect(() => () => scheduler.cancel(), [scheduler])
  return scheduler
}
