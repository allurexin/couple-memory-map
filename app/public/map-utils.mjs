export function renderableMapPoints(memories = [], draft = null) {
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

  if (!draft) return memoryPoints;

  return [
    ...memoryPoints,
    {
      id: draft.id || "draft",
      kind: "draft",
      title: draft.placeName,
      latitude: Number(draft.latitude),
      longitude: Number(draft.longitude),
      rating: null,
      revisitStatus: "draft",
      memory: null
    }
  ];
}
