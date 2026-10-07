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

async function stats(env, team) {
  const n = await env.DB.prepare("SELECT count(*) AS n FROM picks WHERE team = ?").bind(team).first("n");
  const { results } = await env.DB.prepare(
    "SELECT j.value AS id, count(*) AS c FROM picks, json_each(picks.ids) AS j WHERE picks.team = ? GROUP BY j.value"
  ).bind(team).all();
  return { n, counts: Object.fromEntries(results.map((r) => [r.id, r.c])) };
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
  const existing = await env.DB.prepare("SELECT 1 FROM picks WHERE team = ? AND voter = ?").bind(team, voter).first();
  const ipHash = await sha256((req.headers.get("CF-Connecting-IP") || "") + "|" + (env.IP_SALT || "cpbl-reserve"));
  if (!existing) {
    const since = new Date(Date.now() - 86400000).toISOString();
    const recent = await env.DB.prepare("SELECT count(*) AS n FROM picks WHERE team = ? AND ip_hash = ? AND created_at > ?")
      .bind(team, ipHash, since).first("n");
    if (recent >= NEW_VOTERS_PER_IP_PER_DAY) return json({ error: "rate_limited" }, 429);
  }
  if (uniq.length === 0) {
    await env.DB.prepare("DELETE FROM picks WHERE team = ? AND voter = ?").bind(team, voter).run();
    return json({ ok: true, at: now, ids: [] });
  }
  await env.DB.prepare(
    `INSERT INTO picks (team, voter, ids, ip_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (team, voter) DO UPDATE SET ids = excluded.ids, updated_at = excluded.updated_at`
  ).bind(team, voter, JSON.stringify(uniq.sort()), ipHash, now, now).run();
  return json({ ok: true, at: now, ids: uniq });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const team = url.searchParams.get("team");
    try {
      if (url.pathname === "/stats" && req.method === "GET") {
        if (!ALLOWED[team]) return json({ error: "unknown_team" }, 400);
        return json(await stats(env, team), 200, { "Cache-Control": "public, max-age=10" });
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
