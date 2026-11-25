import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Loader2, MapPin, Navigation } from "lucide-react"
import Modal from "../../../components/overlay/Modal"
import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  useMap,
} from "../../../components/ui/map"
import { Button, Input } from "../../../components/ui/ui"
import type { VenueLocation } from "../model"

export type GeocodedPlace = {
  id: string
  name: string
  address: string
  latitude: number
  longitude: number
}

export const CURATED_PH_VENUES: GeocodedPlace[] = [
  {
    id: "preset-fernbrook",
    name: "The Glasshouse at Fernbrook, Alabang",
    address: "Portofino South, Daang Hari Rd, Almanza Dos, Las Piñas / Alabang",
    latitude: 14.370468,
    longitude: 121.00849,
  },
  {
    id: "preset-smx",
    name: "SMX Convention Center Manila, Pasay",
    address: "Seashell Ln, Mall of Asia Complex, Pasay, Metro Manila",
    latitude: 14.5321,
    longitude: 120.9815,
  },
  {
    id: "preset-shang-fort",
    name: "Shangri-La The Fort, BGC, Taguig",
    address: "30th Street corner 5th Avenue, Bonifacio Global City, Taguig",
    latitude: 14.5524,
    longitude: 121.0468,
  },
  {
    id: "preset-marriott",
    name: "Marriott Grand Ballroom, Pasay",
    address: "2 Resort Drive, Newport World Resorts, Pasay, Metro Manila",
    latitude: 14.5208,
    longitude: 121.0192,
  },
  {
    id: "preset-peninsula",
    name: "The Peninsula Manila, Makati",
    address: "Corner of Ayala and Makati Avenues, Makati, Metro Manila",
    latitude: 14.5548,
    longitude: 121.0251,
  },
  {
    id: "preset-enderun",
    name: "The Tent at Enderun, Taguig",
    address: "1100 Campus Avenue, McKinley Hill, Fort Bonifacio, Taguig",
    latitude: 14.5343,
    longitude: 121.0518,
  },
  {
    id: "preset-whitespace",
    name: "Whitespace Manila, Makati",
    address: "2314 Chino Roces Ave Ext, Makati, Metro Manila",
    latitude: 14.5382,
    longitude: 121.0219,
  },
  {
    id: "preset-blue-leaf",
    name: "The Blue Leaf Cosmopolitan, Quezon City",
    address: "80 E. Rodriguez Jr. Ave, Bagumbayan, Libis, Quezon City",
    latitude: 14.6064,
    longitude: 121.0789,
  },
  {
    id: "preset-okada",
    name: "Okada Manila Grand Ballroom, Parañaque",
    address: "New Seaside Dr, Entertainment City, Parañaque, Metro Manila",
    latitude: 14.5153,
    longitude: 120.9798,
  },
  {
    id: "preset-palacio",
    name: "Palacio de Memoria, Parañaque",
    address: "95 Roxas Blvd, Tambo, Parañaque, Metro Manila",
    latitude: 14.5227,
    longitude: 120.9912,
  },
]

export function matchPresetVenue(text: string): GeocodedPlace | undefined {
  const q = text.trim().toLowerCase()
  if (!q) return undefined
  return CURATED_PH_VENUES.find(
    (p) =>
      p.name.toLowerCase() === q ||
      (q.includes("fernbrook") && p.id === "preset-fernbrook") ||
      (q.includes("glasshouse") && p.id === "preset-fernbrook") ||
      p.name.toLowerCase().includes(q),
  )
}

function MapTapListener({
  onTap,
}: {
  onTap: (latitude: number, longitude: number) => void
}) {
  const { map } = useMap()
  const onTapRef = useRef(onTap)
  onTapRef.current = onTap

  useEffect(() => {
    if (!map) return
    const handleClick = (e: { lngLat: { lng: number; lat: number } }) => {
      onTapRef.current(e.lngLat.lat, e.lngLat.lng)
    }
    map.on("click", handleClick)
    return () => {
      map.off("click", handleClick)
    }
  }, [map])

  return null
}

function formatReverseAddress(data: {
  name?: string
  display_name?: string
  address?: Record<string, string | undefined>
}): { name: string; address: string } | null {
  const displayName = data.display_name?.trim()
  if (!displayName) return null
  const parts = displayName
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const primary =
    data.name?.trim() ||
    data.address?.road ||
    data.address?.neighbourhood ||
    data.address?.suburb ||
    parts[0] ||
    displayName
  const city =
    data.address?.city ||
    data.address?.town ||
    data.address?.municipality ||
    parts[1] ||
    ""
  const label =
    city && !primary.toLowerCase().includes(city.toLowerCase())
      ? `${primary}, ${city}`
      : primary
  return { name: label, address: displayName }
}

export default function VenueLocationPicker({
  venue,
  venueLocation,
  disabled = false,
  onChange,
  errorProps,
}: {
  venue: string
  venueLocation?: VenueLocation
  disabled?: boolean
  onChange: (patch: { venue: string; venueLocation?: VenueLocation }) => void
  errorProps?: Record<string, unknown>
}) {
  const [openSuggestions, setOpenSuggestions] = useState(false)
  const [remoteResults, setRemoteResults] = useState<GeocodedPlace[]>([])
  const [searching, setSearching] = useState(false)
  const [mapPickerOpen, setMapPickerOpen] = useState(false)

  const initialPin = useMemo<VenueLocation>(() => {
    if (venueLocation) {
      return {
        name: venueLocation.name || venue || "Pinned Venue",
        address: venueLocation.address || venue || "Metro Manila, Philippines",
        latitude: venueLocation.latitude,
        longitude: venueLocation.longitude,
      }
    }
    const preset = matchPresetVenue(venue)
    if (preset) {
      return {
        name: preset.name,
        address: preset.address,
        latitude: preset.latitude,
        longitude: preset.longitude,
      }
    }
    return {
      name: venue || "Metro Manila Venue",
      address: "Metro Manila, Philippines",
      latitude: 14.5547,
      longitude: 121.0244,
    }
  }, [venue, venueLocation])

  const [draftPin, setDraftPin] = useState<VenueLocation>(initialPin)
  const [resolvingAddress, setResolvingAddress] = useState(false)
  const [mapSessionKey, setMapSessionKey] = useState(0)
  const lookupSeqRef = useRef(0)
  const reverseAbortRef = useRef<AbortController | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpenSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleOutside)
    return () => document.removeEventListener("mousedown", handleOutside)
  }, [])

  // Query Nominatim geocoding API with debounce; gracefully fall back to curated presets
  useEffect(() => {
    const q = venue.trim()
    if (!openSuggestions || q.length < 2) {
      setRemoteResults([])
      setSearching(false)
      return
    }
    const ctrl = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=ph&limit=5&addressdetails=1&q=${encodeURIComponent(q)}`
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { Accept: "application/json" },
        })
        if (!res.ok) throw new Error("Geocoder unavailable")
        const data = (await res.json()) as Array<{
          place_id: number | string
          name?: string
          display_name: string
          lat: string
          lon: string
        }>
        const mapped: GeocodedPlace[] = data
          .map((item) => {
            const lat = Number(item.lat)
            const lon = Number(item.lon)
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
            const parts = item.display_name.split(",").map((s) => s.trim())
            const primary = item.name?.trim() || parts[0] || item.display_name
            const city = parts[1] || parts[2] || ""
            const label =
              city && !primary.toLowerCase().includes(city.toLowerCase())
                ? `${primary}, ${city}`
                : primary
            return {
              id: `nom-${item.place_id}`,
              name: label,
              address: item.display_name,
              latitude: Number(lat.toFixed(6)),
              longitude: Number(lon.toFixed(6)),
            }
          })
          .filter((x): x is GeocodedPlace => Boolean(x))
        setRemoteResults(mapped)
      } catch {
        setRemoteResults([])
      } finally {
        if (!ctrl.signal.aborted) setSearching(false)
      }
    }, 260)

    return () => {
      ctrl.abort()
      window.clearTimeout(timer)
    }
  }, [venue, openSuggestions])

  const filteredPresets = useMemo(() => {
    const q = venue.trim().toLowerCase()
    if (!q) return CURATED_PH_VENUES.slice(0, 6)
    return CURATED_PH_VENUES.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q),
    )
  }, [venue])

  const combinedSuggestions = useMemo(() => {
    const seen = new Set<string>()
    const list: GeocodedPlace[] = []
    for (const item of [...filteredPresets, ...remoteResults]) {
      const key = item.name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      list.push(item)
    }
    return list.slice(0, 7)
  }, [filteredPresets, remoteResults])

  useEffect(() => {
    return () => {
      lookupSeqRef.current += 1
      reverseAbortRef.current?.abort()
    }
  }, [])

  function closePinModal() {
    lookupSeqRef.current += 1
    reverseAbortRef.current?.abort()
    setResolvingAddress(false)
    setMapPickerOpen(false)
  }

  async function moveDraftPinTo(latitude: number, longitude: number) {
    const lat = Number(latitude.toFixed(6))
    const lng = Number(longitude.toFixed(6))
    const requestId = ++lookupSeqRef.current

    reverseAbortRef.current?.abort()
    const ctrl = new AbortController()
    reverseAbortRef.current = ctrl

    setDraftPin((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lng,
    }))
    setResolvingAddress(true)

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&addressdetails=1`
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
      })
      if (requestId !== lookupSeqRef.current) return
      if (!res.ok) throw new Error("Reverse geocoding unavailable")
      const data = (await res.json()) as {
        name?: string
        display_name?: string
        address?: Record<string, string | undefined>
      }
      if (requestId !== lookupSeqRef.current) return
      const resolved = formatReverseAddress(data)
      if (!resolved) {
        setDraftPin((prev) => ({
          ...prev,
          name: "",
          address: "Address unavailable",
        }))
        return
      }
      setDraftPin((prev) => ({
        ...prev,
        name: resolved.name,
        address: resolved.address,
      }))
    } catch {
      if (requestId !== lookupSeqRef.current) return
      setDraftPin((prev) => ({
        ...prev,
        name: "",
        address: "Address unavailable",
      }))
    } finally {
      if (requestId === lookupSeqRef.current) {
        setResolvingAddress(false)
      }
    }
  }

  // Selecting a place opens the pin dialog centered on that result without mutating
  // the saved draft until the user clicks "Confirm location" (Cancel preserves previous venue & pin).
  function handleSelectPlace(place: GeocodedPlace) {
    lookupSeqRef.current += 1
    reverseAbortRef.current?.abort()
    setResolvingAddress(false)
    const nextPin: VenueLocation = {
      name: place.name,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
    }
    setDraftPin(nextPin)
    setOpenSuggestions(false)
    setMapSessionKey((k) => k + 1)
    setMapPickerOpen(true)
  }

  function openPinEditor() {
    lookupSeqRef.current += 1
    reverseAbortRef.current?.abort()
    setResolvingAddress(false)
    const startPin = initialPin
    setDraftPin({
      ...startPin,
      name: venue.trim() || startPin.name,
    })
    setOpenSuggestions(false)
    setMapSessionKey((k) => k + 1)
    setMapPickerOpen(true)
  }

  function formatConfirmedVenueText(name?: string, address?: string): string {
    const cleanName = (name ?? "").trim()
    const cleanAddress = (address ?? "").trim()
    if (cleanName && cleanAddress) {
      if (
        cleanName.toLowerCase() === cleanAddress.toLowerCase() ||
        cleanName.toLowerCase().includes(cleanAddress.toLowerCase())
      ) {
        return cleanName
      }
      if (cleanAddress.toLowerCase().startsWith(cleanName.toLowerCase())) {
        return cleanAddress
      }
      return `${cleanName} — ${cleanAddress}`
    }
    return cleanName || cleanAddress || "Pinned Venue"
  }

  function handleConfirmLocation() {
    lookupSeqRef.current += 1
    reverseAbortRef.current?.abort()
    setResolvingAddress(false)

    const lat = Number(draftPin.latitude.toFixed(6))
    const lng = Number(draftPin.longitude.toFixed(6))
    const rawAddress = (draftPin.address || "").trim()
    const hasResolvedAddress = Boolean(rawAddress) && rawAddress !== "Address unavailable"
    const fallbackCoordLabel = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    const finalName = (draftPin.name || "").trim()
    const venueText = hasResolvedAddress
      ? formatConfirmedVenueText(finalName || rawAddress, rawAddress)
      : finalName || venue.trim() || `Pinned location (${fallbackCoordLabel})`

    const confirmed: VenueLocation = {
      name: venueText,
      address: rawAddress || venueText,
      latitude: lat,
      longitude: lng,
    }
    onChange({
      venue: venueText,
      venueLocation: confirmed,
    })
    setMapPickerOpen(false)
  }

  return (
    <div ref={wrapperRef} className="space-y-2">
      <div className="relative">
        <Input
          value={venue}
          disabled={disabled}
          onFocus={() => !disabled && setOpenSuggestions(true)}
          onChange={(e) => {
            const val = e.target.value
            onChange({
              venue: val,
              venueLocation: venueLocation
                ? { ...venueLocation, name: val }
                : undefined,
            })
            setOpenSuggestions(true)
          }}
          placeholder="Venue name and city"
          maxLength={160}
          className="pr-24"
          {...errorProps}
        />
        {!disabled && (
          <button
            type="button"
            onClick={openPinEditor}
            className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 cursor-pointer items-center gap-1 rounded-md border border-line bg-card px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-elev"
            title="Pin exact venue entrance on map"
          >
            <MapPin className="size-3 text-amber-500" aria-hidden="true" />
            <span>{venueLocation ? "Adjust pin" : "Pin map"}</span>
          </button>
        )}

        {openSuggestions && !disabled && (
          <div
            role="listbox"
            aria-label="Venue suggestions"
            className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-line bg-card p-1.5 shadow-xl"
          >
            <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Suggested Places</span>
              {searching && (
                <span className="inline-flex items-center gap-1 text-[11px] font-normal">
                  <Loader2 className="size-3 animate-spin" />
                  Searching…
                </span>
              )}
            </div>
            {combinedSuggestions.length === 0 ? (
              <div className="px-2.5 py-3 text-xs text-muted-foreground">
                No matching places found. Keep your manual venue text or click{" "}
                <button
                  type="button"
                  onClick={openPinEditor}
                  className="font-semibold text-foreground underline"
                >
                  Pin map
                </button>{" "}
                to place a pin manually.
              </div>
            ) : (
              combinedSuggestions.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  role="option"
                  onClick={() => handleSelectPlace(place)}
                  className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-fg/[0.06]"
                >
                  <MapPin
                    className="mt-0.5 size-4 shrink-0 text-amber-500"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-foreground">
                      {place.name}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {place.address}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <Modal
        open={mapPickerOpen && !disabled}
        onClose={closePinModal}
        title="Confirm venue entrance pin"
      >
        <div className="space-y-3.5 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Navigation className="size-3.5 shrink-0 text-amber-500" aria-hidden="true" />
            <span>
              Tap the map or drag the pin to the exact venue entrance, then confirm.
            </span>
          </div>

          <div className="relative h-64 w-full overflow-hidden rounded-xl border border-line bg-[#141414]">
            {mapPickerOpen && (
              <Map
                key={mapSessionKey}
                theme="dark"
                center={[draftPin.longitude, draftPin.latitude]}
                zoom={15}
                className="size-full"
              >
                <MapTapListener onTap={moveDraftPinTo} />
                <MapControls position="top-right" showZoom />
                <MapMarker
                  longitude={draftPin.longitude}
                  latitude={draftPin.latitude}
                  draggable
                  onDragEnd={(lngLat) => void moveDraftPinTo(lngLat.lat, lngLat.lng)}
                >
                  <MarkerContent>
                    <div className="grid size-8 -translate-y-1 place-items-center rounded-full border-2 border-white bg-[#f48a52] text-[#171717] shadow-lg">
                      <MapPin className="size-4" />
                    </div>
                  </MarkerContent>
                </MapMarker>
              </Map>
            )}
          </div>

          <div className="rounded-lg border border-line bg-fg/[0.02] p-3">
            <div className="font-semibold text-foreground">
              {draftPin.name || (draftPin.address === "Address unavailable" ? "Pinned location" : venue) || "Selected location"}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {resolvingAddress
                ? "Looking up address…"
                : draftPin.address || "Address unavailable"}{" "}
              &middot;{" "}
              <span className="font-mono">
                {draftPin.latitude.toFixed(5)}, {draftPin.longitude.toFixed(5)}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={closePinModal}
            >
              Cancel
            </Button>
            <Button type="button" icon={Check} onClick={handleConfirmLocation}>
              Confirm location
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

