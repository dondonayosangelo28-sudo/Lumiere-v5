import type { Account, AuditEvent } from './store'
import { dayStart, dayEnd } from './manilaTime'

export const emptyAuditFilters = { username: '', email: '', firstName: '', lastName: '', from: '', to: '' }
export type AuditFilters = typeof emptyAuditFilters

export function auditDateError(filters: AuditFilters) {
  if (filters.from && filters.to && filters.from > filters.to) return 'From Date must be on or before To Date.'
  return ''
}

export function filterAuditEvents(events: readonly AuditEvent[], _accounts: readonly Account[], filters: AuditFilters) {
  const contains = (value: string, query: string) => value.toLowerCase().includes(query.trim().toLowerCase())
  const from = dayStart(filters.from) ?? -Infinity
  const to = dayEnd(filters.to) ?? Infinity
  return events.filter((event) => {
    // Legacy events fall back to the recorded display name, never today's profile.
    const parts = event.actor.name.trim().split(/\s+/)
    const email = event.actor.email ?? ''
    return event.at >= from && event.at <= to
      && contains(`${event.actor.name} ${email.split('@')[0]}`, filters.username)
      && contains(email, filters.email)
      && contains(event.actor.firstName ?? parts[0] ?? '', filters.firstName)
      && contains(event.actor.lastName ?? parts.slice(1).join(' '), filters.lastName)
  }).sort((a, b) => b.at - a.at)
}
