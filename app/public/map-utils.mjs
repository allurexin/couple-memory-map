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
