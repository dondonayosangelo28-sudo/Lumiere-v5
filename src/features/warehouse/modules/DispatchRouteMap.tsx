import { useEffect } from "react"
import { Expand, MapPin, Warehouse } from "lucide-react"
import type { TransformStyleFunction } from "maplibre-gl"
import { Map, MapControls, MapMarker, MapRoute, MarkerContent, useMap } from "../../../components/ui/map"
import type { DispatchBatchDirection } from "../../../operations/types"
import { venueMapUrl, type VenueLocation } from "../../../operations/venue-location"
import { fernbrookRouteBounds, fernbrookRoutes, fernbrookStops, hasFernbrookSampleRoute } from "./fernbrook-sample-route"

const applyDispatchMapPalette: TransformStyleFunction = (_, style) => ({
  ...style,
  layers: style.layers.map((layer) => {
    if (layer.type === "background") {
      return { ...layer, paint: { ...layer.paint, "background-color": "#111111" } }
    }
    if (layer.type === "fill" && layer["source-layer"] === "water") {
      return { ...layer, paint: { ...layer.paint, "fill-color": "#242424", "fill-outline-color": "#292929" } }
    }
    if (layer.type === "line" && (layer["source-layer"] === "water" || layer["source-layer"] === "waterway")) {
      return { ...layer, paint: { ...layer.paint, "line-color": "#303030" } }
    }
    return layer
  }),
})

const fitOptions = { padding: { top: 27, left: 24, right: 54, bottom: 64 }, duration: 0 }

function FitRouteControl({
  hasRoute,
  isDemo,
  venue,
}: {
  hasRoute: boolean
  isDemo: boolean
  venue: { longitude: number; latitude: number }
}) {
  const { map } = useMap()
  const label = hasRoute ? (isDemo ? "Fit demo route" : "Fit route") : "Recenter venue pin"
  return (
    <button
      className="dispatch-route-fit"
      type="button"
      title={label}
      aria-label={label}
      onClick={() => {
        if (hasRoute) {
          map?.fitBounds(fernbrookRouteBounds, fitOptions)
        } else {
          map?.flyTo({ center: [venue.longitude, venue.latitude], zoom: 15, duration: 0 })
        }
      }}
    >
      <Expand size={14} aria-hidden="true" />
    </button>
  )
}

function CollapseAttributionOnOpen() {
  const { map } = useMap()

  useEffect(() => {
    if (!map) return
    const collapse = () => {
      const container = map.getContainer()
      const attrib = container.querySelector<HTMLElement>(".maplibregl-ctrl-attrib")
      if (!attrib) return
      attrib.classList.add("maplibregl-compact")
      attrib.classList.remove("maplibregl-compact-show")
      if (attrib instanceof HTMLDetailsElement) {
        attrib.open = false
      } else {
        attrib.removeAttribute("open")
      }
    }
    collapse()
    map.once("load", collapse)
    return () => {
      map.off("load", collapse)
    }
  }, [map])

  return null
}

function DispatchRouteLine({ coordinates }: { coordinates: [number, number][] }) {
  const { map } = useMap()
  if (!map) return null

  // MapLibre paint properties need the resolved color value from the Warehouse theme.
  const accent = getComputedStyle(map.getContainer()).getPropertyValue("--dispatch-route-ink").trim()
  return <MapRoute coordinates={coordinates} color={accent || "#ef8a52"} width={4} opacity={0.95} interactive={false} />
}

export default function DispatchRouteMap({
  direction,
  venuePin,
}: {
  direction: DispatchBatchDirection
  venuePin?: VenueLocation & { label: string }
}) {
  const { coordinates } = fernbrookRoutes[direction]
  const { warehouse } = fernbrookStops
  const venue = venuePin ?? fernbrookStops.venue
  const isDemo = !venuePin
  const matchesFernbrookRoute =
    Boolean(venuePin) &&
    hasFernbrookSampleRoute(venuePin?.label ?? "") &&
    Math.abs((venuePin?.latitude ?? 0) - fernbrookStops.venue.latitude) < 0.05 &&
    Math.abs((venuePin?.longitude ?? 0) - fernbrookStops.venue.longitude) < 0.05
  const hasRoute = isDemo || matchesFernbrookRoute

  return (
    <Map
      theme="dark"
      transformStyle={applyDispatchMapPalette}
      bounds={hasRoute ? fernbrookRouteBounds : undefined}
      center={hasRoute ? undefined : [venue.longitude, venue.latitude]}
      zoom={hasRoute ? undefined : 15}
      fitBoundsOptions={fitOptions}
      scrollZoom={false}
      cooperativeGestures
      dragRotate={false}
      touchPitch={false}
      maxZoom={17}
    >
      {hasRoute && <DispatchRouteLine coordinates={coordinates} />}
      {hasRoute && (
        <MapMarker longitude={warehouse.longitude} latitude={warehouse.latitude}>
          <MarkerContent>
            <span className="dispatch-route-marker" data-stop="warehouse" title={warehouse.label}>
              <Warehouse size={13} aria-hidden="true" />
            </span>
          </MarkerContent>
        </MapMarker>
      )}
      <MapMarker longitude={venue.longitude} latitude={venue.latitude}>
        <MarkerContent>
          {venuePin ? (
            <a
              className="dispatch-route-marker"
              data-stop="venue"
              href={venueMapUrl(venuePin)}
              target="_blank"
              rel="noreferrer"
              title={venue.label}
              aria-label={"Open pinned venue on map: " + venue.label}
            >
              <MapPin size={13} aria-hidden="true" />
            </a>
          ) : (
            <span className="dispatch-route-marker" data-stop="venue" title={venue.label}>
              <MapPin size={13} aria-hidden="true" />
            </span>
          )}
        </MarkerContent>
      </MapMarker>
      <MapControls position="top-right" />
      <FitRouteControl hasRoute={hasRoute} isDemo={isDemo} venue={venue} />
      <CollapseAttributionOnOpen />
    </Map>
  )
}
