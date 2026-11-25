import { dateKey, parseDate } from "../../../components/ui/calendarDates"
import type { Project } from "../model"
import { datePart, type StudioUser } from "../shared"

export type CalendarMode = "month" | "week" | "day"

export interface CalendarActivity {
  id: string
  title: string
  date: string
  startTime: string
  endTime: string
  meetingLink?: string
  tags: string[]
  note?: string
  type?: string
  venue?: string
  createdAt: string
  updatedAt: string
}

export type CalendarEventMetaMap = Record<string, { meetingLink?: string }>

export interface SelectedBlockInfo {
  kind: "pitch" | "activity"
  id: string
  colKey: string
  date: string
  startMin: number
  endMin: number
  topPx: number
  heightPx: number
  leftPct: number
  widthPct: number
}

export interface ContextualAddSlot {
  edge: "above" | "below"
  key: string
  colKey: string
  date: string
  startMin: number
  endMin: number
  topPx: number
  heightPx: number
}

export type DaySegment =
  | {
      kind: "pitch"
      id: string
      project: Project
      dayKey: string
      startMin: number
      endMin: number
      col: number
      totalCols: number
    }
  | {
      kind: "activity"
      id: string
      activity: CalendarActivity
      dayKey: string
      startMin: number
      endMin: number
      col: number
      totalCols: number
    }

export type RawDaySegment =
  | {
      kind: "pitch"
      id: string
      project: Project
      dayKey: string
      startMin: number
      endMin: number
    }
  | {
      kind: "activity"
      id: string
      activity: CalendarActivity
      dayKey: string
      startMin: number
      endMin: number
    }

export const calendarActivitiesStorageKey = (user: StudioUser) =>
  `lumiere-event-manager-calendar-activities-v1:${user.email.trim().toLowerCase()}`

export const calendarEventMetaStorageKey = (user: StudioUser) =>
  `lumiere-event-manager-calendar-meta-v1:${user.email.trim().toLowerCase()}`

export function readCalendarActivities(user: StudioUser): CalendarActivity[] {
  try {
    const raw = localStorage.getItem(calendarActivitiesStorageKey(user))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is CalendarActivity =>
        Boolean(
          item &&
            typeof item.id === "string" &&
            typeof item.title === "string" &&
            typeof item.date === "string" &&
            typeof item.startTime === "string" &&
            typeof item.endTime === "string",
        ),
    )
  } catch {
    return []
  }
}

export function writeCalendarActivities(user: StudioUser, list: CalendarActivity[]): void {
  try {
    localStorage.setItem(calendarActivitiesStorageKey(user), JSON.stringify(list))
  } catch {
    /* ignore storage quota errors */
  }
}

export function readCalendarEventMeta(user: StudioUser): CalendarEventMetaMap {
  try {
    const raw = localStorage.getItem(calendarEventMetaStorageKey(user))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as CalendarEventMetaMap)
      : {}
  } catch {
    return {}
  }
}

export function writeCalendarEventMeta(user: StudioUser, map: CalendarEventMetaMap): void {
  try {
    localStorage.setItem(calendarEventMetaStorageKey(user), JSON.stringify(map))
  } catch {
    /* ignore storage quota errors */
  }
}

export const spans = (p: Project, key: string) =>
  !!p.brief.start &&
  datePart(p.brief.start) <= key &&
  key <= datePart(p.brief.end || p.brief.start)

export const mondayShortWeekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
export const mondayMiniWeekdays = ["M", "T", "W", "T", "F", "S", "S"]
export const shortDate = (key: string) =>
  parseDate(key).toLocaleDateString("en-PH", { month: "short", day: "numeric" })

export function getManilaNow(): {
  dateKey: string
  hours: number
  minutes: number
  totalMinutes: number
} {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date())
    const year = parts.find((p) => p.type === "year")?.value ?? "2026"
    const month = parts.find((p) => p.type === "month")?.value ?? "01"
    const day = parts.find((p) => p.type === "day")?.value ?? "01"
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10)
    const min = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10)
    return {
      dateKey: `${year}-${month}-${day}`,
      hours: hour,
      minutes: min,
      totalMinutes: hour * 60 + min,
    }
  } catch {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, "0")
    const d = String(now.getDate()).padStart(2, "0")
    const h = now.getHours()
    const min = now.getMinutes()
    return {
      dateKey: `${y}-${m}-${d}`,
      hours: h,
      minutes: min,
      totalMinutes: h * 60 + min,
    }
  }
}

export function manilaTodayKey(): string {
  return getManilaNow().dateKey
}

export function getManilaCurrentMonth(): {
  year: number
  month: number
  startKey: string
  endKey: string
  startMs: number
  endMs: number
} {
  const manilaNow = getManilaNow()
  const [yStr, mStr] = manilaNow.dateKey.split("-")
  const year = parseInt(yStr, 10)
  const month = parseInt(mStr, 10)
  const lastDay = new Date(year, month, 0).getDate()
  const startKey = `${yStr}-${mStr}-01`
  const endKey = `${yStr}-${mStr}-${String(lastDay).padStart(2, "0")}`

  const startMs = Date.parse(`${startKey}T00:00:00+08:00`)
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const nextMonthStartKey = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`
  const endMs = Date.parse(`${nextMonthStartKey}T00:00:00+08:00`)

  return { year, month, startKey, endKey, startMs, endMs }
}

export function parseIsoManilaMs(isoStr: string): number {
  if (!isoStr) return NaN
  const trimmed = isoStr.trim()
  if (!trimmed) return NaN
  if (/[Z+-]\d{2}(:?\d{2})?$/.test(trimmed) || trimmed.endsWith("Z")) {
    return Date.parse(trimmed)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return Date.parse(`${trimmed}T00:00:00+08:00`)
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const withSeconds = trimmed.length === 16 ? `${trimmed}:00` : trimmed
    return Date.parse(`${withSeconds}+08:00`)
  }
  return Date.parse(trimmed)
}

export function projectHoursInCurrentMonth(p: Project, monthStartMs: number, monthEndMs: number): number {
  if (!p.brief.start) return 0
  const s = parseIsoManilaMs(p.brief.start)
  if (Number.isNaN(s)) return 0
  const e = p.brief.end ? parseIsoManilaMs(p.brief.end) : s + 3_600_000
  const end = Number.isNaN(e) || e <= s ? s + 3_600_000 : e

  const clampedStart = Math.max(s, monthStartMs)
  const clampedEnd = Math.min(end, monthEndMs)
  if (clampedEnd <= clampedStart) return 0
  return Math.max(0.5, (clampedEnd - clampedStart) / 3_600_000)
}

/** Formats a YYYY-MM-DD key as "Saturday 25, April" with the comma after the day number. */
export function formatPopupDate(key: string): string {
  const d = parseDate(key)
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" })
  const dayNum = d.getDate()
  const monthName = d.toLocaleDateString("en-US", { month: "long" })
  return `${weekday} ${dayNum}, ${monthName}`
}

export function validateHttpsUrl(raw: string): { valid: boolean; url: string; error?: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { valid: true, url: "" }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== "https:" || !parsed.hostname || !parsed.hostname.includes(".")) {
      return {
        valid: false,
        url: trimmed,
        error: "Enter a valid HTTPS link.",
      }
    }
    return { valid: true, url: trimmed }
  } catch {
    return {
      valid: false,
      url: trimmed,
      error: "Enter a valid HTTPS link.",
    }
  }
}

export const BREAKDOWN_BAR_COLORS = [
  "var(--color-success)",
  "var(--fg)",
  "var(--chart-2)",
  "var(--chart-3)",
]

export const HOUR_ROW_HEIGHT = 74
export const LATE_NIGHT_MIN_TAIL = 24

export function startOfMondayWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
  const dow = d.getDay() // 0 = Sun, 1 = Mon .. 6 = Sat
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return d
}

export function mondayWeekDays(date: Date): Date[] {
  const start = startOfMondayWeek(date)
  return Array.from(
    { length: 7 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12),
  )
}

export function mondayCalendarDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12)
  const start = startOfMondayWeek(first)
  return Array.from(
    { length: 42 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12),
  )
}

export function parseClockMinutes(clock: string, fallbackMinutes: number): number {
  if (!clock || !clock.includes(":")) return fallbackMinutes
  const [h, m] = clock.slice(0, 5).split(":").map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return fallbackMinutes
  return Math.max(0, Math.min(24 * 60, h * 60 + m))
}

export function parseMinutesOfDay(iso: string, fallbackMinutes: number): number {
  if (!iso) return fallbackMinutes
  const timeStr = iso.includes("T") ? iso.slice(11, 16) : iso.slice(0, 5)
  return parseClockMinutes(timeStr, fallbackMinutes)
}

export function fmt24(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

export function getNextValidActivitySchedule(viewingDate: string): {
  date: string
  startTime: string
  endTime: string
} {
  const manila = getManilaNow()
  let targetDate = viewingDate
  if (targetDate < manila.dateKey) {
    targetDate = manila.dateKey
  }

  if (targetDate === manila.dateKey) {
    const nextHour = Math.floor(manila.totalMinutes / 60) + 1
    if (nextHour < 23) {
      const sMin = nextHour * 60
      const eMin = Math.min(24 * 60, (nextHour + 1) * 60)
      return {
        date: targetDate,
        startTime: fmt24(sMin),
        endTime: fmt24(eMin),
      }
    } else {
      // Past 11:00 PM Manila time: advance to tomorrow at 9:00 AM
      const tmrw = parseDate(manila.dateKey)
      tmrw.setDate(tmrw.getDate() + 1)
      return {
        date: dateKey(tmrw),
        startTime: "09:00",
        endTime: "10:00",
      }
    }
  }

  return {
    date: targetDate,
    startTime: "09:00",
    endTime: "10:00",
  }
}

export function fmtMinutes12(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)))
  const h24 = Math.floor(clamped / 60)
  const m = clamped % 60
  const h12 = h24 % 12 || 12
  const period = h24 >= 12 ? "PM" : "AM"
  return `${h12}:${String(m).padStart(2, "0")} ${period}`
}

export function fmtClock12(clock: string): string {
  if (!clock) return ""
  const timeStr = clock.includes("T") ? clock.slice(11, 16) : clock.slice(0, 5)
  const min = parseClockMinutes(timeStr, 0)
  return fmtMinutes12(min)
}

export function fmtEventClockRange(p: Project): string {
  const s = fmtClock12(p.brief.start || "09:00")
  const e = fmtClock12(p.brief.end || p.brief.start || "17:00")
  return `${s} - ${e}`
}

export function scheduledHoursForProject(p: Project): number {
  if (!p.brief.start) return 0
  const s = Date.parse(p.brief.start)
  const e = p.brief.end ? Date.parse(p.brief.end) : s + 3_600_000
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 1
  return Math.max(0.5, (e - s) / 3_600_000)
}

export function scheduledHoursForActivity(a: CalendarActivity): number {
  const s = parseClockMinutes(a.startTime, 9 * 60)
  const e = parseClockMinutes(a.endTime, s + 60)
  return Math.max(0.5, (e - s) / 60)
}

export function buildDaySegments(
  dayKeyStr: string,
  approved: Project[],
  activities: CalendarActivity[],
  gridStartMin: number,
  gridEndMin: number,
): DaySegment[] {
  const raw: RawDaySegment[] = []

  approved.forEach((p) => {
    if (!spans(p, dayKeyStr)) return
    const sDate = datePart(p.brief.start)
    const eDate = datePart(p.brief.end || p.brief.start)
    const startsToday = sDate === dayKeyStr
    const endsToday = eDate === dayKeyStr
    const rawStart = startsToday ? parseMinutesOfDay(p.brief.start, 9 * 60) : gridStartMin
    const rawEnd = endsToday
      ? parseMinutesOfDay(p.brief.end || p.brief.start, rawStart + 60)
      : gridEndMin
    const startMin = Math.max(gridStartMin, Math.min(gridEndMin - 30, rawStart))
    const endMin = Math.max(startMin + 45, Math.min(gridEndMin, rawEnd))
    raw.push({
      kind: "pitch",
      id: p.id,
      project: p,
      dayKey: dayKeyStr,
      startMin,
      endMin,
    })
  })

  activities.forEach((act) => {
    if (act.date !== dayKeyStr) return
    const rawStart = parseClockMinutes(act.startTime, 9 * 60)
    const rawEnd = parseClockMinutes(act.endTime, rawStart + 60)
    const startMin = Math.max(gridStartMin, Math.min(gridEndMin - 30, rawStart))
    const endMin = Math.max(startMin + 30, Math.min(gridEndMin, rawEnd))
    raw.push({
      kind: "activity",
      id: act.id,
      activity: act,
      dayKey: dayKeyStr,
      startMin,
      endMin,
    })
  })

  raw.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)

  // Group overlapping segments into clusters and assign side-by-side columns
  const result: DaySegment[] = []
  let cluster: RawDaySegment[] = []
  let clusterEnd = -1

  const flushCluster = (items: RawDaySegment[]) => {
    if (items.length === 0) return
    const colEnds: number[] = []
    const assigned: { item: RawDaySegment; col: number }[] = []
    for (const item of items) {
      let placedCol = colEnds.findIndex((end) => end <= item.startMin)
      if (placedCol === -1) {
        placedCol = colEnds.length
        colEnds.push(item.endMin)
      } else {
        colEnds[placedCol] = item.endMin
      }
      assigned.push({ item, col: placedCol })
    }
    const totalCols = Math.max(1, colEnds.length)
    for (const { item, col } of assigned) {
      result.push({ ...item, col, totalCols } as DaySegment)
    }
  }

  for (const seg of raw) {
    if (cluster.length === 0 || seg.startMin < clusterEnd) {
      cluster.push(seg)
      clusterEnd = Math.max(clusterEnd, seg.endMin)
    } else {
      flushCluster(cluster)
      cluster = [seg]
      clusterEnd = seg.endMin
    }
  }
  flushCluster(cluster)
  return result
}

export function segmentTopPx(seg: DaySegment): number {
  return (seg.startMin / 60) * HOUR_ROW_HEIGHT + 2
}

export function segmentHeightPx(seg: DaySegment): number {
  return Math.max(48, ((seg.endMin - seg.startMin) / 60) * HOUR_ROW_HEIGHT - 4)
}

export function computeContextualAddSlots(
  colKey: string,
  segments: DaySegment[],
  selectedBlock: SelectedBlockInfo | null,
): ContextualAddSlot[] {
  if (!selectedBlock || selectedBlock.colKey !== colKey) return []
  const manilaNow = getManilaNow()
  if (colKey < manilaNow.dateKey) return []

  const selectedSeg = segments.find(
    (seg) => seg.kind === selectedBlock.kind && seg.id === selectedBlock.id,
  )
  if (!selectedSeg) return []

  // Group touching or overlapping segments so dashed + slots sit only on free outer edges.
  const group = new Set<DaySegment>([selectedSeg])
  let changed = true
  while (changed) {
    changed = false
    for (const seg of segments) {
      if (group.has(seg)) continue
      for (const member of group) {
        if (seg.startMin <= member.endMin && member.startMin <= seg.endMin) {
          group.add(seg)
          changed = true
          break
        }
      }
    }
  }

  const groupMembers = Array.from(group)
  const groupStartMin = Math.min(...groupMembers.map((s) => s.startMin))
  const groupEndMin = Math.max(...groupMembers.map((s) => s.endMin))
  const groupTopPx = Math.min(...groupMembers.map((s) => segmentTopPx(s)))
  const groupBottomPx = Math.max(...groupMembers.map((s) => segmentTopPx(s) + segmentHeightPx(s)))

  let prevSeg: DaySegment | null = null
  let nextSeg: DaySegment | null = null
  for (const seg of segments) {
    if (group.has(seg)) continue
    if (seg.endMin < groupStartMin && (!prevSeg || seg.endMin > prevSeg.endMin)) {
      prevSeg = seg
    }
    if (seg.startMin > groupEndMin && (!nextSeg || seg.startMin < nextSeg.startMin)) {
      nextSeg = seg
    }
  }

  const slots: ContextualAddSlot[] = []

  const prevEndMin = prevSeg ? prevSeg.endMin : 0
  const prevBottomPx = prevSeg ? segmentTopPx(prevSeg) + segmentHeightPx(prevSeg) : 0
  const freeAboveMin = groupStartMin - prevEndMin
  const aboveStartMin = Math.max(prevEndMin, groupStartMin - 60)
  const aboveEndMin = groupStartMin
  const aboveClearancePx = groupTopPx - 4 - (prevSeg ? prevBottomPx + 4 : 2)

  const isAbovePast = colKey === manilaNow.dateKey && aboveStartMin <= manilaNow.totalMinutes
  if (freeAboveMin >= 15 && aboveClearancePx >= 24 && aboveStartMin < 23 * 60 && !isAbovePast) {
    const heightPx = Math.min(56, aboveClearancePx)
    slots.push({
      edge: "above",
      key: `adjacent-add-above-${selectedBlock.kind}-${selectedBlock.id}`,
      colKey,
      date: colKey,
      startMin: aboveStartMin,
      endMin: aboveEndMin,
      topPx: groupTopPx - 4 - heightPx,
      heightPx,
    })
  }

  const nextStartMin = nextSeg ? nextSeg.startMin : 24 * 60
  const nextTopPx = nextSeg ? segmentTopPx(nextSeg) : 24 * HOUR_ROW_HEIGHT
  const freeBelowMin = nextStartMin - groupEndMin
  const belowStartMin = groupEndMin
  const belowEndMin = Math.min(nextStartMin, groupEndMin + 60)
  const belowClearancePx = (nextSeg ? nextTopPx - 4 : 24 * HOUR_ROW_HEIGHT - 2) - (groupBottomPx + 4)

  // Exclude slots starting at or after 11:00 PM Manila time (23:00 / 1380 min) and slots in the past.
  const isBelowPast = colKey === manilaNow.dateKey && belowStartMin <= manilaNow.totalMinutes
  if (freeBelowMin >= 15 && belowClearancePx >= 24 && belowStartMin < 23 * 60 && !isBelowPast) {
    const heightPx = Math.min(56, belowClearancePx)
    slots.push({
      edge: "below",
      key: `adjacent-add-below-${selectedBlock.kind}-${selectedBlock.id}`,
      colKey,
      date: colKey,
      startMin: belowStartMin,
      endMin: belowEndMin,
      topPx: groupBottomPx + 4,
      heightPx,
    })
  }

  return slots
}

