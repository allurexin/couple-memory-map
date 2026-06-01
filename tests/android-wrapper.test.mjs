import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

describe("android apk wrapper", () => {
  it("wraps the production Render URL in an Android WebView", async () => {
    const activity = await readFile("android/app/src/main/java/com/allurexin/couplememorymap/MainActivity.java", "utf8");
    assert.match(activity, /https:\/\/couple-memory-map\.onrender\.com/);
    assert.match(activity, /setJavaScriptEnabled\(true\)/);
    assert.match(activity, /setDomStorageEnabled\(true\)/);
    assert.match(activity, /onShowFileChooser/);
  });

  it("declares Android internet permissions and launcher activity", async () => {
    const manifest = await readFile("android/app/src/main/AndroidManifest.xml", "utf8");
    assert.match(manifest, /android\.permission\.INTERNET/);
    assert.match(manifest, /android\.intent\.category\.LAUNCHER/);
    assert.match(manifest, /com\.allurexin\.couplememorymap|\.MainActivity/);
  });

  it("uploads a debug APK artifact from GitHub Actions", async () => {
    const workflow = await readFile(".github/workflows/android-apk.yml", "utf8");
    assert.match(workflow, /workflow_dispatch/);
    assert.match(workflow, /gradle -p android assembleDebug/);
    assert.match(workflow, /android\/app\/build\/outputs\/apk\/debug\/app-debug\.apk/);
  });
});
