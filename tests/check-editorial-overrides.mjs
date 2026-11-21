import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const sql = readFileSync(
  new URL("../supabase/migrations/20261121212243_cbted_editorial_override_requests.sql", import.meta.url),
  "utf8"
);

test("editorial changes preserve prior approved work", () => {
  assert.match(sql, /create table public\.cbted_editorial_overrides/i);
  assert.match(sql, /instructions text not null/i);
  assert.match(sql, /replacement_text text/i);
  assert.match(sql, /request_key uuid not null/i);
  assert.match(sql, /unique \(owner_id, request_key\)/i);
  assert.doesNotMatch(sql, /update public\.production_steps/i);
  assert.doesNotMatch(sql, /delete from public\.(?:assets|outputs|source_versions|production_steps)/i);
});

test("public and direct edits are denied; owner-controlled RPC is required", () => {
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.cbted_editorial_overrides from public, anon, authenticated/i);
  assert.match(sql, /grant select on public\.cbted_editorial_overrides to authenticated/i);
  assert.match(sql, /v_uid uuid := auth\.uid\(\)/i);
  assert.match(sql, /Project access denied/i);
  assert.match(sql, /p_step[^]*?Target step not found in project run/i);
  assert.match(sql, /revoke all on function public\.cbted_request_editorial_override[^]*?from public,anon/i);
});

test("request is a separate stage, not an automatic rewrite", () => {
  assert.match(sql, /status text not null default 'requested'/i);
  assert.match(sql, /('requested','cancelled','applied')/);
  assert.doesNotMatch(sql, /status='applied'/i);
});
