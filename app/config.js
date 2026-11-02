// No credentials are committed here. The public-only config endpoint returns
// the Supabase URL, storage bucket name and a browser-safe publishable key.
// It never returns a database password or any secret/service-role key.
const CONFIG_ENDPOINT = "https://dmzzyfiwtosxtyekpbfi.supabase.co/functions/v1/cbted-public-config";

export async function loadPublicConfig() {
  const response = await fetch(CONFIG_ENDPOINT, { method: "GET" });
  if (!response.ok) throw new Error("CBTeD configuration service returned HTTP " + response.status);
  const config = await response.json();
  if (!config.url || !String(config.publishableKey || "").startsWith("sb_publishable_")) {
    throw new Error("CBTeD public configuration is incomplete.");
  }
  if (config.bucket !== "cbted-project-assets") {
    throw new Error("Unexpected project storage configuration.");
  }
  return config;
}
