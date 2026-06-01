import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  homeMapView,
  mapPresentation,
  normalizePlaceSearchResults,
  renderableMapPoints
} from "../app/public/map-utils.mjs";

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

  it("can show a live searched shop before opening the add-memory form", () => {
    const points = renderableMapPoints([], null, {
      placeName: "外婆家(杭州西湖银泰店)",
      latitude: 30.255,
      longitude: 120.165
    });

    assert.equal(points.length, 1);
    assert.equal(points[0].kind, "searched");
    assert.equal(points[0].title, "外婆家(杭州西湖银泰店)");
  });
});

describe("normalizePlaceSearchResults", () => {
  it("keeps multiple candidate places with names, addresses, and coordinates", () => {
    const results = normalizePlaceSearchResults([
      {
        id: "B1",
        name: "外婆家(西湖银泰店)",
        address: "延安路98号",
        cityname: "杭州市",
        adname: "上城区",
        location: { lat: 30.255, lng: 120.165 }
      },
      {
        id: "B2",
        name: "外婆家(湖滨店)",
        address: [],
        cityname: ["杭州市"],
        adname: ["西湖区"],
        location: { lat: 30.259, lng: 120.16 }
      }
    ], "外婆家");

    assert.deepEqual(results, [
      {
        id: "B1",
        placeName: "外婆家(西湖银泰店)",
        address: "延安路98号",
        city: "杭州市",
        district: "上城区",
        latitude: 30.255,
        longitude: 120.165
      },
      {
        id: "B2",
        placeName: "外婆家(湖滨店)",
        address: "",
        city: "杭州市",
        district: "西湖区",
        latitude: 30.259,
        longitude: 120.16
      }
    ]);
  });
});

describe("homeMapView", () => {
  it("uses the most frequent city as the default home map", () => {
    const memories = [
      { id: "1", city: "合肥市", memoryDate: "2026-05-03", createdAt: "2026-05-03T00:00:00.000Z", latitude: 31.86, longitude: 117.28 },
      { id: "2", city: "杭州市", memoryDate: "2026-05-01", createdAt: "2026-05-01T00:00:00.000Z", latitude: 30.26, longitude: 120.16 },
      { id: "3", city: "合肥市", memoryDate: "2026-05-02", createdAt: "2026-05-02T00:00:00.000Z", latitude: 31.84, longitude: 117.26 }
    ];

    const view = homeMapView(memories);

    assert.equal(view.city, "合肥市");
    assert.deepEqual(view.memories.map((memory) => memory.id), ["1", "3"]);
    assert.deepEqual(view.route.map((memory) => memory.id), ["3", "1"]);
  });
});

describe("mapPresentation", () => {
  it("uses simplified boundary-like map features on the home map and detailed features while choosing a shop", () => {
    assert.deepEqual(mapPresentation(false), {
      mapStyle: "amap://styles/whitesmoke",
      features: ["bg"]
    });
    assert.deepEqual(mapPresentation(true), {
      mapStyle: "amap://styles/normal",
      features: ["bg", "road", "building", "point"]
    });
  });
});
