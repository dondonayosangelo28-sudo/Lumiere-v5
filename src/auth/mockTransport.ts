import { getState, randomId, runAuditOperation, update } from './store'
import { AuthFlowError } from './types'

// Short simulated latency; also applies the one-shot network failure switch.
export async function respond<T>(fn: () => T, ms = 450 + Math.random() * 350): Promise<T> {
  await new Promise((r) => setTimeout(r, ms))
  if (getState().failNextRequest) {
    update((d) => void (d.failNextRequest = false))
    throw new AuthFlowError('NETWORK_ERROR')
  }
  return runAuditOperation(randomId('op'), fn)
}

