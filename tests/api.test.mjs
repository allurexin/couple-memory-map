import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../app/server.mjs";

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { status: response.status, body };
}

async function register(baseUrl, email, displayName) {
  const result = await request(baseUrl, "/api/auth/register", {
    method: "POST",
    body: { email, password: "password123", displayName }
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.user.email, email);
  assert.equal(result.body.user.displayName, displayName);
  assert.ok(result.body.token);
  return result.body;
}

describe("couple memory map api", () => {
  let dataDir;
  let server;
  let baseUrl;

  before(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "memory-map-test-"));
    server = createAppServer({ dataDir, jwtSecret: "test-secret" });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  });

  it("registers two users, binds them to one space, and rejects a third member", async () => {
    const owner = await register(baseUrl, "owner@example.com", "Owner");
    const partner = await register(baseUrl, "partner@example.com", "Partner");
    const third = await register(baseUrl, "third@example.com", "Third");

    const created = await request(baseUrl, "/api/spaces", {
      method: "POST",
      token: owner.token,
      body: { name: "我们的美食地图" }
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.space.memberIds.length, 1);
    assert.match(created.body.space.bindingCode, /^[A-Z0-9]{8}$/);

    const joined = await request(baseUrl, "/api/spaces/join", {
      method: "POST",
      token: partner.token,
      body: { bindingCode: created.body.space.bindingCode }
    });

    assert.equal(joined.status, 200);
    assert.equal(joined.body.space.memberIds.length, 2);

    const rejected = await request(baseUrl, "/api/spaces/join", {
      method: "POST",
      token: third.token,
      body: { bindingCode: created.body.space.bindingCode }
    });

    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.message, "这个情侣空间已满");
  });

  it("syncs memories between partners and blocks other spaces", async () => {
    const owner = await register(baseUrl, "sync-owner@example.com", "Sync Owner");
    const partner = await register(baseUrl, "sync-partner@example.com", "Sync Partner");
    const outsider = await register(baseUrl, "outsider@example.com", "Outsider");

    const space = await request(baseUrl, "/api/spaces", {
      method: "POST",
      token: owner.token,
      body: { name: "同步空间" }
    });
    await request(baseUrl, "/api/spaces/join", {
      method: "POST",
      token: partner.token,
      body: { bindingCode: space.body.space.bindingCode }
    });
    await request(baseUrl, "/api/spaces", {
      method: "POST",
      token: outsider.token,
      body: { name: "别人的空间" }
    });

    const created = await request(baseUrl, "/api/memories", {
      method: "POST",
      token: owner.token,
      body: {
        placeName: "武林夜市",
        latitude: 30.266,
        longitude: 120.161,
        city: "杭州",
        district: "上城区",
        address: "延安路98号",
        memoryDate: "2026-05-31",
        rating: 5,
        revisitStatus: "again",
        notes: "冰粉很好吃",
        foodItems: ["冰粉", "烤苕皮"],
        photoDataUrl: "data:image/png;base64,aGVsbG8="
      }
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.memory.foodItems.length, 2);
    assert.equal(created.body.memory.photos.length, 1);
    assert.equal(created.body.memory.district, "上城区");
    assert.equal(created.body.memory.address, "延安路98号");

    const partnerList = await request(baseUrl, "/api/memories?keyword=冰粉&revisitStatus=again", {
      token: partner.token
    });

    assert.equal(partnerList.status, 200);
    assert.equal(partnerList.body.memories.length, 1);
    assert.equal(partnerList.body.memories[0].placeName, "武林夜市");

    const updated = await request(baseUrl, `/api/memories/${created.body.memory.id}`, {
      method: "PUT",
      token: partner.token,
      body: { notes: "下次还要点冰粉", rating: 4 }
    });

    assert.equal(updated.status, 200);
    assert.equal(updated.body.memory.notes, "下次还要点冰粉");
    assert.equal(updated.body.memory.rating, 4);

    const forbidden = await request(baseUrl, `/api/memories/${created.body.memory.id}`, {
      method: "PUT",
      token: outsider.token,
      body: { notes: "越权编辑" }
    });

    assert.equal(forbidden.status, 404);
  });

  it("exposes public map config from an ignored local config file", async () => {
    const configPath = join(dataDir, "config.local.json");
    await writeFile(configPath, JSON.stringify({
      amapKey: "test-amap-key",
      amapSecurityCode: "test-security-code"
    }), "utf8");

    const configuredServer = createAppServer({
      dataDir: join(dataDir, "configured"),
      jwtSecret: "test-secret",
      configPath
    });
    await new Promise((resolve) => configuredServer.listen(0, "127.0.0.1", resolve));
    const configuredBaseUrl = `http://127.0.0.1:${configuredServer.address().port}`;

    try {
      const result = await request(configuredBaseUrl, "/api/config");
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, {
        hasAmapConfig: true,
        amapKey: "test-amap-key",
        amapSecurityCode: "test-security-code"
      });
    } finally {
      await new Promise((resolve) => configuredServer.close(resolve));
    }
  });
});
