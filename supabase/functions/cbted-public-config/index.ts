// Public configuration endpoint for the static CBTeD project manager.
// Only publishable API keys are exposed. Never return SUPABASE_SECRET_KEYS,
// SUPABASE_SERVICE_ROLE_KEY or any database password.
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=120",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey"
};

Deno.serve((request: Request): Response => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers });
  }
  try {
    const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    const keys = raw ? JSON.parse(raw) as Record<string, string> : {};
    const publishableKey = keys.default || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const url = Deno.env.get("SUPABASE_URL");
    if (!url || !publishableKey || !publishableKey.startsWith("sb_publishable_")) {
      return Response.json({ error: "Public application configuration unavailable" }, {
        status: 503, headers: { ...headers, "Cache-Control": "no-store" }
      });
    }
    return Response.json({
      url,
      publishableKey,
      bucket: "cbted-project-assets"
    }, { headers });
  } catch (_error) {
    return Response.json({ error: "Unable to load public application configuration" }, {
      status: 500, headers: { ...headers, "Cache-Control": "no-store" }
    });
  }
});
