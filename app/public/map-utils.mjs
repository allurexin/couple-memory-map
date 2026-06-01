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

function cityName(memory) {
  return memory.city || memory.district || "";
}

function routeDate(memory) {
  return `${memory.memoryDate || ""}${memory.createdAt || ""}`;
}

export function homeMapView(memories = []) {
  if (!memories.length) return { city: "", memories: [], route: [] };

  const counts = new Map();
  memories.forEach((memory) => {
    const city = cityName(memory);
    if (!city) return;
    counts.set(city, (counts.get(city) || 0) + 1);
  });

  let city = "";
  let count = 0;
  for (const [candidate, candidateCount] of counts) {
    if (candidateCount > count) {
      city = candidate;
      count = candidateCount;
    }
  }

  const homeMemories = city ? memories.filter((memory) => cityName(memory) === city) : memories;
  const route = [...homeMemories].sort((a, b) => routeDate(a).localeCompare(routeDate(b)));
  return { city, memories: homeMemories, route };
}

export function mapPresentation(hasActivePlace = false) {
  if (hasActivePlace) {
    return {
      mapStyle: "amap://styles/normal",
      features: ["bg", "road", "building", "point"]
    };
  }

  return {
    mapStyle: "amap://styles/whitesmoke",
    features: ["bg"]
  };
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
