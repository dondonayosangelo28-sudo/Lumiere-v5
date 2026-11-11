export function timeParts(value: string) {
  const [hour, minute] = (value || "12:00").split(":").map(Number)
  return { hour: hour % 12 || 12, minute, period: value && hour >= 12 ? "PM" : "AM" }
}

export function timeValue(hour: number, minute: number, period: string) {
  return `${String((hour % 12) + (period === "PM" ? 12 : 0)).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}
