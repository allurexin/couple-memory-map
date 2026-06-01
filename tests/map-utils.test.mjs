import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderableMapPoints } from "../app/public/map-utils.mjs";

describe("renderableMapPoints", () => {
  it("includes the searched draft shop as a visible map point", () => {
    const points = renderableMapPoints([
      {
        id: "memory_1",
        placeName: "武林夜市",
        latitude: 30.266,
        longitude: 120.161,
        rating: 5,
        revisitStatus: "again"
      }
    ], {
      placeName: "外婆家(杭州西湖银泰店)",
      latitude: 30.255,
      longitude: 120.165
    });

    assert.equal(points.length, 2);
    assert.deepEqual(points[1], {
      id: "draft",
      kind: "draft",
      title: "外婆家(杭州西湖银泰店)",
      latitude: 30.255,
      longitude: 120.165,
      rating: null,
      revisitStatus: "draft",
      memory: null
    });
  });
});
