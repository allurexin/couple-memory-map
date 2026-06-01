function mapPointFromPlace(place, kind) {
  return {
    id: place.id || kind,
    kind,
    title: place.placeName,
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
    rating: null,
    revisitStatus: kind,
    memory: null
  };
}

function firstText(value) {
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
}

export function normalizePlaceSearchResults(pois = [], fallbackQuery = "") {
  return pois
    .filter((poi) => poi?.location)
    .map((poi, index) => ({
      id: poi.id || `place_${index}`,
      placeName: firstText(poi.name) || fallbackQuery,
      address: firstText(poi.address),
      city: firstText(poi.cityname),
      district: firstText(poi.adname),
      latitude: Number(poi.location.lat),
      longitude: Number(poi.location.lng)
    }))
    .filter((place) => place.placeName && Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
}

export function renderableMapPoints(memories = [], draft = null, searchedPlace = null) {
  const memoryPoints = memories.map((memory) => ({
    id: memory.id,
    kind: "memory",
    title: memory.placeName,
    latitude: Number(memory.latitude),
    longitude: Number(memory.longitude),
    rating: memory.rating,
    revisitStatus: memory.revisitStatus,
    memory
  }));

  if (draft) return [...memoryPoints, mapPointFromPlace(draft, "draft")];

  if (searchedPlace) return [...memoryPoints, mapPointFromPlace(searchedPlace, "searched")];

  return memoryPoints;
}
