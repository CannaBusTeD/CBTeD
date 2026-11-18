// Live check of the deployed CBTeD connector and its published sign-in page.
// It proves, from outside, everything Claude needs before it can start signing in:
//   1. an anonymous "initialize" is refused with HTTP 401 and a standard WWW-Authenticate challenge;
//   2. the challenge points at protected-resource metadata that names CBTeD's Supabase sign-in server;
//   3. that sign-in server publishes discovery metadata with client registration and PKCE (S256);
//   4. public rules still work without signing in, and private tools still give ChatGPT its sign-in hint;
//   5. the published sign-in page is live and trusts Claude's callback, and only Claude's real one.
// It only reads. It registers no client, signs nobody in, starts no work and changes nothing.
// It never runs code downloaded from the site: published files are compared with this checkout and read as text.
// Like the other live checks, it tests what is deployed right now, not the code in a pull request.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";

const SUPABASE = "https://dmzzyfiwtosxtyekpbfi.supabase.co";
const MCP = SUPABASE + "/functions/v1/cbted-mcp";
const METADATA = MCP + "/.well-known/oauth-protected-resource";
const ISSUER = SUPABASE + "/auth/v1";
const SITE = "https://cannabusted.github.io/CBTeD/oauth/consent/";
const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const signal = () => AbortSignal.timeout(20000);
const rpc = (body, authorization) => fetch(MCP, {
  method: "POST", signal: signal(),
  headers: {"content-type": "application/json", "accept": "application/json, text/event-stream", ...(authorization ? {authorization} : {})},
  body: JSON.stringify(body)
});
const initialize = {jsonrpc: "2.0", id: 1, method: "initialize",
  params: {protocolVersion: "2025-06-18", capabilities: {}, clientInfo: {name: "cbted-live-check", version: "1"}}};

// 1. An anonymous connection is refused with the standard challenge, so Claude starts signing in.
const anonymous = await rpc(initialize);
assert.equal(anonymous.status, 401, "An anonymous initialize must get HTTP 401 so Claude starts signing in");
const challenge = anonymous.headers.get("www-authenticate") || "";
assert.match(challenge, /^Bearer /, "The 401 must carry a Bearer challenge");
assert.ok(challenge.includes('resource_metadata="' + METADATA + '"'), "The challenge must point at the protected-resource metadata");
assert.match(anonymous.headers.get("access-control-expose-headers") || "", /www-authenticate/i, "Browser clients must be allowed to read the challenge");
assert.equal((await anonymous.json()).error, "invalid_token");
const forged = await rpc(initialize, "Bearer not-a-real-token");
assert.equal(forged.status, 401, "A made-up token must be refused too");
await forged.text();
console.log("1. Anonymous and made-up connections get 401 with the sign-in challenge.");

// 2. The protected-resource metadata names CBTeD's sign-in server.
const metadataReply = await fetch(METADATA, {signal: signal()});
assert.equal(metadataReply.status, 200, "Protected-resource metadata must be published");
const metadata = await metadataReply.json();
assert.equal(metadata.resource, MCP, "The resource must be exactly the connector address");
assert.ok(metadata.authorization_servers?.includes(ISSUER), "The sign-in server must be CBTeD's Supabase Auth");
console.log("2. Protected-resource metadata names " + ISSUER);

// 3. Sign-in server discovery, in the order MCP clients try it. At least one standard address must answer.
const discovery = [
  SUPABASE + "/.well-known/oauth-authorization-server/auth/v1",
  SUPABASE + "/.well-known/openid-configuration/auth/v1",
  ISSUER + "/.well-known/openid-configuration"
];
let server = null;
for (const address of discovery) {
  const reply = await fetch(address, {signal: signal()});
  console.log("   discovery " + reply.status + " " + address);
  if (reply.ok && !server) server = await reply.json(); else await reply.text();
}
assert.ok(server, "At least one standard discovery address must answer");
assert.equal(server.issuer, ISSUER, "Discovery must name the same issuer as the connector");
for (const key of ["authorization_endpoint", "token_endpoint", "registration_endpoint"]) {
  assert.ok(server[key], "Discovery must publish " + key);
}
assert.ok(server.code_challenge_methods_supported?.includes("S256"), "Sign-in must support PKCE with S256");
console.log("3. Discovery publishes sign-in, token and client-registration addresses, with PKCE S256.");

// 4. Behaviour that must not change: public rules without signing in; private tools refuse with a hint.
const rules = await (await rpc({jsonrpc: "2.0", id: 2, method: "tools/call", params: {name: "cbted_get_rulebook", arguments: {studio: "core"}}})).json();
assert.equal(rules.result?.isError, false, "The public rulebook must stay readable without signing in");
const refused = await (await rpc({jsonrpc: "2.0", id: 3, method: "tools/call", params: {name: "cbted_list_projects", arguments: {}}})).json();
assert.equal(refused.result?.isError, true, "A private tool must refuse an anonymous call");
assert.ok(refused.result?._meta?.["mcp/www_authenticate"]?.[0]?.includes(METADATA), "The refusal must carry the sign-in hint ChatGPT uses");
console.log("4. Public rules still readable; private tools still refuse anonymous calls with the sign-in hint.");

// 5. The published sign-in page is live and its callback check names Claude's real callback.
// The published files are only read as text. When they match this checkout, the checkout's own module
// (already tested in tests/check-oauth-callbacks.mjs) shows how the published one behaves.
const page = await fetch(SITE, {redirect: "follow", signal: signal()});
assert.equal(page.status, 200, "The sign-in page must be published");
const html = await page.text();
assert.match(html, /<title>Connect CBTeD to your AI assistant<\/title>/);
assert.match(html, /Approve connection/);
const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);
const published = {}, matches = {};
for (const file of ["callbacks.mjs", "consent.js"]) {
  const reply = await fetch(SITE + file, {redirect: "follow", signal: signal()});
  assert.equal(reply.status, 200, file + " must be published");
  published[file] = await reply.text();
  const local = await readFile(new URL("../app/oauth/consent/" + file, import.meta.url), "utf8");
  matches[file] = published[file] === local;
  console.log("   published " + file + " " + hash(published[file]) + (matches[file] ? " (same as this checkout)" : " (differs from this checkout: expected while a change is unpublished)"));
}
assert.match(published["consent.js"], /from "\.\/callbacks\.mjs"/, "The published sign-in script must use the shared callback check");
assert.match(published["callbacks.mjs"], /export function safeCallbackUrl/, "The published callback check must be present");
assert.ok(published["callbacks.mjs"].includes('"claude.ai"') && published["callbacks.mjs"].includes('"/api/mcp/auth_callback"'),
  "The published callback check must list Claude's callback");
if (matches["callbacks.mjs"]) {
  const {safeCallbackUrl} = await import(new URL("../app/oauth/consent/callbacks.mjs", import.meta.url));
  const claude = CLAUDE_CALLBACK + "?code=example&state=example";
  assert.equal(safeCallbackUrl(claude), claude, "The published page must trust Claude's callback");
  assert.throws(() => safeCallbackUrl("https://claude.ai.example.com/api/mcp/auth_callback"), "A lookalike host must be refused");
  assert.throws(() => safeCallbackUrl("https://claude.ai/somewhere-else"), "Another path on Claude's site must be refused");
  console.log("5. The published sign-in page is live, identical to this checkout, and trusts Claude's real callback only.");
} else {
  console.log("5. The published sign-in page is live and lists Claude's callback; its exact behaviour is checked once this checkout is published.");
}

console.log("PASS: the live connector asks Claude to sign in, discovery is complete, and the published sign-in page trusts Claude.");
