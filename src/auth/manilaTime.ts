export const MANILA_TIME_ZONE = 'Asia/Manila'
export const TIMEZONE = 'GMT+8'
export const dayStart = (value: string) => value ? new Date(`${value}T00:00:00+08:00`).getTime() : null
export const dayEnd = (value: string) => value ? new Date(`${value}T23:59:59.999+08:00`).getTime() : null
export const fmtDateTime = (t: number) => new Date(t).toLocaleString('en-US', { timeZone: MANILA_TIME_ZONE, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })
export const fmtTime = (t: number) => new Date(t).toLocaleTimeString('en-US', { timeZone: MANILA_TIME_ZONE, hour: 'numeric', minute: '2-digit' })
export const fmtFull = (t: number) => `${fmtDateTime(t)} ${TIMEZONE}`
