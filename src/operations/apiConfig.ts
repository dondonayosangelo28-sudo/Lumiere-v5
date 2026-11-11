/**
 * Adapted from OLD SYSTEM v1 (`src/shared/api/apiConfig.ts`).
 * Centralizes API base URL resolution and bearer token headers for Warehouse
 * Operations Manager, Ground Crew, and Event Manager handoff calls.
 */
const envApiUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL
export const API_BASE_URL = envApiUrl || "http://localhost:5078/api"
export const HAS_LIVE_BACKEND = Boolean(envApiUrl)

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  try {
    let token = localStorage.getItem("_lumiere_auth_token")
    if (!token) {
      const storedUser = localStorage.getItem("_lumiere_auth_user")
      if (storedUser) {
        const parsed = JSON.parse(storedUser)
        token = parsed.token
      }
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  } catch {
    // Fallback silently in preview mode
  }
  return headers
}

export async function tryApiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; reason: string }> {
  if (!HAS_LIVE_BACKEND) {
    return { ok: false, reason: "VITE_API_URL not configured; using synchronized local operations store." }
  }
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...(options.headers || {}),
      },
    })
    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status}` }
    }
    const text = await response.text()
    const data = (text ? JSON.parse(text) : {}) as T
    return { ok: true, data }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Network error" }
  }
}

