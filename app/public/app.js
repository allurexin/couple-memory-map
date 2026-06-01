import { filterMemories } from "./filter.mjs";

const app = document.querySelector("#app");
const state = {
  token: localStorage.getItem("memory-map-token"),
  user: JSON.parse(localStorage.getItem("memory-map-user") || "null"),
  space: null,
  memories: [],
  selected: null,
  draft: null,
  filters: { keyword: "", revisitStatus: "all" },
  config: { hasAmapConfig: false, amapKey: "", amapSecurityCode: "" },
  error: ""
};

let amapLoaderPromise = null;

const statusText = {
  again: "想再去",
  normal: "一般",
  avoid: "不推荐"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(state.token ? { authorization: `Bearer ${state.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(body?.message || "请求失败");
  return body;
}

async function loadConfig() {
  try {
    state.config = await api("/api/config");
  } catch {
    state.config = { hasAmapConfig: false, amapKey: "", amapSecurityCode: "" };
  }
}

function loadScriptOnce(id, src) {
  const existing = document.querySelector(`#${id}`);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.AMapLoader) resolve();
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function loadAmap() {
  if (!state.config.hasAmapConfig) return null;
  if (!amapLoaderPromise) {
    window._AMapSecurityConfig = {
      securityJsCode: state.config.amapSecurityCode
    };
    amapLoaderPromise = loadScriptOnce("amap-loader", "https://webapi.amap.com/loader.js")
      .then(() => window.AMapLoader.load({
        key: state.config.amapKey,
        version: "2.0",
        plugins: ["AMap.PlaceSearch", "AMap.Scale"]
      }));
  }
  return amapLoaderPromise;
}

async function searchAmapPlace(placeName) {
  const AMap = await loadAmap();
  if (!AMap || !placeName.trim()) return null;
  return new Promise((resolve) => {
    const placeSearch = new AMap.PlaceSearch({ city: "全国", pageSize: 1 });
    placeSearch.search(placeName.trim(), (status, result) => {
      const poi = status === "complete" ? result?.poiList?.pois?.[0] : null;
      if (!poi?.location) {
        resolve(null);
        return;
      }
      resolve({
        placeName: poi.name || placeName,
        latitude: Number(poi.location.lat),
        longitude: Number(poi.location.lng),
        city: poi.cityname || poi.adname || ""
      });
    });
  });
}

async function mountAmapMap(memories) {
  const root = document.querySelector("#amapRoot");
  if (!root) return;
  try {
    const AMap = await loadAmap();
    if (!AMap || !document.body.contains(root)) return;
    const centerMemory = state.selected || state.draft || memories[0];
    const center = centerMemory ? [Number(centerMemory.longitude), Number(centerMemory.latitude)] : [120.161, 30.266];
    const map = new AMap.Map(root, {
      zoom: centerMemory ? 14 : 11,
      center,
      viewMode: "2D"
    });
    map.addControl(new AMap.Scale());
    memories.forEach((memory) => {
      const marker = new AMap.Marker({
        position: [Number(memory.longitude), Number(memory.latitude)],
        title: memory.placeName
      });
      marker.on("click", () => {
        state.draft = null;
        state.selected = memory;
        renderMap();
      });
      map.add(marker);
    });
    map.on("click", (event) => {
      state.selected = null;
      state.draft = {
        placeName: document.querySelector("#searchPlace")?.value || "手动选择的位置",
        latitude: Number(event.lnglat.lat.toFixed(6)),
        longitude: Number(event.lnglat.lng.toFixed(6)),
        city: ""
      };
      renderMap();
    });
  } catch (error) {
    state.config.hasAmapConfig = false;
    state.error = `高德地图加载失败：${error.message || "请检查 Key 和安全密钥"}`;
    renderMap();
  }
}

function setSession(auth) {
  state.token = auth.token;
  state.user = auth.user;
  localStorage.setItem("memory-map-token", auth.token);
  localStorage.setItem("memory-map-user", JSON.stringify(auth.user));
}

function logout() {
  localStorage.removeItem("memory-map-token");
  localStorage.removeItem("memory-map-user");
  state.token = null;
  state.user = null;
  state.space = null;
  state.memories = [];
  render();
}

function render() {
  if (!state.user) {
    renderAuth("register");
    return;
  }
  if (!state.space) {
    renderSpaceGate();
    return;
  }
  renderMap();
}

function renderAuth(mode) {
  app.innerHTML = `
    <main class="screen auth-shell">
      <section class="panel">
        <h1>情侣美食记忆地图</h1>
        <p>把一起吃过的店、菜和回忆落到地图上。</p>
        <label class="field">邮箱<input id="email" autocomplete="email" /></label>
        <label class="field">密码<input id="password" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" /></label>
        ${mode === "register" ? '<label class="field">昵称<input id="displayName" /></label>' : ""}
        ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
        <div class="actions">
          <button class="primary" id="submitAuth">${mode === "register" ? "注册" : "登录"}</button>
          <button class="secondary" id="switchAuth">${mode === "register" ? "已有账号，去登录" : "没有账号，去注册"}</button>
        </div>
      </section>
    </main>
  `;
  document.querySelector("#switchAuth").addEventListener("click", () => {
    state.error = "";
    renderAuth(mode === "register" ? "login" : "register");
  });
  document.querySelector("#submitAuth").addEventListener("click", async () => {
    state.error = "";
    try {
      const body = {
        email: document.querySelector("#email").value,
        password: document.querySelector("#password").value
      };
      if (mode === "register") body.displayName = document.querySelector("#displayName").value;
      const auth = await api(`/api/auth/${mode}`, { method: "POST", body });
      setSession(auth);
      await loadSpace();
    } catch (error) {
      state.error = error.message;
      renderAuth(mode);
    }
  });
}

async function loadSpace() {
  const result = await api("/api/spaces/me");
  state.space = result.space;
  if (state.space) await loadMemories();
  render();
}

function renderSpaceGate() {
  app.innerHTML = `
    <main class="screen auth-shell">
      <section class="panel">
        <h1>还没有情侣空间</h1>
        <p>创建一个空间，或输入对方给你的绑定码。</p>
        <label class="field">空间名称<input id="spaceName" value="我们的美食地图" /></label>
        <button class="primary" id="createSpace">创建空间</button>
        <label class="field">绑定码<input id="bindingCode" /></label>
        <button class="secondary" id="joinSpace">加入空间</button>
        <button class="ghost" id="logout">退出登录</button>
        ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
      </section>
    </main>
  `;
  document.querySelector("#logout").addEventListener("click", logout);
  document.querySelector("#createSpace").addEventListener("click", async () => {
    state.error = "";
    try {
      const result = await api("/api/spaces", {
        method: "POST",
        body: { name: document.querySelector("#spaceName").value }
      });
      state.space = result.space;
      await loadMemories();
      render();
    } catch (error) {
      state.error = error.message;
      renderSpaceGate();
    }
  });
  document.querySelector("#joinSpace").addEventListener("click", async () => {
    state.error = "";
    try {
      const result = await api("/api/spaces/join", {
        method: "POST",
        body: { bindingCode: document.querySelector("#bindingCode").value.toUpperCase() }
      });
      state.space = result.space;
      await loadMemories();
      render();
    } catch (error) {
      state.error = error.message;
      renderSpaceGate();
    }
  });
}

async function loadMemories() {
  const params = new URLSearchParams();
  if (state.filters.keyword) params.set("keyword", state.filters.keyword);
  if (state.filters.revisitStatus !== "all") params.set("revisitStatus", state.filters.revisitStatus);
  const result = await api(`/api/memories?${params}`);
  state.memories = result.memories;
}

function markerPosition(memory) {
  const left = 12 + Math.abs(Number(memory.longitude) * 997) % 76;
  const top = 20 + Math.abs(Number(memory.latitude) * 991) % 52;
  return `left:${left}%;top:${top}%`;
}

function renderMap() {
  const filtered = filterMemories(state.memories, state.filters);
  const useAmap = state.config.hasAmapConfig;
  app.innerHTML = `
    <main class="map-screen">
      <header class="map-header">
        <div>
          <strong>${escapeHtml(state.space.name)}</strong>
          <span>绑定码 ${escapeHtml(state.space.bindingCode)} · ${escapeHtml(state.user.displayName)}</span>
        </div>
        <button id="logout">退出</button>
      </header>
      <section class="map-canvas" id="mapCanvas">
        ${useAmap ? '<div class="amap-root" id="amapRoot"></div><div class="map-hint">正在使用高德地图。搜索店名或点击地图添加记忆。</div>' : '<div class="map-hint">点击地图任意位置添加记忆；配置高德 Key 后可接入真实地图搜索。</div>'}
        ${useAmap ? "" : state.memories
          .map(
            (memory) => `
              <button class="pin ${memory.revisitStatus}" data-id="${memory.id}" style="${markerPosition(memory)}" title="${escapeHtml(memory.placeName)}">
                <span>${memory.rating}</span>
              </button>
            `
          )
          .join("")}
      </section>
      <aside class="sheet">${renderSheet(filtered)}</aside>
    </main>
  `;

  document.querySelector("#logout").addEventListener("click", logout);
  if (useAmap) {
    mountAmapMap(filtered);
  } else {
    document.querySelector("#mapCanvas").addEventListener("click", (event) => {
      if (event.target.closest(".pin")) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      state.selected = null;
      state.draft = {
        placeName: document.querySelector("#searchPlace")?.value || "手动选择的位置",
        latitude: Number((18 + y * 28).toFixed(6)),
        longitude: Number((98 + x * 34).toFixed(6)),
        city: ""
      };
      renderMap();
    });
  }

  document.querySelectorAll(".pin").forEach((pin) => {
    pin.addEventListener("click", () => {
      state.draft = null;
      state.selected = state.memories.find((memory) => memory.id === pin.dataset.id);
      renderMap();
    });
  });

  bindSheetEvents();
}

function renderSheet(filtered) {
  if (state.draft) return renderMemoryForm(state.draft);
  if (state.selected) return renderMemoryDetail(state.selected);

  return `
    <div class="search-row">
      <input id="searchPlace" aria-label="搜索店名或地点" placeholder="输入店名，点地图放点" />
      <button class="primary" id="useSearch">放点</button>
    </div>
    <div class="sheet-controls">
      <input id="keyword" aria-label="搜索菜品或店名" value="${escapeHtml(state.filters.keyword)}" placeholder="筛选菜品或店名" />
      <select id="revisitStatus">
        <option value="all" ${state.filters.revisitStatus === "all" ? "selected" : ""}>全部</option>
        <option value="again" ${state.filters.revisitStatus === "again" ? "selected" : ""}>想再去</option>
        <option value="normal" ${state.filters.revisitStatus === "normal" ? "selected" : ""}>一般</option>
        <option value="avoid" ${state.filters.revisitStatus === "avoid" ? "selected" : ""}>不推荐</option>
      </select>
    </div>
    ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
    <div class="memory-list">
      ${
        filtered.length
          ? filtered
              .map(
                (memory) => `
                  <button class="memory-row" data-id="${memory.id}">
                    <strong>${escapeHtml(memory.placeName)}</strong>
                    <span>${escapeHtml(memory.foodItems.join("、") || "还没有记录菜品")}</span>
                    <span>${memory.rating} 分 · ${statusText[memory.revisitStatus]} · ${escapeHtml(memory.city || "未知城市")}</span>
                  </button>
                `
              )
              .join("")
          : "<p class='muted'>还没有美食记忆。输入店名后点地图，先记录第一家店。</p>"
      }
    </div>
  `;
}

function renderMemoryForm(draft) {
  return `
    <h2>添加美食记忆</h2>
    <label class="field">店名<input id="placeName" value="${escapeHtml(draft.placeName)}" /></label>
    <label class="field">城市<input id="city" value="${escapeHtml(draft.city || "")}" /></label>
    <label class="field">菜品<input id="foodItems" placeholder="牛肉, 冰粉" /></label>
    <label class="field">日期<input id="memoryDate" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
    <label class="field">评分<select id="rating">${[5, 4, 3, 2, 1].map((rating) => `<option value="${rating}">${rating} 分</option>`).join("")}</select></label>
    <label class="field">状态<select id="revisit"><option value="again">想再去</option><option value="normal">一般</option><option value="avoid">不推荐</option></select></label>
    <label class="field">备注<textarea id="notes"></textarea></label>
    <label class="field">照片<input id="photo" type="file" accept="image/*" /></label>
    ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
    <div class="actions"><button class="primary" id="saveMemory">保存记忆</button><button class="secondary" id="cancelDraft">取消</button></div>
  `;
}

function renderMemoryDetail(memory) {
  return `
    <section class="detail">
      <h2>${escapeHtml(memory.placeName)}</h2>
      <p class="muted">${memory.rating} 分 · ${statusText[memory.revisitStatus]} · ${escapeHtml(memory.memoryDate)}</p>
      <p>${escapeHtml(memory.foodItems.join("、") || "还没有记录菜品")}</p>
      <p>${escapeHtml(memory.notes || "没有备注")}</p>
      <div class="photo-strip">${(memory.photos || []).map((photo) => `<img src="${photo.thumbnailUrl}" alt="${escapeHtml(memory.placeName)} 的照片" />`).join("")}</div>
      ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
      <div class="actions">
        <button class="primary" id="editSelected">编辑</button>
        <button class="danger" id="deleteSelected">删除</button>
        <button class="secondary" id="closeSelected">返回列表</button>
      </div>
    </section>
  `;
}

function bindSheetEvents() {
  document.querySelector("#useSearch")?.addEventListener("click", async () => {
    const placeName = document.querySelector("#searchPlace").value || "手动选择的位置";
    const amapPlace = state.config.hasAmapConfig ? await searchAmapPlace(placeName) : null;
    state.selected = null;
    state.draft = amapPlace || { placeName, latitude: 30.266, longitude: 120.161, city: "" };
    renderMap();
  });

  document.querySelector("#keyword")?.addEventListener("input", (event) => {
    state.filters.keyword = event.target.value;
    renderMap();
  });

  document.querySelector("#revisitStatus")?.addEventListener("change", (event) => {
    state.filters.revisitStatus = event.target.value;
    renderMap();
  });

  document.querySelectorAll(".memory-row").forEach((row) => {
    row.addEventListener("click", () => {
      state.selected = state.memories.find((memory) => memory.id === row.dataset.id);
      state.draft = null;
      renderMap();
    });
  });

  document.querySelector("#cancelDraft")?.addEventListener("click", () => {
    state.draft = null;
    state.error = "";
    renderMap();
  });

  document.querySelector("#saveMemory")?.addEventListener("click", saveMemory);
  document.querySelector("#closeSelected")?.addEventListener("click", () => {
    state.selected = null;
    state.error = "";
    renderMap();
  });
  document.querySelector("#editSelected")?.addEventListener("click", () => {
    const memory = state.selected;
    state.draft = {
      id: memory.id,
      placeName: memory.placeName,
      latitude: memory.latitude,
      longitude: memory.longitude,
      city: memory.city || "",
      existing: memory
    };
    state.selected = null;
    renderMap();
    document.querySelector("#foodItems").value = memory.foodItems.join(", ");
    document.querySelector("#memoryDate").value = memory.memoryDate;
    document.querySelector("#rating").value = String(memory.rating);
    document.querySelector("#revisit").value = memory.revisitStatus;
    document.querySelector("#notes").value = memory.notes || "";
  });
  document.querySelector("#deleteSelected")?.addEventListener("click", deleteSelected);
}

function readPhotoDataUrl(file) {
  if (!file) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("照片读取失败"));
    reader.readAsDataURL(file);
  });
}

async function saveMemory() {
  state.error = "";
  try {
    const photoDataUrl = await readPhotoDataUrl(document.querySelector("#photo").files[0]);
    const body = {
      placeName: document.querySelector("#placeName").value,
      latitude: state.draft.latitude,
      longitude: state.draft.longitude,
      city: document.querySelector("#city").value,
      memoryDate: document.querySelector("#memoryDate").value,
      rating: Number(document.querySelector("#rating").value),
      revisitStatus: document.querySelector("#revisit").value,
      notes: document.querySelector("#notes").value,
      foodItems: document.querySelector("#foodItems").value.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
      photoDataUrl
    };
    const path = state.draft.id ? `/api/memories/${state.draft.id}` : "/api/memories";
    const method = state.draft.id ? "PUT" : "POST";
    await api(path, { method, body });
    state.draft = null;
    await loadMemories();
    renderMap();
  } catch (error) {
    state.error = error.message;
    renderMap();
  }
}

async function deleteSelected() {
  if (!state.selected) return;
  state.error = "";
  try {
    await api(`/api/memories/${state.selected.id}`, { method: "DELETE" });
    state.selected = null;
    await loadMemories();
    renderMap();
  } catch (error) {
    state.error = error.message;
    renderMap();
  }
}

window.addEventListener("focus", () => {
  if (state.token && state.space) loadMemories().then(renderMap).catch(() => undefined);
});

await loadConfig();

if (state.token) {
  loadSpace().catch(() => {
    logout();
  });
} else {
  render();
}
