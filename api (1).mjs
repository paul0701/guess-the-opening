import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import OPENINGS from "./openings.json" with { type: "json" };

const TOKEN_DAYS = 30;
const LAUNCH = Date.UTC(2026, 9, 17);
const DAILY_COUNT = 5;
const DAILY_MAX_SCORE = 3000;
const NAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
const opts = (name) => ({ name, consistency: "strong" });

const json = (data, status = 200) => Response.json(data, { status });
class HttpError extends Error { constructor(status, detail) { super(detail); this.status = status; this.detail = detail; } }
const fail = (status, detail) => { throw new HttpError(status, detail); };

const nowIso = () => new Date().toISOString();
const todayStr = () => new Date().toISOString().slice(0, 10);

// ---------- secrets / tokens ----------
let secretCache;
async function secret() {
  if (secretCache) return secretCache;
  const env = Netlify.env.get("JWT_SECRET");
  if (env) return (secretCache = env);
  const cfg = getStore(opts("config"));
  let s = await cfg.get("jwt-secret");
  if (!s) {
    await cfg.set("jwt-secret", crypto.randomBytes(48).toString("hex"), { onlyIfNew: true });
    s = await cfg.get("jwt-secret");
  }
  return (secretCache = s);
}
const b64 = (x) => Buffer.from(x).toString("base64url");
async function makeToken(user) {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify({ sub: user.lower, exp: Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86400 }));
  const sig = crypto.createHmac("sha256", await secret()).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
async function readToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) fail(401, "Invalid token");
  const good = crypto.createHmac("sha256", await secret()).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], "base64url");
  if (given.length !== good.length || !crypto.timingSafeEqual(given, good)) fail(401, "Invalid token");
  let p;
  try { p = JSON.parse(Buffer.from(parts[1], "base64url").toString()); } catch { fail(401, "Invalid token"); }
  if (!p.exp || p.exp < Date.now() / 1000) fail(401, "Session expired");
  return p;
}

// ---------- passwords ----------
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 32, { N: 16384 }, (e, k) => (e ? rej(e) : res(k))));
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString("hex")}:${(await scrypt(pw, salt)).toString("hex")}`;
}
async function verifyPassword(pw, stored) {
  const [s, h] = stored.split(":");
  const want = Buffer.from(h, "hex");
  const got = await scrypt(pw, Buffer.from(s, "hex"));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

const publicUser = (u) => ({ id: u.id, username: u.username });

async function currentUser(req) {
  const h = req.headers.get("authorization") || "";
  if (!h.startsWith("Bearer ")) fail(401, "Not authenticated");
  const p = await readToken(h.slice(7));
  const user = await getStore(opts("users")).get(p.sub, { type: "json" });
  if (!user) fail(401, "User not found");
  return user;
}

async function body(req) {
  try { const b = await req.json(); return b && typeof b === "object" ? b : {}; } catch { return {}; }
}

// ---------- daily ----------
function allLines() {
  const lines = [];
  for (const s of ["w", "b"]) for (const f of OPENINGS[s]) for (const v of f.vars) lines.push({ side: s, family_id: f.id, var_id: v.id });
  return lines.sort((a, b) => (a.var_id < b.var_id ? -1 : a.var_id > b.var_id ? 1 : 0));
}
function dailyPick(d) {
  const lines = allLines();
  const picked = [], fams = new Set();
  for (let i = 0; picked.length < DAILY_COUNT; i++) {
    const h = BigInt("0x" + crypto.createHash("sha256").update(`gto-daily|${d}|${i}`).digest("hex"));
    const cand = lines[Number(h % BigInt(lines.length))];
    if (!fams.has(cand.family_id)) { fams.add(cand.family_id); picked.push(cand); }
  }
  return picked;
}
async function readAll(store, prefix) {
  const { blobs } = await store.list({ prefix });
  const rows = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return rows.filter(Boolean);
}

// ---------- handlers ----------
const routes = {
  "POST /auth/register": async (req) => {
    const b = await body(req);
    const name = String(b.username ?? "").trim();
    const pw = String(b.password ?? "");
    if (!NAME_RE.test(name)) fail(400, "Username must be 3-20 letters, numbers, _ or -");
    if (pw.length < 6) fail(400, "Password must be at least 6 characters");
    const user = { id: crypto.randomUUID(), username: name, lower: name.toLowerCase(), password_hash: await hashPassword(pw), created_at: nowIso() };
    const { modified } = await getStore(opts("users")).setJSON(user.lower, user, { onlyIfNew: true });
    if (!modified) fail(409, "That username is taken");
    return json({ token: await makeToken(user), user: publicUser(user) });
  },

  "POST /auth/login": async (req, ctx) => {
    const b = await body(req);
    const name = String(b.username ?? "").trim().toLowerCase();
    const pw = String(b.password ?? "");
    const attempts = getStore(opts("attempts"));
    const ident = `${ctx.ip || "x"}:${name}`.slice(0, 200);
    const att = await attempts.get(ident, { type: "json" });
    if (att && att.count >= 5 && att.locked_until > nowIso()) fail(429, "Too many attempts. Try again in 15 minutes.");
    const user = NAME_RE.test(name) ? await getStore(opts("users")).get(name, { type: "json" }) : null;
    if (!user || !(await verifyPassword(pw, user.password_hash))) {
      const count = (att?.count || 0) + 1;
      await attempts.setJSON(ident, { count, locked_until: count >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : "" });
      fail(401, "Wrong username or password");
    }
    if (att) await attempts.delete(ident);
    return json({ token: await makeToken(user), user: publicUser(user) });
  },

  "GET /auth/me": async (req) => json(publicUser(await currentUser(req))),

  "GET /progress": async (req) => {
    const u = await currentUser(req);
    const doc = await getStore(opts("progress")).get(u.lower, { type: "json" });
    return json({ progress: doc ? doc.data : null });
  },

  "PUT /progress": async (req) => {
    const u = await currentUser(req);
    const b = await body(req);
    if (!b.progress || typeof b.progress !== "object" || Array.isArray(b.progress)) fail(422, "progress must be an object");
    if (JSON.stringify(b.progress).length > 900000) fail(413, "Progress too large");
    const xp = Math.max(0, parseInt(b.progress.xp, 10) || 0);
    await getStore(opts("progress")).setJSON(u.lower, { data: b.progress, xp, username: u.username, updated_at: nowIso() });
    await getStore(opts("xp")).setJSON(u.lower, { username: u.username, xp });
    return json({ ok: true });
  },

  "GET /daily": async () => {
    const d = todayStr();
    const number = Math.round((Date.parse(d) - LAUNCH) / 86400000) + 1;
    return json({ date: d, number, items: dailyPick(d) });
  },

  "GET /daily/status": async (req) => {
    const u = await currentUser(req);
    const doc = await getStore(opts("daily")).get(`${todayStr()}/${u.lower}`, { type: "json" });
    return json({ played: !!doc, score: doc ? doc.score : null, grid: doc ? doc.grid : [] });
  },

  "POST /daily/submit": async (req) => {
    const u = await currentUser(req);
    const b = await body(req);
    if (b.date !== todayStr()) fail(400, "This daily challenge is closed");
    const score = b.score;
    if (!Number.isInteger(score) || score < 0 || score > DAILY_MAX_SCORE) fail(400, "Invalid score");
    const grid = (Array.isArray(b.grid) ? b.grid : []).filter((x) => typeof x === "string").slice(0, DAILY_COUNT).map((x) => x.slice(0, 16));
    const store = getStore(opts("daily"));
    const rec = { username: u.username, date: b.date, score, grid, created_at: nowIso() };
    const { modified } = await store.setJSON(`${b.date}/${u.lower}`, rec, { onlyIfNew: true });
    if (!modified) fail(409, "You have already played today's challenge");
    const all = await readAll(store, `${b.date}/`);
    return json({ ok: true, rank: all.filter((r) => r.score > score).length + 1 });
  },

  "GET /daily/leaderboard": async (req) => {
    const q = new URL(req.url).searchParams.get("date");
    const d = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayStr();
    const all = await readAll(getStore(opts("daily")), `${d}/`);
    all.sort((a, b) => b.score - a.score || (a.created_at < b.created_at ? -1 : 1));
    return json({ date: d, rows: all.slice(0, 50).map((r) => ({ username: r.username, score: r.score, grid: r.grid })) });
  },

  "GET /leaderboard/xp": async () => {
    const all = await readAll(getStore(opts("xp")));
    all.sort((a, b) => b.xp - a.xp);
    return json({ rows: all.slice(0, 50).map((r) => ({ username: r.username, xp: r.xp })) });
  },

  "GET /": async () => json({ message: "Guess the Opening API" }),
};

export default async (req, ctx) => {
  const path = new URL(req.url).pathname.replace(/^\/api/, "").replace(/(.)\/$/, "$1") || "/";
  const handler = routes[`${req.method} ${path}`];
  if (!handler) return json({ detail: "Not found" }, 404);
  try {
    return await handler(req, ctx);
  } catch (e) {
    if (e instanceof HttpError) return json({ detail: e.detail }, e.status);
    console.error(e);
    return json({ detail: "Server error" }, 500);
  }
};

export const config = { path: ["/api", "/api/*"] };
