export type VenueLocation = {
  latitude: number
  longitude: number
  name?: string
  address?: string
}

export function isVenueLocation(value: VenueLocation | null | undefined): value is VenueLocation {
  return Boolean(
    value &&
      Number.isFinite(value.latitude) &&
      Math.abs(value.latitude) <= 85.051129 &&
      Number.isFinite(value.longitude) &&
      Math.abs(value.longitude) <= 180,
  )
}

export function venueMapUrl({ latitude, longitude }: VenueLocation) {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`
}
