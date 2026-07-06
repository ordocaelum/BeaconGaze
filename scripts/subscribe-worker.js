/**
 * BeaconGaze subscribe worker (Cloudflare Workers, free tier).
 * Receives {email} from the site and appends it to data/subscribers.csv
 * in the PRIVATE GitHub repo via the Contents API.
 *
 * Setup (5 minutes):
 *  1. GitHub -> Settings -> Developer settings -> Fine-grained token:
 *     repository access: ordocaelum/BeaconGaze only; permission: Contents (read/write).
 *  2. Cloudflare dash -> Workers -> Create -> paste this file.
 *  3. Worker Settings -> Variables -> add SECRET  GH_TOKEN = <your token>
 *     and plain vars GH_REPO = "ordocaelum/BeaconGaze", ALLOW_ORIGIN = "https://beacongaze.com".
 *  4. Deploy, copy the worker URL into SIGNUP_ENDPOINT in index.html.
 *
 * The token never touches the browser: a static page cannot hold a repo
 * token safely (view-source exposes it even if the repo is private).
 */
export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return new Response("POST only", { status: 405, headers: cors });

    let body;
    try { body = await req.json(); } catch { return new Response("bad json", { status: 400, headers: cors }); }
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      return new Response("bad email", { status: 400, headers: cors });

    const path = "data/subscribers.csv";
    const api = `https://api.github.com/repos/${env.GH_REPO}/contents/${path}`;
    const gh = { "Authorization": `Bearer ${env.GH_TOKEN}`, "User-Agent": "beacongaze-subscribe",
                 "Accept": "application/vnd.github+json" };

    // read current file (if any)
    let sha, csv = "email,timestamp,source\n";
    const cur = await fetch(api, { headers: gh });
    if (cur.ok) {
      const j = await cur.json();
      sha = j.sha;
      csv = atob(j.content.replace(/\n/g, ""));
      if (csv.split("\n").some(l => l.split(",")[0] === email))
        return new Response(JSON.stringify({ ok: true, duplicate: true }),
          { headers: { ...cors, "Content-Type": "application/json" } });
    }
    csv += `${email},${new Date().toISOString()},${(body.source || "site").replace(/[,\n]/g, "")}\n`;

    const put = await fetch(api, {
      method: "PUT", headers: gh,
      body: JSON.stringify({
        message: `subscribe: ${email.split("@")[1]} reader`,
        content: btoa(unescape(encodeURIComponent(csv))),
        ...(sha ? { sha } : {})
      })
    });
    if (!put.ok) return new Response("github error", { status: 502, headers: cors });
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  }
};
