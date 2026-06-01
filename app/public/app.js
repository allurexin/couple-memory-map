import { filterMemories } from "./filter.mjs";
import {
  homeMapView,
  mapPresentation,
  normalizePlaceSearchResults,
  outlineMapTarget,
  provinceStats,
  provinceNameFromAdcode,
  renderableMapPoints
} from "./map-utils.mjs";

const app = document.querySelector("#app");
const state = {
  token: localStorage.getItem("memory-map-token"),
  user: JSON.parse(localStorage.getItem("memory-map-user") || "null"),
  space: null,
  memories: [],
  selected: null,
  draft: null,
  searchedPlace: null,
  searchResults: [],
  searchQuery: "",
  isSearchingPlace: false,
  outlineLevel: "city",
  outlineContext: {},
  filters: { keyword: "", revisitStatus: "all" },
  config: { hasAmapConfig: false, amapKey: "", amapSecurityCode: "" },
  error: ""
};

let amapLoaderPromise = null;
let placeSearchRequest = 0;
const boundaryCache = new Map();

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
        plugins: ["AMap.PlaceSearch", "AMap.Scale", "AMap.DistrictLayer", "AMap.DistrictSearch"]
      }));
  }
  return amapLoaderPromise;
}

async function searchAmapPlaces(placeName) {
  const AMap = await loadAmap();
  if (!AMap || !placeName.trim()) return [];
  return new Promise((resolve) => {
    const placeSearch = new AMap.PlaceSearch({ city: "全国", pageSize: 8 });
    placeSearch.search(placeName.trim(), (status, result) => {
      const pois = status === "complete" ? result?.poiList?.pois || [] : [];
      resolve(normalizePlaceSearchResults(pois, placeName));
    });
  });
}

function createAmapMarkerContent(point) {
  if (point.kind === "draft" || point.kind === "searched") {
    return `<div class="amap-draft-marker" title="${escapeHtml(point.title)}"><span>定位</span></div>`;
  }
  return `<div class="amap-memory-marker ${point.revisitStatus}" title="${escapeHtml(point.title)}"><span>${point.rating}</span></div>`;
}

function placeLabel(place) {
  return [place.city, place.district, place.address].filter(Boolean).join(" · ");
}

function sortedRoute(memories) {
  return [...memories].sort((a, b) => `${a.memoryDate || ""}${a.createdAt || ""}`.localeCompare(`${b.memoryDate || ""}${b.createdAt || ""}`));
}

function parseBoundary(boundary) {
  if (Array.isArray(boundary)) {
    return boundary
      .map((point) => {
        if (Array.isArray(point)) return point.map(Number);
        if (typeof point?.getLng === "function" && typeof point?.getLat === "function") return [Number(point.getLng()), Number(point.getLat())];
        if ("lng" in point && "lat" in point) return [Number(point.lng), Number(point.lat)];
        return [Number(point[0]), Number(point[1])];
      })
      .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  }
  return boundary
    .toString()
    .split(";")
    .map((point) => point.split(",").map(Number))
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
}

function outlineBounds(polygons) {
  const points = polygons.flat();
  if (!points.length) return null;
  return points.reduce((bounds, [lng, lat]) => ({
    minLng: Math.min(bounds.minLng, lng),
    maxLng: Math.max(bounds.maxLng, lng),
    minLat: Math.min(bounds.minLat, lat),
    maxLat: Math.max(bounds.maxLat, lat)
  }), {
    minLng: Infinity,
    maxLng: -Infinity,
    minLat: Infinity,
    maxLat: -Infinity
  });
}

function createProjector(bounds) {
  const width = 1000;
  const height = 700;
  const padding = 54;
  const lngSpan = bounds.maxLng - bounds.minLng || 1;
  const latSpan = bounds.maxLat - bounds.minLat || 1;
  const scale = Math.min((width - padding * 2) / lngSpan, (height - padding * 2) / latSpan);
  const mapWidth = lngSpan * scale;
  const mapHeight = latSpan * scale;
  const offsetX = (width - mapWidth) / 2;
  const offsetY = (height - mapHeight) / 2;

  return ([lng, lat]) => [
    offsetX + (lng - bounds.minLng) * scale,
    offsetY + (bounds.maxLat - lat) * scale
  ];
}

function pathFromPoints(points, project) {
  if (!points.length) return "";
  return points
    .map((point, index) => {
      const [x, y] = project(point);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function memoryPoint(memory, project) {
  const [x, y] = project([Number(memory.longitude), Number(memory.latitude)]);
  return { x, y };
}

function renderOutlineSvg(boundary, memories, route, target) {
  const polygons = boundary.boundaries.map(parseBoundary).filter((points) => points.length > 2);
  const bounds = outlineBounds(polygons);
  if (!bounds) return "<div class=\"outline-empty\">暂时没有拿到这个区域的轮廓。</div>";
  const project = createProjector(bounds);
  const routePoints = route
    .filter((memory) => Number.isFinite(Number(memory.longitude)) && Number.isFinite(Number(memory.latitude)))
    .map((memory) => [Number(memory.longitude), Number(memory.latitude)]);
  const routePath = pathFromPoints(routePoints, project);

  const markerHtml = memories.map((memory, index) => {
    const point = memoryPoint(memory, project);
    return `
      <button class="outline-point-wrap" data-id="${escapeHtml(memory.id)}" style="left:${point.x / 10}%;top:${point.y / 7}%">
        <span class="outline-point ${memory.revisitStatus}">${escapeHtml(memory.rating)}</span>
        <i>${index + 1}</i>
        <small>${escapeHtml(memory.placeName)}</small>
      </button>
    `;
  }).join("");

  return `
    <div class="outline-viewport">
      <svg class="outline-svg" viewBox="0 0 1000 700" role="img" aria-label="${escapeHtml(target.label)}足迹地图">
        <defs>
          <linearGradient id="outlineFill" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stop-color="#e9f7ef" />
            <stop offset="100%" stop-color="#dbeafe" />
          </linearGradient>
        </defs>
        <g class="outline-region">
          ${polygons.map((polygon) => `<path d="${pathFromPoints(polygon, project)} Z" />`).join("")}
        </g>
        ${routePath ? `<path class="outline-route" d="${routePath}" />` : ""}
      </svg>
      <div class="outline-points">${markerHtml}</div>
    </div>
  `;
}

function outlineControls(homeView) {
  const provinceName = state.outlineContext.provinceName || provinceNameFromAdcode(state.outlineContext.cityAdcode || state.outlineContext.adcode);
  const buttons = [
    { level: "country", label: "中国" },
    ...(provinceName ? [{ level: "province", label: provinceName }] : []),
    ...(homeView.city ? [{ level: "city", label: homeView.city }] : [])
  ];
  return buttons.map((item, index) => `
    <button class="${state.outlineLevel === item.level ? "active" : ""}" data-outline-level="${item.level}">
      <span>${index + 1}</span>
      ${escapeHtml(item.label)}
    </button>
  `).join("");
}

function updateOutlineContext(target, district) {
  if (!district) return;
  if (target.level === "city") {
    state.outlineContext = {
      ...state.outlineContext,
      cityName: district.name || target.label,
      cityAdcode: district.adcode || state.outlineContext.cityAdcode,
      provinceName: provinceNameFromAdcode(district.adcode)
    };
  }
  if (target.level === "province") {
    state.outlineContext = {
      ...state.outlineContext,
      provinceName: district.name || target.label,
      adcode: district.adcode || state.outlineContext.adcode
    };
  }
}

async function searchDistrictBoundary(target) {
  const key = `${target.level}:${target.searchName}`;
  if (boundaryCache.has(key)) return boundaryCache.get(key);
  const AMap = await loadAmap();
  if (!AMap?.DistrictSearch) return null;

  const boundary = await new Promise((resolve) => {
    const search = new AMap.DistrictSearch({
      extensions: "all",
      level: target.level,
      subdistrict: target.level === "city" ? 0 : 1
    });
    search.search(target.searchName, (status, result) => {
      const district = status === "complete" ? result?.districtList?.[0] : null;
      if (!district?.boundaries?.length) {
        resolve(null);
        return;
      }
      resolve({
        name: district.name,
        adcode: district.adcode,
        boundaries: district.boundaries,
        children: district.districtList || []
      });
    });
  });
  if (boundary) boundaryCache.set(key, boundary);
  return boundary;
}

function provinceInfoCards(memories, boundary, target) {
  const stats = provinceStats(memories);
  const statsByProvince = new Map(stats.map((item) => [item.province, item]));
  const children = boundary?.children || [];

  if (target.level === "country") {
    const cards = children.map((child) => {
      const stat = statsByProvince.get(child.name);
      return { name: child.name, adcode: child.adcode, count: stat?.count || 0, latest: stat?.latestPlace || stat?.latestCity || "还没有足迹" };
    }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return renderOutlineCards(cards, "province");
  }

  if (target.level === "province") {
    const cards = children.map((child) => {
      const cityMemories = memories.filter((memory) => (memory.city || "").includes(child.name.replace(/市|地区|自治州/g, "")));
      return { name: child.name, adcode: child.adcode, count: cityMemories.length, latest: cityMemories[0]?.placeName || "点击查看城市轮廓" };
    }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return renderOutlineCards(cards, "city");
  }

  return "";
}

function renderOutlineCards(cards, nextLevel) {
  if (!cards.length) return "";
  return `
    <div class="outline-drill-panel">
      <strong>${nextLevel === "province" ? "省份足迹" : "城市下钻"}</strong>
      <div>
        ${cards.slice(0, 12).map((card) => `
          <button class="${card.count ? "has-visits" : ""}" data-drill-level="${nextLevel}" data-drill-name="${escapeHtml(card.name)}" data-drill-adcode="${escapeHtml(card.adcode || "")}">
            <span>${escapeHtml(card.name)}</span>
            <small>${card.count ? `${card.count} 次 · ${escapeHtml(card.latest)}` : escapeHtml(card.latest)}</small>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

async function mountOutlineMap(filtered, homeView) {
  const root = document.querySelector("#outlineMap");
  if (!root) return;
  const target = outlineMapTarget(homeView, state.outlineLevel, state.outlineContext);
  const memories = target.level === "city" ? homeView.memories : filtered;
  const route = target.level === "city" ? homeView.route : sortedRoute(filtered);

  root.innerHTML = `
    <div class="outline-stage loading">
      <div class="outline-topbar">
        <div>
          <strong>${escapeHtml(target.label)}</strong>
          <span>${target.level === "city" ? "常去城市" : "足迹层级"}</span>
        </div>
        <nav>${outlineControls(homeView)}</nav>
      </div>
      <div class="outline-loading">正在勾勒地图轮廓...</div>
    </div>
  `;

  try {
    const boundary = await searchDistrictBoundary(target);
    if (!document.body.contains(root)) return;
    if (boundary) updateOutlineContext(target, boundary);
    root.innerHTML = `
      <div class="outline-stage">
        <div class="outline-topbar">
          <div>
            <strong>${escapeHtml(boundary?.name || target.label)}</strong>
            <span>${memories.length} 个打卡点 · ${route.length > 1 ? "已连接美食路径" : "等待更多足迹"}</span>
          </div>
          <nav>${outlineControls(homeView)}</nav>
        </div>
        ${boundary ? renderOutlineSvg(boundary, memories, route, target) : "<div class=\"outline-empty\">这个区域暂时没有边界数据。</div>"}
        ${boundary ? provinceInfoCards(filtered, boundary, target) : ""}
      </div>
    `;
    bindOutlineEvents();
  } catch (error) {
    root.innerHTML = `<div class="outline-empty">地图轮廓加载失败：${escapeHtml(error.message || "请稍后重试")}</div>`;
  }
}

function bindOutlineEvents() {
  document.querySelectorAll("[data-outline-level]").forEach((button) => {
    button.addEventListener("click", () => {
      state.outlineLevel = button.dataset.outlineLevel;
      state.selected = null;
      state.draft = null;
      state.searchedPlace = null;
      renderMap();
    });
  });
  document.querySelectorAll(".outline-point-wrap").forEach((button) => {
    button.addEventListener("click", () => {
      state.selected = state.memories.find((memory) => memory.id === button.dataset.id);
      state.draft = null;
      state.searchedPlace = null;
      renderMap();
    });
  });
  document.querySelectorAll("[data-drill-level]").forEach((button) => {
    button.addEventListener("click", () => {
      state.outlineLevel = button.dataset.drillLevel;
      if (state.outlineLevel === "province") {
        state.outlineContext.provinceName = button.dataset.drillName;
        state.outlineContext.adcode = button.dataset.drillAdcode;
      }
      if (state.outlineLevel === "city") {
        state.outlineContext.cityName = button.dataset.drillName;
        state.outlineContext.cityAdcode = button.dataset.drillAdcode;
        state.outlineContext.provinceName = provinceNameFromAdcode(button.dataset.drillAdcode) || state.outlineContext.provinceName;
      }
      state.selected = null;
      state.draft = null;
      state.searchedPlace = null;
      renderMap();
    });
  });
}

function addDistrictBoundaryLayer(AMap, map, memories) {
  if (!AMap.DistrictLayer || !memories.length) return;
  if (!memories.some((memory) => Number.isFinite(Number(memory.longitude)) && Number.isFinite(Number(memory.latitude)))) return;

  const layer = new AMap.DistrictLayer.Country({
    zIndex: 2,
    SOC: "CHN",
    depth: 2,
    styles: {
      fill: "rgba(255, 255, 255, 0.06)",
      "nation-stroke": "rgba(23, 105, 224, 0.58)",
      "province-stroke": "rgba(23, 105, 224, 0.42)",
      "city-stroke": "rgba(23, 105, 224, 0.5)"
    }
  });
  map.add(layer);
}

async function mountAmapMap(memories, route = [], hasActivePlace = false) {
  const root = document.querySelector("#amapRoot");
  if (!root) return;
  try {
    const AMap = await loadAmap();
    if (!AMap || !document.body.contains(root)) return;
    const centerMemory = state.selected || state.draft || state.searchedPlace || memories[0];
    const center = centerMemory ? [Number(centerMemory.longitude), Number(centerMemory.latitude)] : [120.161, 30.266];
    const points = renderableMapPoints(memories, state.draft, state.searchedPlace);
    const shouldFitHome = !state.selected && !state.draft && !state.searchedPlace;
    const presentation = mapPresentation(hasActivePlace);
    const map = new AMap.Map(root, {
      zoom: centerMemory ? 14 : 11,
      center,
      mapStyle: presentation.mapStyle,
      features: presentation.features,
      viewMode: "2D"
    });
    map.setFeatures(presentation.features);
    map.addControl(new AMap.Scale());
    if (!hasActivePlace) addDistrictBoundaryLayer(AMap, map, memories);
    const markers = [];
    points.forEach((point) => {
      const marker = new AMap.Marker({
        position: [point.longitude, point.latitude],
        title: point.title,
        content: createAmapMarkerContent(point),
        offset: new AMap.Pixel(-16, -34)
      });
      marker.on("click", () => {
        if (point.kind === "searched") {
          state.draft = state.searchedPlace;
          state.searchedPlace = null;
          state.error = "";
          renderMap();
          return;
        }
        if (point.kind === "draft") return;
        state.draft = null;
        state.selected = point.memory;
        renderMap();
      });
      map.add(marker);
      markers.push(marker);
    });
    if (route.length > 1) {
      const path = route.map((memory) => [Number(memory.longitude), Number(memory.latitude)]);
      const polyline = new AMap.Polyline({
        path,
        strokeColor: "#1769e0",
        strokeOpacity: 0.72,
        strokeWeight: 5,
        lineJoin: "round",
        lineCap: "round"
      });
      map.add(polyline);
    }
    if (shouldFitHome && markers.length > 1) map.setFitView(markers, false, [90, 450, 90, 90]);
    map.on("click", (event) => {
      state.selected = null;
      state.searchedPlace = null;
      state.draft = {
        placeName: document.querySelector("#searchPlace")?.value || "手动选择的位置",
        latitude: Number(event.lnglat.lat.toFixed(6)),
        longitude: Number(event.lnglat.lng.toFixed(6)),
        city: "",
        district: "",
        address: ""
      };
      renderMap();
    });
  } catch (error) {
    state.config.hasAmapConfig = false;
    state.error = `高德地图加载失败：${error.message || "请检查 Key 和安全密钥"}`;
    renderMap();
  }
}

async function searchPlaceCandidates(query) {
  const placeName = query.trim();
  if (!placeName) {
    state.searchQuery = "";
    state.searchedPlace = null;
    state.searchResults = [];
    state.isSearchingPlace = false;
    renderMap();
    return;
  }

  const requestId = ++placeSearchRequest;
  state.searchQuery = placeName;
  state.isSearchingPlace = true;
  state.searchResults = [];
  state.searchedPlace = null;
  renderMap();

  const candidates = state.config.hasAmapConfig ? await searchAmapPlaces(placeName) : [];
  if (requestId !== placeSearchRequest) return;

  state.isSearchingPlace = false;
  if (state.config.hasAmapConfig && !candidates.length) {
    state.searchedPlace = null;
    state.searchResults = [];
    state.error = "没有搜到这个店铺，换一个更完整的店名或加上城市试试。";
    renderMap();
    return;
  }

  state.selected = null;
  state.error = "";
  state.searchResults = candidates.length ? candidates : [{ id: "manual", placeName, latitude: 30.266, longitude: 120.161, city: "", district: "", address: "" }];
  renderMap();
}

function chooseSearchResult(placeId) {
  const place = state.searchResults.find((item) => item.id === placeId);
  if (!place) return;
  state.searchedPlace = place;
  state.searchResults = [];
  state.selected = null;
  state.error = "";
  renderMap();
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
  const homeView = homeMapView(filtered);
  const activePlace = state.selected || state.draft || state.searchedPlace;
  const mapMemories = activePlace ? filtered : homeView.memories;
  const route = activePlace ? [] : homeView.route;
  const showOutlineHome = useAmap && !activePlace;
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
        ${showOutlineHome ? '<div class="outline-map" id="outlineMap"></div>' : ""}
        ${useAmap && activePlace ? '<div class="amap-root" id="amapRoot"></div><div class="map-hint">输入完整店名后点搜索，选择候选地点即可定位。</div>' : ""}
        ${!useAmap ? '<div class="map-hint">点击地图任意位置添加记忆；配置高德 Key 后可接入真实地图搜索。</div>' : ""}
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
  if (showOutlineHome) {
    mountOutlineMap(filtered, homeView);
  } else if (useAmap) {
    mountAmapMap(mapMemories, route, Boolean(activePlace));
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
        city: "",
        district: "",
        address: ""
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
      <input id="searchPlace" aria-label="搜索店名或地点" value="${escapeHtml(state.searchQuery)}" placeholder="输入店名，地图自动定位" />
      <button class="primary" id="useSearch">${state.config.hasAmapConfig ? "搜索" : "放点"}</button>
    </div>
    ${
      state.isSearchingPlace
        ? '<p class="muted">正在搜索店铺位置...</p>'
        : state.searchResults.length
          ? `<div class="search-results" role="listbox" aria-label="地点候选">${state.searchResults.map((place) => `
              <button class="search-option" data-place-id="${escapeHtml(place.id)}" role="option">
                <strong>${escapeHtml(place.placeName)}</strong>
                <span>${escapeHtml([place.city, place.district, place.address].filter(Boolean).join(" · ") || "点击选择这个位置")}</span>
              </button>
            `).join("")}</div>`
        : state.searchedPlace
          ? `<section class="search-result"><strong>${escapeHtml(state.searchedPlace.placeName)}</strong><span>${escapeHtml(placeLabel(state.searchedPlace) || "已定位到地图")}</span><button class="primary" id="addSearchedPlace">添加这家店的记忆</button></section>`
          : ""
    }
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
                    <span>${memory.rating} 分 · ${statusText[memory.revisitStatus]} · ${escapeHtml(placeLabel(memory) || memory.city || "未知地点")}</span>
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
  const locationText = placeLabel(draft) || "已通过地图点位确定";
  return `
    <h2>添加美食记忆</h2>
    <label class="field">店名<input id="placeName" value="${escapeHtml(draft.placeName)}" /></label>
    <section class="location-summary"><strong>地点</strong><span>${escapeHtml(locationText)}</span></section>
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
      <p class="muted">${escapeHtml(placeLabel(memory) || memory.city || "未记录地点详情")}</p>
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
    await searchPlaceCandidates(placeName);
  });

  document.querySelector("#searchPlace")?.addEventListener("input", (event) => {
    state.searchQuery = event.target.value;
    state.searchResults = [];
    state.searchedPlace = null;
  });

  document.querySelector("#searchPlace")?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await searchPlaceCandidates(event.target.value);
  });

  document.querySelectorAll(".search-option").forEach((option) => {
    option.addEventListener("click", () => chooseSearchResult(option.dataset.placeId));
  });

  document.querySelector("#addSearchedPlace")?.addEventListener("click", () => {
    state.draft = state.searchedPlace;
    state.searchedPlace = null;
    state.searchResults = [];
    state.error = "";
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
    state.searchedPlace = null;
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
      district: memory.district || "",
      address: memory.address || "",
      existing: memory
    };
    state.searchedPlace = null;
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
      city: state.draft.city || "",
      district: state.draft.district || "",
      address: state.draft.address || "",
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
