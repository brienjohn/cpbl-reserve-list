import ROSTER from "./roster.json";

const ALLOWED = Object.fromEntries(Object.entries(ROSTER).map(([t, ids]) => [t, new Set(ids)]));
const LIMIT = 60;
const NEW_VOTERS_PER_IP_PER_DAY = 20;
const VOTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra },
  });

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Rebuilds a team's totals from every pick. Expensive (reads every stored id),
// so it only runs when the tally row is missing.
async function rebuildTally(env, team) {
  const n = await env.DB.prepare("SELECT count(*) AS n FROM picks WHERE team = ?").bind(team).first("n");
  const { results } = await env.DB.prepare(
    "SELECT j.value AS id, count(*) AS c FROM picks, json_each(picks.ids) AS j WHERE picks.team = ? GROUP BY j.value"
  ).bind(team).all();
  const counts = Object.fromEntries(results.map((r) => [r.id, r.c]));
  await env.DB.prepare("INSERT OR REPLACE INTO tally (team, n, counts, updated_at) VALUES (?, ?, ?, ?)")
    .bind(team, n, JSON.stringify(counts), new Date().toISOString()).run();
  return { n, counts };
}

async function stats(env, team) {
  const row = await env.DB.prepare("SELECT n, counts FROM tally WHERE team = ?").bind(team).first();
  if (!row) return rebuildTally(env, team);
  return { n: row.n, counts: JSON.parse(row.counts) };
}

// Applies per-player +1/-1 changes inside one UPDATE so concurrent submits can't overwrite each other.
function tallyUpdate(env, team, deltas, dn, now) {
  let expr = "counts";
  for (const [id, d] of deltas) {
    expr = `json_set(${expr}, '$."${id}"', coalesce(json_extract(counts, '$."${id}"'), 0) + (${d}))`;
  }
  return env.DB.prepare(`UPDATE tally SET n = n + (?), counts = ${expr}, updated_at = ? WHERE team = ?`).bind(dn, now, team);
}

async function savePicks(req, env) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const { team, voter, ids } = body || {};
  if (!ALLOWED[team]) return json({ error: "unknown_team" }, 400);
  if (typeof voter !== "string" || !VOTER.test(voter)) return json({ error: "bad_voter" }, 400);
  if (!Array.isArray(ids) || ids.length > LIMIT) return json({ error: "bad_ids" }, 400);
  const uniq = [...new Set(ids)];
  if (uniq.length !== ids.length || !uniq.every((id) => ALLOWED[team].has(id))) return json({ error: "bad_ids" }, 400);

  const now = new Date().toISOString();
  const existing = await env.DB.prepare("SELECT ids FROM picks WHERE team = ? AND voter = ?").bind(team, voter).first();
  const ipHash = await sha256((req.headers.get("CF-Connecting-IP") || "") + "|" + (env.IP_SALT || "cpbl-reserve"));
  if (!existing) {
    const since = new Date(Date.now() - 86400000).toISOString();
    const recent = await env.DB.prepare("SELECT count(*) AS n FROM picks WHERE team = ? AND ip_hash = ? AND created_at > ?")
      .bind(team, ipHash, since).first("n");
    if (recent >= NEW_VOTERS_PER_IP_PER_DAY) return json({ error: "rate_limited" }, 429);
  }
  // ids are validated against the roster (10-digit strings), so they are safe inside the JSON paths below.
  const oldIds = new Set(existing ? JSON.parse(existing.ids) : []);
  const newIds = new Set(uniq);
  const deltas = [];
  for (const id of newIds) if (!oldIds.has(id)) deltas.push([id, 1]);
  for (const id of oldIds) if (!newIds.has(id)) deltas.push([id, -1]);
  const dn = (newIds.size > 0 ? 1 : 0) - (oldIds.size > 0 ? 1 : 0);

  const writes = [];
  if (newIds.size === 0) {
    writes.push(env.DB.prepare("DELETE FROM picks WHERE team = ? AND voter = ?").bind(team, voter));
  } else {
    writes.push(env.DB.prepare(
      `INSERT INTO picks (team, voter, ids, ip_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (team, voter) DO UPDATE SET ids = excluded.ids, updated_at = excluded.updated_at`
    ).bind(team, voter, JSON.stringify([...newIds].sort()), ipHash, now, now));
  }
  if (deltas.length || dn) writes.push(tallyUpdate(env, team, deltas, dn, now));
  await env.DB.batch(writes);
  return json({ ok: true, at: now, ids: [...newIds] });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const team = url.searchParams.get("team");
    try {
      if (url.pathname === "/stats" && req.method === "GET") {
        if (!ALLOWED[team]) return json({ error: "unknown_team" }, 400);
        // Edge-cache per colo for 20s; ?fresh=1 (sent right after a viewer's own submit) skips the cached copy.
        const cache = caches.default;
        const key = new Request(`${url.origin}/stats?team=${team}`);
        if (!url.searchParams.has("fresh")) {
          const hit = await cache.match(key);
          if (hit) return hit;
        }
        const res = json(await stats(env, team), 200, { "Cache-Control": "public, max-age=20" });
        ctx.waitUntil(cache.put(key, res.clone()));
        return res;
      }
      if (url.pathname === "/mine" && req.method === "GET") {
        const voter = url.searchParams.get("voter") || "";
        if (!ALLOWED[team] || !VOTER.test(voter)) return json({ error: "bad_request" }, 400);
        const row = await env.DB.prepare("SELECT ids, updated_at FROM picks WHERE team = ? AND voter = ?").bind(team, voter).first();
        return json(row ? { ids: JSON.parse(row.ids), at: row.updated_at } : { ids: null });
      }
      if (url.pathname === "/picks" && req.method === "POST") return await savePicks(req, env);
      return json({ error: "not_found" }, 404);
    } catch (e) {
      return json({ error: "server_error" }, 500);
    }
  },
};
