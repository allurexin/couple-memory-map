# Couple Memory Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first web MVP where two registered users bind into one couple space and save shared food memories on a real Chinese mainland map.

**Architecture:** Use a Vite React frontend and an Express backend in one workspace. The backend owns authentication, couple-space permissions, SQLite persistence, and local photo uploads; the frontend owns the map, mobile UI, forms, filtering, and focus-refresh synchronization.

**Tech Stack:** React, Vite, TypeScript, Express, SQLite via `better-sqlite3`, Vitest, Supertest, Testing Library, Amap JS API 2.0.

---

## Execution Note

During implementation on 2026-06-01, the local environment could run the bundled Node runtime but did not have a usable `npm`, and the system `node.exe` was denied by Windows. To keep the app buildable and testable in this workspace, the implementation switched to a zero-dependency Node app:

- Node built-in HTTP server instead of Express.
- JSON file persistence instead of SQLite.
- Node built-in test runner instead of Vitest.
- Native browser HTML/CSS/JS instead of React/Vite.

The product scope remains the same: two-user registration, couple-space binding, shared memories, photos, filtering, permission checks, and a mobile-first map-style interface.

## Scope Check

The design covers one cohesive MVP: account binding, shared map, memory CRUD, photos, filtering, permissions, and map degradation. These pieces are not useful as separate shipped products, so this plan keeps them together while breaking implementation into independently testable tasks.

## References

- Design spec: `docs/superpowers/specs/2026-05-31-couple-memory-map-design.md`
- Amap JS API 2.0 quick start: https://lbs.amap.com/api/javascript-api-v2/getting-started
- Amap JS API 2.0 overview: https://lbs.amap.com/api/javascript-api-v2

## File Structure

Create this structure under the repository root:

```text
package.json
.gitignore
.env.example
server/package.json
server/tsconfig.json
server/vitest.config.ts
server/src/app.ts
server/src/server.ts
server/src/config/env.ts
server/src/db/database.ts
server/src/db/schema.ts
server/src/auth/password.ts
server/src/auth/tokens.ts
server/src/http/authMiddleware.ts
server/src/http/authRoutes.ts
server/src/http/spaceRoutes.ts
server/src/http/memoryRoutes.ts
server/src/uploads/uploadMiddleware.ts
server/src/test/testApp.ts
server/src/**/*.test.ts
client/package.json
client/tsconfig.json
client/vite.config.ts
client/index.html
client/src/main.tsx
client/src/App.tsx
client/src/api/client.ts
client/src/api/types.ts
client/src/session/SessionProvider.tsx
client/src/features/auth/AuthPage.tsx
client/src/features/space/SpaceGate.tsx
client/src/features/map/AmapCanvas.tsx
client/src/features/map/amapLoader.ts
client/src/features/memories/filterMemories.ts
client/src/features/memories/MemoryForm.tsx
client/src/features/memories/MemoryDetail.tsx
client/src/features/memories/MemorySheet.tsx
client/src/styles.css
```

Boundaries:

- `server/src/db/*` owns schema and persistence.
- `server/src/auth/*` owns password and token behavior.
- `server/src/http/*` owns request validation, auth checks, and API responses.
- `client/src/api/*` owns API types and HTTP calls.
- `client/src/session/*` owns current user and token state.
- `client/src/features/map/*` owns Amap loading, marker rendering, and manual placement.
- `client/src/features/memories/*` owns memory forms, details, filters, and list UI.

## Environment Variables

Use `.env.example`:

```env
PORT=5174
CLIENT_ORIGIN=http://localhost:5173
DATABASE_PATH=server/dev.sqlite
JWT_SECRET=change-me-for-local-dev
UPLOAD_DIR=server/uploads
VITE_API_BASE_URL=http://localhost:5174
VITE_AMAP_KEY=
VITE_AMAP_SECURITY_CODE=
```

The Amap quick-start documentation requires a Web JS API key and, for current keys, a `securityJsCode`. The app should show a map configuration message if these frontend values are empty.

---

### Task 1: Scaffold The Workspace

**Files:**

- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`

- [ ] **Step 1: Create root project files**

Create `package.json`:

```json
{
  "scripts": {
    "dev": "npm-run-all -p dev:server dev:client",
    "dev:server": "npm --workspace server run dev",
    "dev:client": "npm --workspace client run dev",
    "test": "npm --workspace server run test && npm --workspace client run test",
    "build": "npm --workspace server run build && npm --workspace client run build"
  },
  "workspaces": [
    "server",
    "client"
  ],
  "devDependencies": {
    "npm-run-all": "^4.1.5"
  }
}
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
.env
server/*.sqlite
server/uploads/
.superpowers/
```

Create `.env.example` using the content in the Environment Variables section.

- [ ] **Step 2: Create server package files**

Create `server/package.json`:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "better-sqlite3": "^11.10.0",
    "cors": "^2.8.5",
    "dotenv": "^16.5.0",
    "express": "^4.21.2",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.2",
    "nanoid": "^5.1.5",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/better-sqlite3": "^7.6.13",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.9",
    "@types/multer": "^1.4.12",
    "@types/node": "^22.15.24",
    "@types/supertest": "^6.0.3",
    "supertest": "^7.1.1",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vitest": "^3.1.4"
  }
}
```

Create `server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

Create `server/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    isolate: true
  }
});
```

- [ ] **Step 3: Create client package files**

Create `client/package.json`:

```json
{
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc -p tsconfig.json && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^4.5.0",
    "lucide-react": "^0.511.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "@types/react": "^19.1.6",
    "@types/react-dom": "^19.1.5",
    "jsdom": "^26.1.0",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "vitest": "^3.1.4"
  }
}
```

Create `client/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

Create `client/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/testSetup.ts"]
  }
});
```

Create `client/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>情侣美食记忆地图</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Install dependencies**

Run:

```powershell
npm install
```

Expected: npm installs root, server, and client workspace dependencies without package resolution errors.

- [ ] **Step 5: Commit scaffold**

Run:

```powershell
git add package.json package-lock.json .gitignore .env.example server client
git commit -m "chore: scaffold couple memory map app"
```

Expected: commit succeeds. If `git` is unavailable, record the command output and continue without deleting any files.

---

### Task 2: Implement Backend Database Schema

**Files:**

- Create: `server/src/config/env.ts`
- Create: `server/src/db/schema.ts`
- Create: `server/src/db/database.ts`
- Create: `server/src/db/schema.test.ts`

- [ ] **Step 1: Write the failing schema test**

Create `server/src/db/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "./database.js";

describe("database schema", () => {
  it("creates users, couple spaces, memories, food items, and photos", () => {
    const db = createDatabase(":memory:");

    const tables = db
      .prepare("select name from sqlite_master where type = 'table' order by name")
      .all()
      .map((row: any) => row.name);

    expect(tables).toEqual(
      expect.arrayContaining(["users", "couple_spaces", "memories", "food_items", "photos"])
    );
  });

  it("enforces memory ownership through couple_space_id foreign key", () => {
    const db = createDatabase(":memory:");

    expect(() => {
      db.prepare(
        "insert into memories (id, couple_space_id, place_name, latitude, longitude, memory_date, rating, revisit_status, created_by, updated_by) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run("memory_1", "missing_space", "不存在的店", 30.2, 120.1, "2026-05-31", 4, "again", "user_1", "user_1");
    }).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm --workspace server run test -- src/db/schema.test.ts
```

Expected: FAIL because `server/src/db/database.ts` does not exist.

- [ ] **Step 3: Implement schema and database factory**

Create `server/src/db/schema.ts`:

```ts
export const schemaSql = `
pragma foreign_keys = on;

create table if not exists users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  avatar_url text,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists couple_spaces (
  id text primary key,
  name text not null,
  binding_code text not null unique,
  created_by text not null references users(id),
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists couple_space_members (
  couple_space_id text not null references couple_spaces(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'partner')),
  created_at text not null default current_timestamp,
  primary key (couple_space_id, user_id)
);

create table if not exists memories (
  id text primary key,
  couple_space_id text not null references couple_spaces(id) on delete cascade,
  place_name text not null,
  poi_id text,
  latitude real not null,
  longitude real not null,
  city text,
  memory_date text not null,
  rating integer not null check (rating between 1 and 5),
  revisit_status text not null check (revisit_status in ('again', 'normal', 'avoid')),
  notes text,
  created_by text not null references users(id),
  updated_by text not null references users(id),
  deleted_at text,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists food_items (
  id text primary key,
  memory_id text not null references memories(id) on delete cascade,
  name text not null,
  created_at text not null default current_timestamp
);

create table if not exists photos (
  id text primary key,
  memory_id text not null references memories(id) on delete cascade,
  storage_path text not null,
  thumbnail_url text not null,
  original_url text not null,
  uploaded_by text not null references users(id),
  created_at text not null default current_timestamp
);
`;
```

Create `server/src/db/database.ts`:

```ts
import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { schemaSql } from "./schema.js";

export type AppDatabase = Database.Database;

export function createDatabase(databasePath: string): AppDatabase {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  db.exec(schemaSql);
  return db;
}
```

Create `server/src/config/env.ts`:

```ts
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: ".env" });

const EnvSchema = z.object({
  PORT: z.coerce.number().default(5174),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_PATH: z.string().default("server/dev.sqlite"),
  JWT_SECRET: z.string().min(12).default("change-me-for-local-dev"),
  UPLOAD_DIR: z.string().default("server/uploads")
});

export const env = EnvSchema.parse(process.env);
```

- [ ] **Step 4: Run backend schema tests**

Run:

```powershell
npm --workspace server run test -- src/db/schema.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit schema**

Run:

```powershell
git add server/src/config server/src/db
git commit -m "feat: add backend database schema"
```

Expected: commit succeeds, or `git` absence is recorded.

---

### Task 3: Implement Authentication And Couple Binding APIs

**Files:**

- Create: `server/src/auth/password.ts`
- Create: `server/src/auth/tokens.ts`
- Create: `server/src/http/authMiddleware.ts`
- Create: `server/src/http/authRoutes.ts`
- Create: `server/src/http/spaceRoutes.ts`
- Create: `server/src/app.ts`
- Create: `server/src/server.ts`
- Create: `server/src/test/testApp.ts`
- Create: `server/src/http/authRoutes.test.ts`
- Create: `server/src/http/spaceRoutes.test.ts`

- [ ] **Step 1: Write failing API tests**

Create `server/src/http/authRoutes.test.ts`:

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../test/testApp.js";

describe("auth routes", () => {
  it("registers a user and returns a token", async () => {
    const { app } = createTestApp();

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "a@example.com", password: "password123", displayName: "阿一" });

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe("a@example.com");
    expect(res.body.user.displayName).toBe("阿一");
  });

  it("logs in an existing user", async () => {
    const { app } = createTestApp();

    await request(app)
      .post("/api/auth/register")
      .send({ email: "b@example.com", password: "password123", displayName: "阿二" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "b@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });
});
```

Create `server/src/http/spaceRoutes.test.ts`:

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../test/testApp.js";

async function register(app: any, email: string, displayName: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "password123", displayName });
  return res.body.token as string;
}

describe("space routes", () => {
  it("creates a couple space and lets a second user join", async () => {
    const { app } = createTestApp();
    const ownerToken = await register(app, "owner@example.com", "Owner");
    const partnerToken = await register(app, "partner@example.com", "Partner");

    const created = await request(app)
      .post("/api/spaces")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "我们的饭地图" });

    expect(created.status).toBe(201);
    expect(created.body.space.bindingCode).toEqual(expect.any(String));

    const joined = await request(app)
      .post("/api/spaces/join")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ bindingCode: created.body.space.bindingCode });

    expect(joined.status).toBe(200);
    expect(joined.body.space.memberIds).toHaveLength(2);
  });

  it("rejects a third member", async () => {
    const { app } = createTestApp();
    const ownerToken = await register(app, "owner2@example.com", "Owner");
    const partnerToken = await register(app, "partner2@example.com", "Partner");
    const thirdToken = await register(app, "third@example.com", "Third");

    const created = await request(app)
      .post("/api/spaces")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "两个人的空间" });

    await request(app)
      .post("/api/spaces/join")
      .set("Authorization", `Bearer ${partnerToken}`)
      .send({ bindingCode: created.body.space.bindingCode });

    const rejected = await request(app)
      .post("/api/spaces/join")
      .set("Authorization", `Bearer ${thirdToken}`)
      .send({ bindingCode: created.body.space.bindingCode });

    expect(rejected.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
npm --workspace server run test -- src/http/authRoutes.test.ts src/http/spaceRoutes.test.ts
```

Expected: FAIL because HTTP app and routes do not exist.

- [ ] **Step 3: Implement auth helpers**

Create `server/src/auth/password.ts`:

```ts
import bcrypt from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

Create `server/src/auth/tokens.ts`:

```ts
import jwt from "jsonwebtoken";

export type TokenUser = {
  id: string;
  email: string;
};

export function signToken(user: TokenUser, secret: string): string {
  return jwt.sign(user, secret, { expiresIn: "30d" });
}

export function verifyToken(token: string, secret: string): TokenUser {
  return jwt.verify(token, secret) as TokenUser;
}
```

- [ ] **Step 4: Implement app factory and auth middleware**

Create `server/src/http/authMiddleware.ts`:

```ts
import type { NextFunction, Request, Response } from "express";
import type { AppDatabase } from "../db/database.js";
import { verifyToken, type TokenUser } from "../auth/tokens.js";

export type AuthedRequest = Request & {
  user: TokenUser;
};

export function requireAuth(db: AppDatabase, jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";

    if (!token) {
      res.status(401).json({ message: "需要登录" });
      return;
    }

    try {
      const user = verifyToken(token, jwtSecret);
      const found = db.prepare("select id from users where id = ?").get(user.id);
      if (!found) {
        res.status(401).json({ message: "账号不存在" });
        return;
      }
      (req as AuthedRequest).user = user;
      next();
    } catch {
      res.status(401).json({ message: "登录已失效" });
    }
  };
}
```

Create `server/src/app.ts`:

```ts
import cors from "cors";
import express from "express";
import type { AppDatabase } from "./db/database.js";
import { createAuthRoutes } from "./http/authRoutes.js";
import { createSpaceRoutes } from "./http/spaceRoutes.js";

export type AppOptions = {
  db: AppDatabase;
  jwtSecret: string;
  clientOrigin: string;
};

export function createApp(options: AppOptions) {
  const app = express();
  app.use(cors({ origin: options.clientOrigin }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", createAuthRoutes(options.db, options.jwtSecret));
  app.use("/api/spaces", createSpaceRoutes(options.db, options.jwtSecret));

  return app;
}
```

Create `server/src/server.ts`:

```ts
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { createDatabase } from "./db/database.js";

const db = createDatabase(env.DATABASE_PATH);
const app = createApp({ db, jwtSecret: env.JWT_SECRET, clientOrigin: env.CLIENT_ORIGIN });

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});
```

Create `server/src/test/testApp.ts`:

```ts
import { createApp } from "../app.js";
import { createDatabase } from "../db/database.js";

export function createTestApp() {
  const db = createDatabase(":memory:");
  const app = createApp({
    db,
    jwtSecret: "test-secret-with-enough-length",
    clientOrigin: "http://localhost:5173"
  });
  return { app, db };
}
```

- [ ] **Step 5: Implement auth and space routes**

Create `server/src/http/authRoutes.ts`:

```ts
import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signToken } from "../auth/tokens.js";
import type { AppDatabase } from "../db/database.js";

const Credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(40).optional()
});

function toUser(row: any) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url
  };
}

export function createAuthRoutes(db: AppDatabase, jwtSecret: string) {
  const router = Router();

  router.post("/register", async (req, res) => {
    const parsed = Credentials.safeParse(req.body);
    if (!parsed.success || !parsed.data.displayName) {
      res.status(400).json({ message: "请填写邮箱、至少 8 位密码和昵称" });
      return;
    }

    const existing = db.prepare("select id from users where email = ?").get(parsed.data.email);
    if (existing) {
      res.status(409).json({ message: "邮箱已注册" });
      return;
    }

    const id = `user_${nanoid(12)}`;
    const passwordHash = await hashPassword(parsed.data.password);
    db.prepare(
      "insert into users (id, email, password_hash, display_name) values (?, ?, ?, ?)"
    ).run(id, parsed.data.email, passwordHash, parsed.data.displayName);

    const row = db.prepare("select * from users where id = ?").get(id);
    const user = toUser(row);
    res.status(201).json({ user, token: signToken({ id: user.id, email: user.email }, jwtSecret) });
  });

  router.post("/login", async (req, res) => {
    const parsed = Credentials.pick({ email: true, password: true }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "请填写邮箱和密码" });
      return;
    }

    const row = db.prepare("select * from users where email = ?").get(parsed.data.email) as any;
    if (!row || !(await verifyPassword(parsed.data.password, row.password_hash))) {
      res.status(401).json({ message: "邮箱或密码错误" });
      return;
    }

    const user = toUser(row);
    res.json({ user, token: signToken({ id: user.id, email: user.email }, jwtSecret) });
  });

  return router;
}
```

Create `server/src/http/spaceRoutes.ts`:

```ts
import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { AppDatabase } from "../db/database.js";
import { requireAuth, type AuthedRequest } from "./authMiddleware.js";

const CreateSpace = z.object({
  name: z.string().min(1).max(60)
});

const JoinSpace = z.object({
  bindingCode: z.string().min(6)
});

function getSpace(db: AppDatabase, id: string) {
  const row = db.prepare("select * from couple_spaces where id = ?").get(id) as any;
  if (!row) return null;
  const members = db
    .prepare("select user_id from couple_space_members where couple_space_id = ? order by created_at")
    .all(id)
    .map((member: any) => member.user_id);
  return {
    id: row.id,
    name: row.name,
    bindingCode: row.binding_code,
    memberIds: members,
    createdBy: row.created_by
  };
}

function getCurrentSpace(db: AppDatabase, userId: string) {
  const row = db
    .prepare("select couple_space_id from couple_space_members where user_id = ? limit 1")
    .get(userId) as any;
  return row ? getSpace(db, row.couple_space_id) : null;
}

export function createSpaceRoutes(db: AppDatabase, jwtSecret: string) {
  const router = Router();
  router.use(requireAuth(db, jwtSecret));

  router.get("/me", (req, res) => {
    res.json({ space: getCurrentSpace(db, (req as AuthedRequest).user.id) });
  });

  router.post("/", (req, res) => {
    const parsed = CreateSpace.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "请填写空间名称" });
      return;
    }

    const userId = (req as AuthedRequest).user.id;
    if (getCurrentSpace(db, userId)) {
      res.status(409).json({ message: "你已经绑定情侣空间" });
      return;
    }

    const id = `space_${nanoid(12)}`;
    const bindingCode = nanoid(8).toUpperCase();
    const tx = db.transaction(() => {
      db.prepare(
        "insert into couple_spaces (id, name, binding_code, created_by) values (?, ?, ?, ?)"
      ).run(id, parsed.data.name, bindingCode, userId);
      db.prepare(
        "insert into couple_space_members (couple_space_id, user_id, role) values (?, ?, 'owner')"
      ).run(id, userId);
    });
    tx();

    res.status(201).json({ space: getSpace(db, id) });
  });

  router.post("/join", (req, res) => {
    const parsed = JoinSpace.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "请输入绑定码" });
      return;
    }

    const userId = (req as AuthedRequest).user.id;
    if (getCurrentSpace(db, userId)) {
      res.status(409).json({ message: "你已经绑定情侣空间" });
      return;
    }

    const row = db
      .prepare("select id from couple_spaces where binding_code = ?")
      .get(parsed.data.bindingCode) as any;
    if (!row) {
      res.status(404).json({ message: "绑定码无效" });
      return;
    }

    const space = getSpace(db, row.id);
    if (!space || space.memberIds.length >= 2) {
      res.status(409).json({ message: "这个情侣空间已满" });
      return;
    }

    db.prepare(
      "insert into couple_space_members (couple_space_id, user_id, role) values (?, ?, 'partner')"
    ).run(row.id, userId);

    res.json({ space: getSpace(db, row.id) });
  });

  return router;
}
```

- [ ] **Step 6: Run auth and space tests**

Run:

```powershell
npm --workspace server run test -- src/http/authRoutes.test.ts src/http/spaceRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit auth and binding APIs**

Run:

```powershell
git add server/src
git commit -m "feat: add auth and couple binding api"
```

Expected: commit succeeds, or `git` absence is recorded.

---

### Task 4: Implement Memory And Photo APIs

**Files:**

- Create: `server/src/uploads/uploadMiddleware.ts`
- Create: `server/src/http/memoryRoutes.ts`
- Create: `server/src/http/memoryRoutes.test.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Write failing memory API tests**

Create `server/src/http/memoryRoutes.test.ts`:

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../test/testApp.js";

async function register(app: any, email: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "password123", displayName: email.split("@")[0] });
  return res.body.token as string;
}

async function createSpace(app: any, token: string) {
  const res = await request(app)
    .post("/api/spaces")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "吃饭地图" });
  return res.body.space;
}

describe("memory routes", () => {
  it("creates and lists a memory inside the user's couple space", async () => {
    const { app } = createTestApp();
    const token = await register(app, "memory@example.com");
    await createSpace(app, token);

    const created = await request(app)
      .post("/api/memories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        placeName: "武林夜市",
        latitude: 30.266,
        longitude: 120.161,
        city: "杭州",
        memoryDate: "2026-05-31",
        rating: 5,
        revisitStatus: "again",
        notes: "冰粉很好吃",
        foodItems: ["冰粉", "烤苕皮"]
      });

    expect(created.status).toBe(201);
    expect(created.body.memory.foodItems).toEqual(["冰粉", "烤苕皮"]);

    const listed = await request(app)
      .get("/api/memories")
      .set("Authorization", `Bearer ${token}`);

    expect(listed.status).toBe(200);
    expect(listed.body.memories).toHaveLength(1);
  });

  it("prevents users from reading another couple space", async () => {
    const { app } = createTestApp();
    const tokenA = await register(app, "a-space@example.com");
    const tokenB = await register(app, "b-space@example.com");
    await createSpace(app, tokenA);
    await createSpace(app, tokenB);

    const created = await request(app)
      .post("/api/memories")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        placeName: "秘密小店",
        latitude: 31.23,
        longitude: 121.47,
        city: "上海",
        memoryDate: "2026-05-31",
        rating: 4,
        revisitStatus: "normal",
        notes: "",
        foodItems: ["面"]
      });

    const forbidden = await request(app)
      .put(`/api/memories/${created.body.memory.id}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ notes: "越权编辑" });

    expect(forbidden.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm --workspace server run test -- src/http/memoryRoutes.test.ts
```

Expected: FAIL because `/api/memories` is not registered.

- [ ] **Step 3: Implement upload middleware**

Create `server/src/uploads/uploadMiddleware.ts`:

```ts
import multer from "multer";
import { mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { nanoid } from "nanoid";

export function createUploadMiddleware(uploadDir: string) {
  mkdirSync(uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname) || ".jpg";
      cb(null, `${nanoid(16)}${ext}`);
    }
  });

  return multer({
    storage,
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      cb(null, file.mimetype.startsWith("image/"));
    }
  });
}

export function publicUploadUrl(filename: string) {
  return `/uploads/${filename}`;
}
```

- [ ] **Step 4: Implement memory routes**

Create `server/src/http/memoryRoutes.ts` with route helpers:

```ts
import { Router } from "express";
import { basename } from "node:path";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { AppDatabase } from "../db/database.js";
import { requireAuth, type AuthedRequest } from "./authMiddleware.js";
import { createUploadMiddleware, publicUploadUrl } from "../uploads/uploadMiddleware.js";

const RevisitStatus = z.enum(["again", "normal", "avoid"]);

const CreateMemory = z.object({
  placeName: z.string().min(1).max(120),
  poiId: z.string().optional().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  city: z.string().optional().nullable(),
  memoryDate: z.string().min(8),
  rating: z.number().int().min(1).max(5),
  revisitStatus: RevisitStatus,
  notes: z.string().optional().nullable(),
  foodItems: z.array(z.string().min(1).max(60)).default([])
});

const UpdateMemory = CreateMemory.partial().extend({
  foodItems: z.array(z.string().min(1).max(60)).optional()
});

function currentSpaceId(db: AppDatabase, userId: string): string | null {
  const row = db
    .prepare("select couple_space_id from couple_space_members where user_id = ? limit 1")
    .get(userId) as any;
  return row?.couple_space_id || null;
}

function memoryBelongsToUser(db: AppDatabase, memoryId: string, userId: string) {
  const row = db
    .prepare(
      `select m.id
       from memories m
       join couple_space_members csm on csm.couple_space_id = m.couple_space_id
       where m.id = ? and csm.user_id = ? and m.deleted_at is null`
    )
    .get(memoryId, userId);
  return Boolean(row);
}

function readMemory(db: AppDatabase, memoryId: string) {
  const row = db.prepare("select * from memories where id = ? and deleted_at is null").get(memoryId) as any;
  if (!row) return null;

  const foodItems = db
    .prepare("select name from food_items where memory_id = ? order by created_at")
    .all(memoryId)
    .map((item: any) => item.name);

  const photos = db
    .prepare("select id, thumbnail_url, original_url, uploaded_by from photos where memory_id = ? order by created_at")
    .all(memoryId);

  return {
    id: row.id,
    coupleSpaceId: row.couple_space_id,
    placeName: row.place_name,
    poiId: row.poi_id,
    latitude: row.latitude,
    longitude: row.longitude,
    city: row.city,
    memoryDate: row.memory_date,
    rating: row.rating,
    revisitStatus: row.revisit_status,
    notes: row.notes,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    foodItems,
    photos
  };
}

export function createMemoryRoutes(db: AppDatabase, jwtSecret: string, uploadDir: string) {
  const router = Router();
  const upload = createUploadMiddleware(uploadDir);

  router.use(requireAuth(db, jwtSecret));

  router.get("/", (req, res) => {
    const userId = (req as AuthedRequest).user.id;
    const spaceId = currentSpaceId(db, userId);
    if (!spaceId) {
      res.status(409).json({ message: "请先绑定情侣空间" });
      return;
    }

    const rows = db
      .prepare("select id from memories where couple_space_id = ? and deleted_at is null order by memory_date desc, created_at desc")
      .all(spaceId) as any[];

    res.json({ memories: rows.map((row) => readMemory(db, row.id)) });
  });

  router.post("/", (req, res) => {
    const parsed = CreateMemory.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "记忆内容不完整" });
      return;
    }

    const userId = (req as AuthedRequest).user.id;
    const spaceId = currentSpaceId(db, userId);
    if (!spaceId) {
      res.status(409).json({ message: "请先绑定情侣空间" });
      return;
    }

    const id = `memory_${nanoid(12)}`;
    const tx = db.transaction(() => {
      db.prepare(
        `insert into memories
         (id, couple_space_id, place_name, poi_id, latitude, longitude, city, memory_date, rating, revisit_status, notes, created_by, updated_by)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        spaceId,
        parsed.data.placeName,
        parsed.data.poiId || null,
        parsed.data.latitude,
        parsed.data.longitude,
        parsed.data.city || null,
        parsed.data.memoryDate,
        parsed.data.rating,
        parsed.data.revisitStatus,
        parsed.data.notes || null,
        userId,
        userId
      );

      for (const item of parsed.data.foodItems) {
        db.prepare("insert into food_items (id, memory_id, name) values (?, ?, ?)").run(
          `food_${nanoid(12)}`,
          id,
          item
        );
      }
    });
    tx();

    res.status(201).json({ memory: readMemory(db, id) });
  });

  router.put("/:id", (req, res) => {
    const userId = (req as AuthedRequest).user.id;
    if (!memoryBelongsToUser(db, req.params.id, userId)) {
      res.status(404).json({ message: "记忆不存在" });
      return;
    }

    const parsed = UpdateMemory.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "记忆内容不完整" });
      return;
    }

    const current = readMemory(db, req.params.id);
    if (!current) {
      res.status(404).json({ message: "记忆不存在" });
      return;
    }

    const next = { ...current, ...parsed.data };
    const tx = db.transaction(() => {
      db.prepare(
        `update memories
         set place_name = ?, poi_id = ?, latitude = ?, longitude = ?, city = ?, memory_date = ?,
             rating = ?, revisit_status = ?, notes = ?, updated_by = ?, updated_at = current_timestamp
         where id = ?`
      ).run(
        next.placeName,
        next.poiId || null,
        next.latitude,
        next.longitude,
        next.city || null,
        next.memoryDate,
        next.rating,
        next.revisitStatus,
        next.notes || null,
        userId,
        req.params.id
      );

      if (parsed.data.foodItems) {
        db.prepare("delete from food_items where memory_id = ?").run(req.params.id);
        for (const item of parsed.data.foodItems) {
          db.prepare("insert into food_items (id, memory_id, name) values (?, ?, ?)").run(
            `food_${nanoid(12)}`,
            req.params.id,
            item
          );
        }
      }
    });
    tx();

    res.json({ memory: readMemory(db, req.params.id) });
  });

  router.delete("/:id", (req, res) => {
    const userId = (req as AuthedRequest).user.id;
    if (!memoryBelongsToUser(db, req.params.id, userId)) {
      res.status(404).json({ message: "记忆不存在" });
      return;
    }

    db.prepare("update memories set deleted_at = current_timestamp, updated_by = ? where id = ?").run(
      userId,
      req.params.id
    );
    res.status(204).send();
  });

  router.post("/:id/photos", upload.single("photo"), (req, res) => {
    const userId = (req as AuthedRequest).user.id;
    if (!memoryBelongsToUser(db, req.params.id, userId)) {
      res.status(404).json({ message: "记忆不存在" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ message: "请选择照片" });
      return;
    }

    const filename = basename(req.file.path);
    const url = publicUploadUrl(filename);
    const id = `photo_${nanoid(12)}`;
    db.prepare(
      "insert into photos (id, memory_id, storage_path, thumbnail_url, original_url, uploaded_by) values (?, ?, ?, ?, ?, ?)"
    ).run(id, req.params.id, req.file.path, url, url, userId);

    res.status(201).json({ photo: { id, thumbnailUrl: url, originalUrl: url, uploadedBy: userId } });
  });

  return router;
}
```

- [ ] **Step 5: Register memory routes and static uploads**

Modify `server/src/app.ts`:

```ts
import cors from "cors";
import express from "express";
import type { AppDatabase } from "./db/database.js";
import { createAuthRoutes } from "./http/authRoutes.js";
import { createMemoryRoutes } from "./http/memoryRoutes.js";
import { createSpaceRoutes } from "./http/spaceRoutes.js";

export type AppOptions = {
  db: AppDatabase;
  jwtSecret: string;
  clientOrigin: string;
  uploadDir?: string;
};

export function createApp(options: AppOptions) {
  const app = express();
  app.use(cors({ origin: options.clientOrigin }));
  app.use(express.json({ limit: "2mb" }));
  const uploadDir = options.uploadDir || "server/uploads";
  app.use("/uploads", express.static(uploadDir));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", createAuthRoutes(options.db, options.jwtSecret));
  app.use("/api/spaces", createSpaceRoutes(options.db, options.jwtSecret));
  app.use("/api/memories", createMemoryRoutes(options.db, options.jwtSecret, uploadDir));

  return app;
}
```

Modify `server/src/server.ts`:

```ts
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { createDatabase } from "./db/database.js";

const db = createDatabase(env.DATABASE_PATH);
const app = createApp({
  db,
  jwtSecret: env.JWT_SECRET,
  clientOrigin: env.CLIENT_ORIGIN,
  uploadDir: env.UPLOAD_DIR
});

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});
```

- [ ] **Step 6: Run memory tests and full backend tests**

Run:

```powershell
npm --workspace server run test
```

Expected: PASS for schema, auth, space, and memory route tests.

- [ ] **Step 7: Commit memory APIs**

Run:

```powershell
git add server/src
git commit -m "feat: add memory and photo api"
```

Expected: commit succeeds, or `git` absence is recorded.

---

### Task 5: Build Frontend API And Session Foundation

**Files:**

- Create: `client/src/testSetup.ts`
- Create: `client/src/api/types.ts`
- Create: `client/src/api/client.ts`
- Create: `client/src/api/client.test.ts`
- Create: `client/src/session/SessionProvider.tsx`
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`
- Create: `client/src/styles.css`

- [ ] **Step 1: Write failing API client test**

Create `client/src/testSetup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Create `client/src/api/client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";

describe("ApiClient", () => {
  it("adds bearer token and parses json", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ ok: true })
    });

    const api = new ApiClient("http://api.test", () => "abc", fetchMock as any);
    const result = await api.get("/api/health");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/health", {
      headers: { Authorization: "Bearer abc" }
    });
  });

  it("throws a readable message for failed responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ message: "请求失败" })
    });

    const api = new ApiClient("http://api.test", () => null, fetchMock as any);
    await expect(api.get("/bad")).rejects.toThrow("请求失败");
  });
});
```

- [ ] **Step 2: Run client test to verify it fails**

Run:

```powershell
npm --workspace client run test -- src/api/client.test.ts
```

Expected: FAIL because `client.ts` does not exist.

- [ ] **Step 3: Create API types**

Create `client/src/api/types.ts`:

```ts
export type User = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
};

export type CoupleSpace = {
  id: string;
  name: string;
  bindingCode: string;
  memberIds: string[];
  createdBy: string;
};

export type RevisitStatus = "again" | "normal" | "avoid";

export type MemoryPhoto = {
  id: string;
  thumbnailUrl: string;
  originalUrl: string;
  uploadedBy: string;
};

export type Memory = {
  id: string;
  placeName: string;
  poiId?: string | null;
  latitude: number;
  longitude: number;
  city?: string | null;
  memoryDate: string;
  rating: number;
  revisitStatus: RevisitStatus;
  notes?: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  foodItems: string[];
  photos: MemoryPhoto[];
};
```

- [ ] **Step 4: Create API client**

Create `client/src/api/client.ts`:

```ts
type TokenGetter = () => string | null;

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: TokenGetter,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, {});
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  async delete(path: string): Promise<void> {
    await this.request(path, { method: "DELETE" });
  }

  async upload<T>(path: string, file: File): Promise<T> {
    const form = new FormData();
    form.append("photo", file);
    return this.request<T>(path, { method: "POST", body: form });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined)
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers });
    if (res.status === 204) return undefined as T;

    const isJson = res.headers.get("content-type")?.includes("application/json");
    const data = isJson ? await res.json() : null;
    if (!res.ok) {
      throw new Error(data?.message || "请求失败");
    }
    return data as T;
  }
}
```

- [ ] **Step 5: Create session provider and app shell**

Create `client/src/session/SessionProvider.tsx`:

```tsx
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { ApiClient } from "../api/client";
import type { User } from "../api/types";

type SessionContextValue = {
  api: ApiClient;
  token: string | null;
  user: User | null;
  setSession: (next: { token: string; user: User } | null) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("memory-map-token"));
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem("memory-map-user");
    return raw ? (JSON.parse(raw) as User) : null;
  });

  const api = useMemo(
    () => new ApiClient(import.meta.env.VITE_API_BASE_URL || "http://localhost:5174", () => token),
    [token]
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      api,
      token,
      user,
      setSession(next) {
        if (!next) {
          localStorage.removeItem("memory-map-token");
          localStorage.removeItem("memory-map-user");
          setToken(null);
          setUser(null);
          return;
        }
        localStorage.setItem("memory-map-token", next.token);
        localStorage.setItem("memory-map-user", JSON.stringify(next.user));
        setToken(next.token);
        setUser(next.user);
      }
    }),
    [api, token, user]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}
```

Create `client/src/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { SessionProvider } from "./session/SessionProvider";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <SessionProvider>
    <App />
  </SessionProvider>
);
```

Create `client/src/App.tsx`:

```tsx
import { AuthPage } from "./features/auth/AuthPage";
import { SpaceGate } from "./features/space/SpaceGate";
import { useSession } from "./session/SessionProvider";

export function App() {
  const { user } = useSession();
  return user ? <SpaceGate /> : <AuthPage />;
}
```

Create `client/src/styles.css` with mobile-first base styles:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #172033;
  background: #f6f7f9;
}

button,
input,
textarea,
select {
  font: inherit;
}

.screen {
  min-height: 100vh;
  padding: 20px;
}

.panel {
  background: #fff;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  padding: 16px;
}

.field {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
}

.field input,
.field textarea,
.field select {
  width: 100%;
  border: 1px solid #cfd6e4;
  border-radius: 8px;
  padding: 11px 12px;
  background: #fff;
}

.primary-button {
  width: 100%;
  border: 0;
  border-radius: 8px;
  padding: 12px 14px;
  color: #fff;
  background: #1769e0;
}

.secondary-button {
  width: 100%;
  border: 1px solid #cfd6e4;
  border-radius: 8px;
  padding: 12px 14px;
  color: #172033;
  background: #fff;
}

.error {
  color: #b42318;
  font-size: 14px;
}
```

- [ ] **Step 6: Run client API tests**

Run:

```powershell
npm --workspace client run test -- src/api/client.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit frontend foundation**

Run:

```powershell
git add client/src client/index.html client/vite.config.ts client/tsconfig.json
git commit -m "feat: add frontend api and session foundation"
```

Expected: commit succeeds, or `git` absence is recorded.

---

### Task 6: Implement Login, Registration, And Binding UI

**Files:**

- Create: `client/src/features/auth/AuthPage.tsx`
- Create: `client/src/features/auth/AuthPage.test.tsx`
- Create: `client/src/features/space/SpaceGate.tsx`
- Create: `client/src/features/space/SpaceGate.test.tsx`
- Create: `client/src/features/map/AmapCanvas.tsx`

- [ ] **Step 1: Write failing auth UI test**

Create `client/src/features/auth/AuthPage.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthPage } from "./AuthPage";

vi.mock("../../session/SessionProvider", () => ({
  useSession: () => ({
    api: {
      post: vi.fn().mockResolvedValue({
        token: "token",
        user: { id: "user_1", email: "a@example.com", displayName: "阿一" }
      })
    },
    setSession: vi.fn()
  })
}));

describe("AuthPage", () => {
  it("renders register form fields", () => {
    render(<AuthPage />);
    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByLabelText("昵称")).toBeInTheDocument();
  });

  it("can switch to login mode", async () => {
    render(<AuthPage />);
    await userEvent.click(screen.getByRole("button", { name: "已有账号，去登录" }));
    expect(screen.queryByLabelText("昵称")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement `AuthPage`**

Create `client/src/features/auth/AuthPage.tsx`:

```tsx
import { useState } from "react";
import { useSession } from "../../session/SessionProvider";
import type { User } from "../../api/types";

type AuthResponse = {
  token: string;
  user: User;
};

export function AuthPage() {
  const { api, setSession } = useSession();
  const [mode, setMode] = useState<"register" | "login">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    try {
      const body = mode === "register" ? { email, password, displayName } : { email, password };
      const res = await api.post<AuthResponse>(`/api/auth/${mode}`, body);
      setSession(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    }
  }

  return (
    <main className="screen">
      <section className="panel">
        <h1>情侣美食记忆地图</h1>
        <p>把一起吃过的店、菜和回忆落到地图上。</p>
        <label className="field">
          邮箱
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="field">
          密码
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {mode === "register" && (
          <label className="field">
            昵称
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="primary-button" type="button" onClick={submit}>
          {mode === "register" ? "注册" : "登录"}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => setMode(mode === "register" ? "login" : "register")}
        >
          {mode === "register" ? "已有账号，去登录" : "没有账号，去注册"}
        </button>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Write failing binding UI test**

Create `client/src/features/space/SpaceGate.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SpaceGate } from "./SpaceGate";

vi.mock("../../session/SessionProvider", () => ({
  useSession: () => ({
    api: {
      get: vi.fn().mockResolvedValue({ space: null }),
      post: vi.fn()
    },
    user: { id: "user_1", email: "a@example.com", displayName: "阿一" }
  })
}));

describe("SpaceGate", () => {
  it("shows create and join actions when user has no space", async () => {
    render(<SpaceGate />);
    expect(await screen.findByText("还没有情侣空间")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建空间" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加入空间" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Implement `SpaceGate` with initial map export**

Create `client/src/features/space/SpaceGate.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { CoupleSpace } from "../../api/types";
import { useSession } from "../../session/SessionProvider";
import { MapHome } from "../map/AmapCanvas";

type SpaceResponse = {
  space: CoupleSpace | null;
};

export function SpaceGate() {
  const { api, user } = useSession();
  const [space, setSpace] = useState<CoupleSpace | null>(null);
  const [name, setName] = useState("我们的美食地图");
  const [bindingCode, setBindingCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadSpace() {
    setLoading(true);
    const res = await api.get<SpaceResponse>("/api/spaces/me");
    setSpace(res.space);
    setLoading(false);
  }

  useEffect(() => {
    loadSpace().catch((err) => {
      setError(err instanceof Error ? err.message : "空间加载失败");
      setLoading(false);
    });
  }, []);

  async function createSpace() {
    setError("");
    try {
      const res = await api.post<SpaceResponse>("/api/spaces", { name });
      setSpace(res.space);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    }
  }

  async function joinSpace() {
    setError("");
    try {
      const res = await api.post<SpaceResponse>("/api/spaces/join", { bindingCode });
      setSpace(res.space);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加入失败");
    }
  }

  if (loading) return <main className="screen">正在加载...</main>;
  if (space) return <MapHome space={space} currentUserId={user!.id} />;

  return (
    <main className="screen">
      <section className="panel">
        <h1>还没有情侣空间</h1>
        <p>创建一个空间，或输入对方给你的绑定码。</p>
        <label className="field">
          空间名称
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <button className="primary-button" type="button" onClick={createSpace}>
          创建空间
        </button>
        <label className="field">
          绑定码
          <input value={bindingCode} onChange={(event) => setBindingCode(event.target.value.toUpperCase())} />
        </label>
        <button className="secondary-button" type="button" onClick={joinSpace}>
          加入空间
        </button>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
```

Create `client/src/features/map/AmapCanvas.tsx` so the import resolves before the real map is implemented:

```tsx
import type { CoupleSpace } from "../../api/types";

export function MapHome({ space }: { space: CoupleSpace; currentUserId: string }) {
  return <main className="screen">{space.name} 地图加载中</main>;
}
```

- [ ] **Step 5: Run frontend auth and binding tests**

Run:

```powershell
npm --workspace client run test -- src/features/auth/AuthPage.test.tsx src/features/space/SpaceGate.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit auth UI**

Run:

```powershell
git add client/src
git commit -m "feat: add auth and couple binding ui"
```

Expected: commit succeeds, or `git` absence is recorded.

---

### Task 7: Implement Map Loading, Markers, And Manual Placement

**Files:**

- Create: `client/src/features/map/amapLoader.ts`
- Create: `client/src/features/map/amapLoader.test.ts`
- Modify: `client/src/features/map/AmapCanvas.tsx`

- [ ] **Step 1: Write failing Amap loader tests**

Create `client/src/features/map/amapLoader.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getAmapConfigMessage } from "./amapLoader";

describe("amapLoader", () => {
  it("returns a config message when key is missing", () => {
    expect(getAmapConfigMessage("", "")).toBe("请配置高德地图 Key 和安全密钥");
  });

  it("returns null when key and security code exist", () => {
    expect(getAmapConfigMessage("key", "security")).toBeNull();
  });
});
```

- [ ] **Step 2: Implement Amap loader helpers**

Create `client/src/features/map/amapLoader.ts`:

```ts
declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode: string };
    AMapLoader?: {
      load: (options: { key: string; version: string; plugins: string[] }) => Promise<any>;
    };
  }
}

export function getAmapConfigMessage(key: string | undefined, securityCode: string | undefined) {
  if (!key || !securityCode) return "请配置高德地图 Key 和安全密钥";
  return null;
}

export async function loadAmap(key: string, securityCode: string) {
  window._AMapSecurityConfig = { securityJsCode: securityCode };

  if (!window.AMapLoader) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://webapi.amap.com/loader.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("高德地图加载失败"));
      document.head.appendChild(script);
    });
  }

  if (!window.AMapLoader) throw new Error("高德地图加载失败");

  return window.AMapLoader.load({
    key,
    version: "2.0",
    plugins: ["AMap.PlaceSearch", "AMap.AutoComplete"]
  });
}
```

- [ ] **Step 3: Implement map canvas with marker callbacks**

Modify `client/src/features/map/AmapCanvas.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { CoupleSpace, Memory } from "../../api/types";
import { useSession } from "../../session/SessionProvider";
import { getAmapConfigMessage, loadAmap } from "./amapLoader";
import { MemorySheet } from "../memories/MemorySheet";

type MapHomeProps = {
  space: CoupleSpace;
  currentUserId: string;
};

export type DraftLocation = {
  placeName: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  poiId?: string | null;
};

export function MapHome({ space, currentUserId }: MapHomeProps) {
  const { api } = useSession();
  const mapEl = useRef<HTMLDivElement | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selected, setSelected] = useState<Memory | null>(null);
  const [draftLocation, setDraftLocation] = useState<DraftLocation | null>(null);
  const [error, setError] = useState("");

  const key = import.meta.env.VITE_AMAP_KEY as string | undefined;
  const security = import.meta.env.VITE_AMAP_SECURITY_CODE as string | undefined;
  const configMessage = useMemo(() => getAmapConfigMessage(key, security), [key, security]);

  async function loadMemories() {
    const res = await api.get<{ memories: Memory[] }>("/api/memories");
    setMemories(res.memories);
  }

  useEffect(() => {
    loadMemories().catch((err) => setError(err instanceof Error ? err.message : "记忆加载失败"));
    const onFocus = () => loadMemories().catch(() => undefined);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    if (!mapEl.current || configMessage || !key || !security) return;

    let map: any;
    let cancelled = false;

    loadAmap(key, security)
      .then((AMap) => {
        if (cancelled || !mapEl.current) return;
        map = new AMap.Map(mapEl.current, {
          zoom: 11,
          center: memories[0] ? [memories[0].longitude, memories[0].latitude] : [120.161, 30.266]
        });

        map.on("click", (event: any) => {
          setDraftLocation({
            placeName: "手动选择的位置",
            latitude: event.lnglat.lat,
            longitude: event.lnglat.lng,
            city: null,
            poiId: null
          });
        });

        for (const memory of memories) {
          const marker = new AMap.Marker({
            position: [memory.longitude, memory.latitude],
            title: memory.placeName
          });
          marker.on("click", () => setSelected(memory));
          map.add(marker);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "地图加载失败"));

    return () => {
      cancelled = true;
      if (map) map.destroy();
    };
  }, [configMessage, key, security, memories]);

  return (
    <main className="map-screen">
      <header className="map-header">
        <div>
          <strong>{space.name}</strong>
          <span>绑定码 {space.bindingCode}</span>
        </div>
      </header>
      {configMessage ? (
        <section className="map-fallback">
          <h1>{configMessage}</h1>
          <p>可以先查看列表；配置 Key 后会显示真实地图。</p>
        </section>
      ) : (
        <div className="map-canvas" ref={mapEl} />
      )}
      {error && <p className="floating-error">{error}</p>}
      <MemorySheet
        currentUserId={currentUserId}
        memories={memories}
        selected={selected}
        draftLocation={draftLocation}
        onSaved={() => {
          setDraftLocation(null);
          loadMemories();
        }}
        onSelect={setSelected}
      />
    </main>
  );
}
```

- [ ] **Step 4: Add map CSS**

Append to `client/src/styles.css`:

```css
.map-screen {
  height: 100vh;
  overflow: hidden;
  position: relative;
  background: #edf2f7;
}

.map-header {
  position: absolute;
  z-index: 2;
  top: 12px;
  left: 12px;
  right: 12px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.95);
}

.map-header span {
  display: block;
  color: #667085;
  font-size: 12px;
}

.map-canvas,
.map-fallback {
  width: 100%;
  height: 100%;
}

.map-fallback {
  display: grid;
  place-content: center;
  padding: 24px;
  text-align: center;
}

.floating-error {
  position: absolute;
  z-index: 3;
  top: 74px;
  left: 12px;
  right: 12px;
  border-radius: 8px;
  padding: 10px 12px;
  color: #b42318;
  background: #fff1f0;
}
```

- [ ] **Step 5: Run map tests**

Run:

```powershell
npm --workspace client run test -- src/features/map/amapLoader.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit map foundation**

Run:

```powershell
git add client/src/features/map client/src/styles.css
git commit -m "feat: add amap loading and map home"
```

Expected: commit succeeds, or `git` absence is recorded.

---

### Task 8: Implement Memory Form, Detail, Sheet, And Filters

**Files:**

- Create: `client/src/features/memories/filterMemories.ts`
- Create: `client/src/features/memories/filterMemories.test.ts`
- Create: `client/src/features/memories/MemoryForm.tsx`
- Create: `client/src/features/memories/MemoryDetail.tsx`
- Create: `client/src/features/memories/MemorySheet.tsx`

- [ ] **Step 1: Write failing filter tests**

Create `client/src/features/memories/filterMemories.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Memory } from "../../api/types";
import { filterMemories } from "./filterMemories";

const memories: Memory[] = [
  {
    id: "1",
    placeName: "火锅店",
    latitude: 30,
    longitude: 120,
    city: "杭州",
    memoryDate: "2026-05-31",
    rating: 5,
    revisitStatus: "again",
    notes: "",
    createdBy: "user_1",
    updatedBy: "user_1",
    createdAt: "",
    updatedAt: "",
    foodItems: ["牛肉", "冰粉"],
    photos: []
  },
  {
    id: "2",
    placeName: "面馆",
    latitude: 31,
    longitude: 121,
    city: "上海",
    memoryDate: "2026-05-30",
    rating: 3,
    revisitStatus: "normal",
    notes: "",
    createdBy: "user_2",
    updatedBy: "user_2",
    createdAt: "",
    updatedAt: "",
    foodItems: ["葱油拌面"],
    photos: []
  }
];

describe("filterMemories", () => {
  it("filters by city, rating, revisit status, keyword, and creator", () => {
    expect(
      filterMemories(memories, {
        city: "杭州",
        minRating: 5,
        revisitStatus: "again",
        keyword: "冰粉",
        creator: "user_1"
      }).map((memory) => memory.id)
    ).toEqual(["1"]);
  });
});
```

- [ ] **Step 2: Implement filter function**

Create `client/src/features/memories/filterMemories.ts`:

```ts
import type { Memory, RevisitStatus } from "../../api/types";

export type MemoryFilters = {
  city?: string;
  minRating?: number;
  revisitStatus?: RevisitStatus | "all";
  keyword?: string;
  creator?: string;
};

export function filterMemories(memories: Memory[], filters: MemoryFilters) {
  const keyword = filters.keyword?.trim().toLowerCase();

  return memories.filter((memory) => {
    if (filters.city && memory.city !== filters.city) return false;
    if (filters.minRating && memory.rating < filters.minRating) return false;
    if (filters.revisitStatus && filters.revisitStatus !== "all" && memory.revisitStatus !== filters.revisitStatus) {
      return false;
    }
    if (filters.creator && memory.createdBy !== filters.creator) return false;
    if (keyword) {
      const haystack = [memory.placeName, memory.notes || "", ...memory.foodItems].join(" ").toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}
```

- [ ] **Step 3: Implement memory form**

Create `client/src/features/memories/MemoryForm.tsx`:

```tsx
import { useState } from "react";
import type { Memory, RevisitStatus } from "../../api/types";
import { useSession } from "../../session/SessionProvider";
import type { DraftLocation } from "../map/AmapCanvas";

type Props = {
  draftLocation: DraftLocation;
  onSaved: (memory: Memory) => void;
};

export function MemoryForm({ draftLocation, onSaved }: Props) {
  const { api } = useSession();
  const [placeName, setPlaceName] = useState(draftLocation.placeName);
  const [memoryDate, setMemoryDate] = useState(new Date().toISOString().slice(0, 10));
  const [rating, setRating] = useState(5);
  const [revisitStatus, setRevisitStatus] = useState<RevisitStatus>("again");
  const [foodItems, setFoodItems] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    try {
      const created = await api.post<{ memory: Memory }>("/api/memories", {
        placeName,
        poiId: draftLocation.poiId || null,
        latitude: draftLocation.latitude,
        longitude: draftLocation.longitude,
        city: draftLocation.city || null,
        memoryDate,
        rating,
        revisitStatus,
        notes,
        foodItems: foodItems
          .split(/[，,]/)
          .map((item) => item.trim())
          .filter(Boolean)
      });

      if (photo) {
        try {
          await api.upload(`/api/memories/${created.memory.id}/photos`, photo);
        } catch {
          setError("文字已保存，照片上传失败，可以稍后编辑重传");
        }
      }

      onSaved(created.memory);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <section className="memory-form">
      <h2>添加美食记忆</h2>
      <label className="field">
        店名
        <input value={placeName} onChange={(event) => setPlaceName(event.target.value)} />
      </label>
      <label className="field">
        菜品
        <input value={foodItems} onChange={(event) => setFoodItems(event.target.value)} aria-label="菜品，用逗号分隔" />
      </label>
      <label className="field">
        日期
        <input type="date" value={memoryDate} onChange={(event) => setMemoryDate(event.target.value)} />
      </label>
      <label className="field">
        评分
        <select value={rating} onChange={(event) => setRating(Number(event.target.value))}>
          {[5, 4, 3, 2, 1].map((value) => (
            <option key={value} value={value}>
              {value} 分
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        状态
        <select value={revisitStatus} onChange={(event) => setRevisitStatus(event.target.value as RevisitStatus)}>
          <option value="again">想再去</option>
          <option value="normal">一般</option>
          <option value="avoid">不推荐</option>
        </select>
      </label>
      <label className="field">
        备注
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <label className="field">
        照片
        <input type="file" accept="image/*" onChange={(event) => setPhoto(event.target.files?.[0] || null)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary-button" type="button" onClick={save}>
        保存记忆
      </button>
    </section>
  );
}
```

- [ ] **Step 4: Implement memory detail and sheet**

Create `client/src/features/memories/MemoryDetail.tsx`:

```tsx
import type { Memory } from "../../api/types";

const statusText = {
  again: "想再去",
  normal: "一般",
  avoid: "不推荐"
};

export function MemoryDetail({ memory }: { memory: Memory }) {
  return (
    <section className="memory-detail">
      <h2>{memory.placeName}</h2>
      <p>
        {memory.rating} 分 · {statusText[memory.revisitStatus]} · {memory.memoryDate}
      </p>
      <p>{memory.foodItems.join("、") || "还没有记录菜品"}</p>
      {memory.notes && <p>{memory.notes}</p>}
      <div className="photo-strip">
        {memory.photos.map((photo) => (
          <img key={photo.id} src={photo.thumbnailUrl} alt={`${memory.placeName} 的照片`} />
        ))}
      </div>
    </section>
  );
}
```

Create `client/src/features/memories/MemorySheet.tsx`:

```tsx
import { useMemo, useState } from "react";
import type { Memory, RevisitStatus } from "../../api/types";
import type { DraftLocation } from "../map/AmapCanvas";
import { filterMemories } from "./filterMemories";
import { MemoryDetail } from "./MemoryDetail";
import { MemoryForm } from "./MemoryForm";

type Props = {
  currentUserId: string;
  memories: Memory[];
  selected: Memory | null;
  draftLocation: DraftLocation | null;
  onSaved: () => void;
  onSelect: (memory: Memory) => void;
};

export function MemorySheet({ currentUserId, memories, selected, draftLocation, onSaved, onSelect }: Props) {
  const [keyword, setKeyword] = useState("");
  const [revisitStatus, setRevisitStatus] = useState<RevisitStatus | "all">("all");

  const filtered = useMemo(
    () => filterMemories(memories, { keyword, revisitStatus }),
    [memories, keyword, revisitStatus]
  );

  return (
    <aside className="memory-sheet">
      {draftLocation && <MemoryForm draftLocation={draftLocation} onSaved={onSaved} />}
      {selected && <MemoryDetail memory={selected} />}
      {!draftLocation && !selected && (
        <>
          <div className="sheet-controls">
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} aria-label="搜索菜品或店名" />
            <select value={revisitStatus} onChange={(event) => setRevisitStatus(event.target.value as RevisitStatus | "all")}>
              <option value="all">全部</option>
              <option value="again">想再去</option>
              <option value="normal">一般</option>
              <option value="avoid">不推荐</option>
            </select>
          </div>
          {filtered.length === 0 ? (
            <p>还没有美食记忆。点击地图放一个点，先记录第一家店。</p>
          ) : (
            filtered.map((memory) => (
              <button className="memory-row" key={memory.id} type="button" onClick={() => onSelect(memory)}>
                <strong>{memory.placeName}</strong>
                <span>{memory.foodItems.join("、")}</span>
                <span>{memory.createdBy === currentUserId ? "我添加的" : "对方添加的"}</span>
              </button>
            ))
          )}
        </>
      )}
    </aside>
  );
}
```

- [ ] **Step 5: Add sheet CSS**

Append to `client/src/styles.css`:

```css
.memory-sheet {
  position: absolute;
  z-index: 4;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 58vh;
  overflow: auto;
  border-radius: 8px 8px 0 0;
  border: 1px solid #e4e7ec;
  background: #fff;
  padding: 14px;
}

.sheet-controls {
  display: grid;
  grid-template-columns: 1fr 110px;
  gap: 8px;
  margin-bottom: 10px;
}

.sheet-controls input,
.sheet-controls select {
  min-width: 0;
  border: 1px solid #cfd6e4;
  border-radius: 8px;
  padding: 10px;
}

.memory-row {
  width: 100%;
  display: grid;
  gap: 4px;
  text-align: left;
  border: 1px solid #eef1f5;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
  margin-bottom: 8px;
}

.memory-row span,
.memory-detail p {
  color: #667085;
  font-size: 14px;
}

.photo-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}

.photo-strip img {
  width: 88px;
  height: 88px;
  object-fit: cover;
  border-radius: 8px;
}
```

- [ ] **Step 6: Run memory UI tests**

Run:

```powershell
npm --workspace client run test -- src/features/memories/filterMemories.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit memory UI**

Run:

```powershell
git add client/src/features/memories client/src/styles.css
git commit -m "feat: add memory sheet and form"
```

Expected: commit succeeds, or `git` absence is recorded.

---

### Task 9: End-To-End Verification And Developer Docs

**Files:**

- Create: `README.md`
- Modify: `client/src/features/map/AmapCanvas.tsx`
- Modify: `server/src/http/memoryRoutes.test.ts`

- [ ] **Step 1: Add backend test for page-focus synchronization contract**

Modify `server/src/http/memoryRoutes.test.ts` by adding this test:

```ts
it("returns updated memories after another user creates one", async () => {
  const { app } = createTestApp();
  const ownerToken = await register(app, "sync-owner@example.com");
  const partnerToken = await register(app, "sync-partner@example.com");
  const space = await createSpace(app, ownerToken);

  await request(app)
    .post("/api/spaces/join")
    .set("Authorization", `Bearer ${partnerToken}`)
    .send({ bindingCode: space.bindingCode });

  await request(app)
    .post("/api/memories")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({
      placeName: "同步测试店",
      latitude: 30,
      longitude: 120,
      city: "杭州",
      memoryDate: "2026-05-31",
      rating: 5,
      revisitStatus: "again",
      notes: "",
      foodItems: ["小笼包"]
    });

  const partnerList = await request(app)
    .get("/api/memories")
    .set("Authorization", `Bearer ${partnerToken}`);

  expect(partnerList.body.memories.map((memory: any) => memory.placeName)).toContain("同步测试店");
});
```

- [ ] **Step 2: Add README**

Create `README.md`:

```md
# 情侣美食记忆地图

移动端优先的网页 MVP，用来保存两个人一起吃过的店、菜品和回忆，并把它们放到共同地图上。

## 本地启动

1. 复制环境变量：

   ```powershell
   Copy-Item .env.example .env
   ```

2. 填写 `.env`：

   - `JWT_SECRET` 改成至少 12 位的本地密钥。
   - `VITE_AMAP_KEY` 填高德 Web JS API Key。
   - `VITE_AMAP_SECURITY_CODE` 填高德 JS API 安全密钥。

3. 安装依赖：

   ```powershell
   npm install
   ```

4. 启动前端和后端：

   ```powershell
   npm run dev
   ```

5. 打开：

   ```text
   http://127.0.0.1:5173
   ```

## 验证

```powershell
npm test
npm run build
```

## MVP 范围

- 两个用户注册登录。
- 创建和加入情侣空间。
- 地图首页。
- 搜索或手动放点添加美食记忆。
- 保存菜品、评分、是否想再去、备注、日期和照片。
- 另一位用户刷新或切回页面后看到最新记忆。
- 仅允许访问自己的情侣空间。
```

- [ ] **Step 3: Run all tests**

Run:

```powershell
npm test
```

Expected: backend and frontend tests pass.

- [ ] **Step 4: Run production build**

Run:

```powershell
npm run build
```

Expected: server TypeScript build passes and client Vite build produces `client/dist`.

- [ ] **Step 5: Manually verify local app**

Run:

```powershell
Copy-Item .env.example .env
npm run dev
```

Manual check:

- Open `http://127.0.0.1:5173`.
- Register user A.
- Create a couple space and copy its binding code.
- Open a second private browser session.
- Register user B.
- Join with the binding code.
- If Amap keys are configured, verify the map appears.
- If Amap keys are empty, verify the map configuration message appears and the memory list area remains usable.
- Click the map or use manual placement once available.
- Add a memory with dish names, rating, revisit status, notes, date, and photo.
- Refresh user B and verify the memory appears.

- [ ] **Step 6: Commit verification docs**

Run:

```powershell
git add README.md server/src/http/memoryRoutes.test.ts
git commit -m "docs: add local verification guide"
```

Expected: commit succeeds, or `git` absence is recorded.

## Plan Self-Review

- Spec coverage: authentication, binding, map home, manual placement, memories, photos, filters, permissions, map failure, upload failure, and refresh synchronization all have tasks.
- Red-flag scan: no unfinished markers or vague implementation steps remain.
- Type consistency: shared names are `User`, `CoupleSpace`, `Memory`, `FoodItem`, `Photo`, `revisitStatus`, `bindingCode`, `coupleSpaceId`, and match between backend responses and frontend types.
