export function filterMemories(memories, filters = {}) {
  const keyword = (filters.keyword || "").trim().toLowerCase();
  const revisitStatus = filters.revisitStatus || "all";
  const minRating = Number(filters.minRating || 0);

  return memories.filter((memory) => {
    if (filters.city && memory.city !== filters.city) return false;
    if (minRating && Number(memory.rating) < minRating) return false;
    if (revisitStatus !== "all" && memory.revisitStatus !== revisitStatus) return false;
    if (filters.creator && memory.createdBy !== filters.creator) return false;
    if (keyword) {
      const haystack = [memory.placeName, memory.notes || "", ...(memory.foodItems || [])].join(" ").toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}
