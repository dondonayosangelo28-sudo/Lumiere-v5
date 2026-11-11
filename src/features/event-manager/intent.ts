/** What a Dashboard shortcut asks Event Pitches to open after navigation. */
export type PitchIntent =
  | { kind: "open"; id: string }
  | { kind: "new"; step?: number }
  | { kind: "theme"; themeId: string; step?: number }
  | { kind: "registered-theme"; id: string }

// Held per signed-in account for the single navigation that follows the request.
const pending = new Map<string, PitchIntent>()
const keyOf = (email: string) => email.trim().toLowerCase()

export const requestPitch = (email: string, intent: PitchIntent) => {
  pending.set(keyOf(email), intent)
}
export const peekPitchIntent = (email: string) =>
  pending.get(keyOf(email)) ?? null
export const clearPitchIntent = (email: string) => {
  pending.delete(keyOf(email))
}
