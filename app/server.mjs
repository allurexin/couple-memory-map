import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const __filename = fileURLToPath(import.meta.url);
const publicDir = join(__dirname, "public");
const defaultConfigPath = join(__dirname, "..", "config.local.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function randomId(prefix) {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 32).toString("base64url");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, salt, 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function signToken(payload, secret) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyToken(token, secret) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  if (signature !== expected) return null;
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function createStore(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const uploadDir = join(dataDir, "uploads");
  mkdirSync(uploadDir, { recursive: true });
  const dbPath = join(dataDir, "db.json");

  const initial = {
    users: [],
    spaces: [],
    memories: []
  };

  let state = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath, "utf8")) : initial;

  function save() {
    writeFileSync(dbPath, JSON.stringify(state, null, 2), "utf8");
  }

  function publicState() {
    return state;
  }

  return { uploadDir, get state() { return publicState(); }, save };
}

function readJsonFile(path) {
  if (!path || !existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

function publicConfig(configPath = defaultConfigPath) {
  const fileConfig = readJsonFile(configPath);
  const amapKey = String(process.env.AMAP_KEY || fileConfig.amapKey || "").trim();
  const amapSecurityCode = String(process.env.AMAP_SECURITY_CODE || fileConfig.amapSecurityCode || "").trim();
  return {
    hasAmapConfig: Boolean(amapKey && amapSecurityCode),
    amapKey,
    amapSecurityCode
  };
}

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS"
  });
  res.end(body === null ? "" : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl || null
  };
}

function publicSpace(space) {
  return {
    id: space.id,
    name: space.name,
    bindingCode: space.bindingCode,
    memberIds: [...space.memberIds],
    createdBy: space.createdBy,
    createdAt: space.createdAt,
    updatedAt: space.updatedAt
  };
}

function publicMemory(memory) {
  return {
    id: memory.id,
    coupleSpaceId: memory.coupleSpaceId,
    placeName: memory.placeName,
    poiId: memory.poiId || null,
    latitude: memory.latitude,
    longitude: memory.longitude,
    city: memory.city || null,
    district: memory.district || null,
    address: memory.address || null,
    memoryDate: memory.memoryDate,
    rating: memory.rating,
    revisitStatus: memory.revisitStatus,
    notes: memory.notes || "",
    createdBy: memory.createdBy,
    updatedBy: memory.updatedBy,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    foodItems: memory.foodItems || [],
    photos: memory.photos || []
  };
}

function createBindingCode(existingCodes) {
  let code = "";
  do {
    code = randomBytes(8).toString("base64url").replace(/[-_]/g, "").toUpperCase().slice(0, 8);
  } while (existingCodes.has(code) || code.length < 8);
  return code;
}

function getUserFromRequest(req, state, jwtSecret) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const payload = verifyToken(token, jwtSecret);
  if (!payload?.id) return null;
  return state.users.find((user) => user.id === payload.id) || null;
}

function currentSpace(state, userId) {
  return state.spaces.find((space) => space.memberIds.includes(userId)) || null;
}

function requireUser(req, res, store, jwtSecret) {
  const user = getUserFromRequest(req, store.state, jwtSecret);
  if (!user) {
    json(res, 401, { message: "需要登录" });
    return null;
  }
  return user;
}

function validateMemoryInput(body, existing = {}) {
  const merged = { ...existing, ...body };
  if (!merged.placeName || typeof merged.placeName !== "string") return null;
  if (!Number.isFinite(Number(merged.latitude)) || !Number.isFinite(Number(merged.longitude))) return null;
  if (!merged.memoryDate || typeof merged.memoryDate !== "string") return null;
  const rating = Number(merged.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  if (!["again", "normal", "avoid"].includes(merged.revisitStatus)) return null;

  return {
    placeName: merged.placeName.trim(),
    poiId: merged.poiId || null,
    latitude: Number(merged.latitude),
    longitude: Number(merged.longitude),
    city: merged.city || null,
    district: merged.district || null,
    address: merged.address || null,
    memoryDate: merged.memoryDate,
    rating,
    revisitStatus: merged.revisitStatus,
    notes: merged.notes || "",
    foodItems: Array.isArray(merged.foodItems) ? merged.foodItems.map(String).filter(Boolean) : []
  };
}

function savePhotoDataUrl(store, memory, userId, photoDataUrl) {
  if (!photoDataUrl || typeof photoDataUrl !== "string") return;
  const match = photoDataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
  if (!match) return;
  const mime = match[1];
  const ext = mime.includes("png") ? ".png" : mime.includes("webp") ? ".webp" : ".jpg";
  const id = randomId("photo");
  const filename = `${id}${ext}`;
  writeFileSync(join(store.uploadDir, filename), Buffer.from(match[2], "base64"));
  const url = `/uploads/${filename}`;
  memory.photos.push({ id, thumbnailUrl: url, originalUrl: url, uploadedBy: userId, createdAt: nowIso() });
}

async function handleApi(req, res, store, jwtSecret, configPath) {
  const url = new URL(req.url, "http://localhost");
  const { state } = store;

  if (req.method === "OPTIONS") {
    json(res, 204, null);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    json(res, 200, publicConfig(configPath));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const displayName = String(body.displayName || "").trim();
    if (!email.includes("@") || password.length < 8 || !displayName) {
      json(res, 400, { message: "请填写邮箱、至少 8 位密码和昵称" });
      return;
    }
    if (state.users.some((user) => user.email === email)) {
      json(res, 409, { message: "邮箱已注册" });
      return;
    }
    const user = {
      id: randomId("user"),
      email,
      passwordHash: hashPassword(password),
      displayName,
      avatarUrl: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state.users.push(user);
    store.save();
    json(res, 201, {
      user: publicUser(user),
      token: signToken({ id: user.id, email: user.email }, jwtSecret)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const user = state.users.find((item) => item.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      json(res, 401, { message: "邮箱或密码错误" });
      return;
    }
    json(res, 200, {
      user: publicUser(user),
      token: signToken({ id: user.id, email: user.email }, jwtSecret)
    });
    return;
  }

  if (url.pathname.startsWith("/api/spaces")) {
    const user = requireUser(req, res, store, jwtSecret);
    if (!user) return;

    if (req.method === "GET" && url.pathname === "/api/spaces/me") {
      const space = currentSpace(state, user.id);
      json(res, 200, { space: space ? publicSpace(space) : null });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/spaces") {
      const body = await readBody(req);
      if (currentSpace(state, user.id)) {
        json(res, 409, { message: "你已经绑定情侣空间" });
        return;
      }
      const name = String(body.name || "").trim();
      if (!name) {
        json(res, 400, { message: "请填写空间名称" });
        return;
      }
      const space = {
        id: randomId("space"),
        name,
        bindingCode: createBindingCode(new Set(state.spaces.map((item) => item.bindingCode))),
        memberIds: [user.id],
        createdBy: user.id,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      state.spaces.push(space);
      store.save();
      json(res, 201, { space: publicSpace(space) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/spaces/join") {
      const body = await readBody(req);
      if (currentSpace(state, user.id)) {
        json(res, 409, { message: "你已经绑定情侣空间" });
        return;
      }
      const bindingCode = String(body.bindingCode || "").trim().toUpperCase();
      const space = state.spaces.find((item) => item.bindingCode === bindingCode);
      if (!space) {
        json(res, 404, { message: "绑定码无效" });
        return;
      }
      if (space.memberIds.length >= 2) {
        json(res, 409, { message: "这个情侣空间已满" });
        return;
      }
      space.memberIds.push(user.id);
      space.updatedAt = nowIso();
      store.save();
      json(res, 200, { space: publicSpace(space) });
      return;
    }
  }

  if (url.pathname.startsWith("/api/memories")) {
    const user = requireUser(req, res, store, jwtSecret);
    if (!user) return;
    const space = currentSpace(state, user.id);
    if (!space) {
      json(res, 409, { message: "请先绑定情侣空间" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/memories") {
      const keyword = String(url.searchParams.get("keyword") || "").trim().toLowerCase();
      const revisitStatus = url.searchParams.get("revisitStatus") || "all";
      const city = url.searchParams.get("city") || "";
      const minRating = Number(url.searchParams.get("minRating") || "0");
      const creator = url.searchParams.get("creator") || "";
      const memories = state.memories
        .filter((memory) => memory.coupleSpaceId === space.id && !memory.deletedAt)
        .filter((memory) => !keyword || [memory.placeName, memory.notes, ...(memory.foodItems || [])].join(" ").toLowerCase().includes(keyword))
        .filter((memory) => revisitStatus === "all" || memory.revisitStatus === revisitStatus)
        .filter((memory) => !city || memory.city === city)
        .filter((memory) => !minRating || memory.rating >= minRating)
        .filter((memory) => !creator || memory.createdBy === creator)
        .sort((a, b) => `${b.memoryDate}${b.createdAt}`.localeCompare(`${a.memoryDate}${a.createdAt}`))
        .map(publicMemory);
      json(res, 200, { memories });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/memories") {
      const body = await readBody(req);
      const input = validateMemoryInput(body);
      if (!input) {
        json(res, 400, { message: "记忆内容不完整" });
        return;
      }
      const memory = {
        id: randomId("memory"),
        coupleSpaceId: space.id,
        ...input,
        createdBy: user.id,
        updatedBy: user.id,
        deletedAt: null,
        photos: [],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      savePhotoDataUrl(store, memory, user.id, body.photoDataUrl);
      state.memories.push(memory);
      store.save();
      json(res, 201, { memory: publicMemory(memory) });
      return;
    }

    const memoryId = url.pathname.match(/^\/api\/memories\/([^/]+)$/)?.[1];
    if (memoryId) {
      const memory = state.memories.find((item) => item.id === memoryId && item.coupleSpaceId === space.id && !item.deletedAt);
      if (!memory) {
        json(res, 404, { message: "记忆不存在" });
        return;
      }

      if (req.method === "GET") {
        json(res, 200, { memory: publicMemory(memory) });
        return;
      }

      if (req.method === "PUT") {
        const body = await readBody(req);
        const input = validateMemoryInput(body, memory);
        if (!input) {
          json(res, 400, { message: "记忆内容不完整" });
          return;
        }
        Object.assign(memory, input, { updatedBy: user.id, updatedAt: nowIso() });
        savePhotoDataUrl(store, memory, user.id, body.photoDataUrl);
        store.save();
        json(res, 200, { memory: publicMemory(memory) });
        return;
      }

      if (req.method === "DELETE") {
        memory.deletedAt = nowIso();
        memory.updatedBy = user.id;
        memory.updatedAt = nowIso();
        store.save();
        json(res, 204, null);
        return;
      }
    }
  }

  json(res, 404, { message: "接口不存在" });
}

function serveStatic(req, res, dataDir) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/uploads/")) {
    const filePath = resolve(join(dataDir, url.pathname));
    if (!filePath.startsWith(resolve(join(dataDir, "uploads")))) {
      json(res, 403, { message: "禁止访问" });
      return;
    }
    if (!existsSync(filePath)) {
      json(res, 404, { message: "文件不存在" });
      return;
    }
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream" });
    createReadStream(filePath).pipe(res);
    return;
  }

  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = resolve(join(publicDir, requested));
  if (!filePath.startsWith(resolve(publicDir)) || !existsSync(filePath)) {
    const indexPath = join(publicDir, "index.html");
    res.writeHead(200, { "content-type": mimeTypes[".html"] });
    createReadStream(indexPath).pipe(res);
    return;
  }
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

export function createAppServer(options = {}) {
  const dataDir = options.dataDir || process.env.DATA_DIR || join(__dirname, "..", "data");
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET || "local-development-secret";
  const configPath = options.configPath || process.env.CONFIG_PATH || defaultConfigPath;
  const store = createStore(dataDir);

  return createServer(async (req, res) => {
    try {
      if (req.url?.startsWith("/api/")) {
        await handleApi(req, res, store, jwtSecret, configPath);
        return;
      }
      serveStatic(req, res, dataDir);
    } catch (error) {
      json(res, 500, { message: error instanceof Error ? error.message : "服务器错误" });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  const port = Number(process.env.PORT || 5173);
  const server = createAppServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`情侣美食记忆地图已启动：http://127.0.0.1:${port}`);
  });
}
