export const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const parseDate = (value: string) => new Date(`${value}T12:00:00`)
export function calendarDays(month: Date) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1, 12)
  start.setDate(1 - start.getDay())
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12))
}
export const allowedDate = (value: string, min?: string, max?: string) => (!min || value >= min) && (!max || value <= max)
export function shiftMonth(date: Date, delta: number) {
  const end = new Date(date.getFullYear(), date.getMonth() + delta + 1, 0, 12).getDate()
  return new Date(date.getFullYear(), date.getMonth() + delta, Math.min(date.getDate(), end), 12)
}
