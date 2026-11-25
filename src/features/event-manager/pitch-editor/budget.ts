export const BUDGET_ERROR = "Enter a non-negative amount with up to two decimal places."

export function validateBudget(value?: number): string | undefined {
  if (value == null) return
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isSafeInteger(Math.round(value * 100)) ||
    Number(value.toFixed(2)) !== value
  ) return BUDGET_ERROR
}

export function parseBudget(input: string): { value?: number; error?: string } {
  const text = input.trim()
  if (!text) return { value: undefined }
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) {
    return { error: BUDGET_ERROR }
  }
  const value = Number(text.replace(/,/g, ""))
  const error = validateBudget(value)
  return error ? { error } : { value }
}

export function formatBudget(value?: number): string {
  if (value == null || validateBudget(value)) return ""
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}
