import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

describe("production deployment", () => {
  it("defines standard start and test commands", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8"));
    assert.equal(manifest.scripts.start, "node app/server.mjs");
    assert.equal(manifest.scripts.test, "node --test tests/*.test.mjs");
    assert.match(manifest.engines.node, />=/);
  });

  it("can run as a container for HTTPS hosting platforms", async () => {
    const dockerfile = await readFile("Dockerfile", "utf8");
    assert.match(dockerfile, /EXPOSE 5173/);
    assert.match(dockerfile, /HOST=0\.0\.0\.0/);
    assert.match(dockerfile, /CMD \["npm", "start"\]/);
  });

  it("server supports external host binding in production", async () => {
    const server = await readFile("app/server.mjs", "utf8");
    assert.match(server, /process\.env\.HOST/);
    assert.match(server, /server\.listen\(port, host/);
  });
});
