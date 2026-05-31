import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterMemories } from "../app/public/filter.mjs";

const memories = [
  {
    id: "1",
    placeName: "火锅店",
    city: "杭州",
    rating: 5,
    revisitStatus: "again",
    createdBy: "user_1",
    notes: "冰粉很好吃",
    foodItems: ["牛肉", "冰粉"]
  },
  {
    id: "2",
    placeName: "面馆",
    city: "上海",
    rating: 3,
    revisitStatus: "normal",
    createdBy: "user_2",
    notes: "葱油香",
    foodItems: ["葱油拌面"]
  }
];

describe("filterMemories", () => {
  it("filters by city, rating, revisit status, creator, and keyword", () => {
    const filtered = filterMemories(memories, {
      city: "杭州",
      minRating: 5,
      revisitStatus: "again",
      creator: "user_1",
      keyword: "冰粉"
    });

    assert.deepEqual(filtered.map((memory) => memory.id), ["1"]);
  });
});
