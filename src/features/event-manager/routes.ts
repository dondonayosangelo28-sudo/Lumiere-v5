import { moduleForRoute } from "../../auth/roleConfig"

/** Editor steps: 0 Client brief, 1 Mood board, 2 Asset plan, 3 Client approval. */
export type EventManagerView = "studio" | "concepts" | "creation" | "assets"

type RouteConfig = {
  view: EventManagerView
  subtitle: string
  /** Step a saved pitch opens on from this route. */
  openStep: number
  /** Step the New pitch action opens on from this route. */
  newStep: number
}

// Event Manager sidebar destinations (after Dashboard) served by the shared pitch studio.
export const eventManagerRoutes = {
  "module-client-pitching": {
    view: "studio",
    subtitle: "Prepare, present and track pitches for prospective clients",
    openStep: 0,
    newStep: 0,
  },
  "module-event-concepts": {
    view: "concepts",
    subtitle: "Start a pitch from a theme preset or reopen a saved mood board",
    openStep: 1,
    newStep: 0,
  },
  "module-event-creation": {
    view: "creation",
    subtitle: "Approved events by date. Open one to review its approved pitch",
    openStep: 0,
    newStep: 0,
  },
  "module-asset-requests": {
    view: "assets",
    subtitle: "Search the sample stock catalog and open each pitch's asset plan",
    openStep: 2,
    newStep: 2,
  },
} as const satisfies Record<string, RouteConfig>

export type EventManagerRoute = keyof typeof eventManagerRoutes

export const isEventManagerRoute = (route: string): route is EventManagerRoute =>
  Object.prototype.hasOwnProperty.call(eventManagerRoutes, route)

/** The sidebar label for the route, so the header always matches navigation. */
export const eventManagerLabel = (route: EventManagerRoute) =>
  moduleForRoute("Event Manager", route)?.label ?? "Event Pitches"
