// Canonical CBTeD Edge Function (deploy to dmzzyfiwtosxtyekpbfi: supabase/functions/cbted-master-import/index.ts)
// Narrow owner-authorized closed-browser selected-master import + MP3 byte/SHA-256 verification,
// cross-project owned reference byte verification, immutable studio_master_handoff_v1 receipt,
// and rejoin into normal canonical review (`cbted_media_jobs.status = 'needs_review'`).
// No generic delegation, no owner JWT storage, no credit spend, and no publishing.

const BUCKET = "cbted-project-assets";
const CONTRACT = "cbted-scoped-master-import-v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;
const NON_MASTER_ROLES = new Set(["extension", "extension_tail", "tail", "audition", "audition_clip", "preview", "clip"]);
const COMMON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,apikey,content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};
const VALID_TABLES = new Set([
  "projects",
  "assets",
  "handoffs",
  "production_runs",
  "production_steps",
  "cbted_media_jobs",
  "cbted_media_job_events",
]);

export interface MasterImportEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  publishableKey: string;
  allowedHosts?: string;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: COMMON_HEADERS });
}

function reqUuid(value: unknown, label: string): string {
  const s = String(value ?? "").trim();
  if (!UUID.test(s)) throw new Error(`Invalid ${label}`);
  return s;
}

function reqSongId(value: unknown): string {
  const s = String(value ?? "").trim();
  if (s.length < 3 || s.length > 200) throw new Error("Invalid selected_full_song_id");
  return s;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isValidMp3(bytes: Uint8Array): boolean {
  if (bytes.length <= 1024 || bytes.length > 45_000_000) return false;
  return (
    (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
    (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)
  );
}

function isValidImageBytes(bytes: Uint8Array, mime: string): boolean {
  if (bytes.length < 16 || bytes.length > 25_000_000) return false;
  if (mime === "image/png") return bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  if (mime === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216;
  if (mime === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

function permittedSunoAudioUrl(raw: string, allowedHostsCsv: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("Invalid media result URL");
  }
  if (u.protocol !== "https:" || u.port || u.username || u.password) throw new Error("HTTPS media URL required");
  const host = u.hostname.toLowerCase();
  if ((host === "suno.com" || host === "www.suno.com") && /^\/song\//i.test(u.pathname)) {
    throw new Error("Suno webpage URL is not a direct MP3 export URL");
  }
  const hosts = allowedHostsCsv.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const sunoUpload = host === "suno-data-uploads.s3.amazonaws.com" && u.pathname.startsWith("/studio/uploads/");
  const configured = hosts.some((h) => host === h || host.endsWith("." + h));
  if (!sunoUpload && !configured) throw new Error("That provider media host has not yet been authorised for import");
  if (u.pathname.length > 1500) throw new Error("Media URL path too long");
  return u.toString();
}

function safeStoragePath(path: string): boolean {
  return !/[\\?#%]/.test(path) && path.split("/").every(segment => segment && segment !== "." && segment !== "..");
}

function parseAnalysis(raw: unknown): { duration_seconds: number; bpm: number; beat_times_seconds: number[]; method: string; raw: Record<string, unknown> } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : typeof v === "string" && v.trim() && Number(v) > 0 ? Number(v) : null);
  const duration = num(obj["duration_seconds"] ?? obj["durationSeconds"] ?? obj["duration_s"] ?? obj["duration"]);
  const bpm = num(obj["bpm"] ?? obj["tempo_bpm"] ?? obj["tempo"]);
  const rawBeats = Array.isArray(obj["beat_times_seconds"]) ? obj["beat_times_seconds"] : Array.isArray(obj["beat_times"]) ? obj["beat_times"] : Array.isArray(obj["beats"]) ? obj["beats"] : [];
  const beats = rawBeats.map((v) => typeof v === "object" && v !== null ? v.time_s : v).map((value) => typeof value === "number" || (typeof value === "string" && value.trim()) ? Number(value) : NaN).filter((v) => Number.isFinite(v) && v >= 0);
  if (!duration || !bpm || beats.length < 2) return null;
  if (beats.some((t, i) => t > duration || (i > 0 && t <= (beats[i - 1] ?? t)))) return null;
  const method = typeof obj["method"] === "string" && obj["method"].trim() ? obj["method"].trim() : "prepared_analysis";
  return { duration_seconds: duration, bpm, beat_times_seconds: beats, method, raw: obj };
}

function extractLockedManuscript(steps: Array<Record<string, unknown>>): string | null {
  const proof = steps.find((s) => s["step_key"] === "writing_proofread" && s["status"] === "passed" && typeof s["output_text"] === "string" && String(s["output_text"]).trim());
  const review = steps.find((s) => s["step_key"] === "writing_review" && s["status"] === "passed");
  if (!review) return null;
  const ev = review["evidence"] && typeof review["evidence"] === "object" ? (review["evidence"] as Record<string, unknown>) : {};
  if (ev["selected_manuscript"] && typeof ev["selected_manuscript"] === "string" && ev["selected_manuscript"].trim()) {
    return ev["selected_manuscript"].trim();
  }
  const reviewText = typeof review["output_text"] === "string" ? review["output_text"] : "";
  if (proof && /(?:^|\n)\s*VERDICT\s*:\s*PASS\b/i.test(reviewText)) {
    return String(proof["output_text"]).trim();
  }
  return null;
}

export function createMasterImportHandler(env: MasterImportEnv, fetchImpl: typeof fetch = fetch) {
  const root = env.supabaseUrl.replace(/\/$/, "");
  const service = env.serviceRoleKey;
  const pub = env.publishableKey;
  const allowedHosts = env.allowedHosts ?? "";

  function assertConfigured() {
    if (!root || !service || !pub) throw new Error("CBTeD scoped master import is not configured");
  }

  async function currentOwner(req: Request): Promise<{ id: string; token: string }> {
    assertConfigured();
    const m = /^Bearer\s+([^\s]+)$/.exec(req.headers.get("Authorization") || "");
    if (!m?.[1]) throw new Error("Sign in to CBTeD first");
    const res = await fetchImpl(`${root}/auth/v1/user`, { headers: { apikey: pub, Authorization: `Bearer ${m[1]}` } });
    if (!res.ok) throw new Error("CBTeD session expired");
    const u = (await res.json()) as { id?: string };
    return { id: reqUuid(u.id, "account"), token: m[1] };
  }

  async function db(table: string, method = "GET", query: Record<string, string> = {}, body?: unknown, prefer = "return=representation") {
    assertConfigured();
    if (!VALID_TABLES.has(table)) throw new Error("Unsupported table");
    const qs = new URLSearchParams(query).toString();
    const res = await fetchImpl(`${root}/rest/v1/${table}${qs ? "?" + qs : ""}`, {
      method,
      headers: { apikey: service, Authorization: `Bearer ${service}`, "content-type": "application/json", Prefer: prefer },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(`CBTeD database rejected request (${res.status})`);
    return data;
  }

  async function rpc(name: string, bearer: string, apikey: string, params: Record<string, unknown>) {
    assertConfigured();
    const res = await fetchImpl(`${root}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey, Authorization: `Bearer ${bearer}`, "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(String(data?.message || data?.error || `RPC ${name} rejected (${res.status})`).slice(0, 260));
    return data;
  }

  async function verifyPrivateMp3Asset(ownerId: string, projectId: string, sourceVersionId: string, songId: string, asset: Record<string, unknown>) {
    if (asset["project_id"] !== projectId) throw new Error("Audio asset does not belong to this project");
    const mime = String(asset["mime_type"] || "").toLowerCase();
    if (!["audio/mpeg", "audio/mp3"].includes(mime)) throw new Error("Audio asset is not an MP3");
    const sv = asset["source_version_id"];
    if (typeof sv === "string" && sv && sv !== sourceVersionId) throw new Error("Audio asset belongs to another source version");
    const meta = asset["metadata"] && typeof asset["metadata"] === "object" ? (asset["metadata"] as Record<string, unknown>) : {};
    const role = typeof meta["clip_role"] === "string" ? meta["clip_role"].toLowerCase() : "";
    if (role && NON_MASTER_ROLES.has(role)) throw new Error("Refused to bind extension tail or audition clip as master");
    const pid = meta["provider_recording_id"] ?? meta["provider_song_id"];
    if (pid !== songId) throw new Error("Audio asset provider song ID does not match selected master");
    const path = String(asset["storage_path"] || "");
    if (!path.startsWith(`${ownerId}/${projectId}/`) || !safeStoragePath(path)) throw new Error("Audio asset path outside owner project");
    const stored = await fetchImpl(`${root}/storage/v1/object/authenticated/${BUCKET}/${path}`, {
      headers: { apikey: service, Authorization: `Bearer ${service}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!stored.ok) throw new Error("Private stored MP3 bytes could not be read back");
    const bytes = new Uint8Array(await stored.arrayBuffer());
    if (!isValidMp3(bytes)) throw new Error("Stored audio bytes are empty or not a valid MP3");
    const digest = await sha256Hex(bytes);
    const recorded = meta["artifact_sha256"];
    if (typeof recorded === "string" && recorded && recorded !== digest) throw new Error("Stored MP3 SHA-256 mismatch");
    return { asset, sha256: digest, bytes: bytes.length };
  }

  async function verifyOwnedReference(ownerId: string, refId: string) {
    reqUuid(refId, "reference_id");
    const rows = (await db("assets", "GET", {
      id: `eq.${refId}`,
      select: "id,project_id,asset_role,mime_type,storage_path",
      limit: "2",
    })) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error(`Reference asset ${refId.slice(0, 8)} not found`);
    const asset = rows[0]!;
    const mime = String(asset["mime_type"] || "").toLowerCase();
    if (!mime.startsWith("image/")) throw new Error(`Reference asset ${refId.slice(0, 8)} is not an image`);
    const refProjectId = reqUuid(asset["project_id"], "reference project");
    const projects = (await db("projects", "GET", {
      id: `eq.${refProjectId}`,
      owner_id: `eq.${ownerId}`,
      select: "id,owner_id",
      limit: "2",
    })) as Array<Record<string, unknown>>;
    if (!Array.isArray(projects) || projects.length !== 1) throw new Error(`Reference ${refId.slice(0, 8)} is not in an owner project`);
    const path = String(asset["storage_path"] || "");
    if (!path.startsWith(`${ownerId}/${refProjectId}/`) || !safeStoragePath(path)) throw new Error(`Reference ${refId.slice(0, 8)} has no valid storage path`);
    const res = await fetchImpl(`${root}/storage/v1/object/authenticated/${BUCKET}/${path}`, {
      headers: { apikey: service, Authorization: `Bearer ${service}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Reference ${refId.slice(0, 8)} bytes could not be read from private storage`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!isValidImageBytes(bytes, mime)) throw new Error(`Reference ${refId.slice(0, 8)} bytes are not a valid image`);
    return { id: refId, project_id: refProjectId, bytes: bytes.length };
  }

  return async function handle(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: COMMON_HEADERS });
    const url = new URL(request.url);
    const action = url.pathname.split("/").pop();
    if (request.method === "GET" && action === "health") {
      return json({
        name: "CBTeD Scoped Master Import",
        status: "online",
        contract: CONTRACT,
        media_import_configured: Boolean(root && service && pub),
        publishing: false,
        generic_delegation: false,
      });
    }
    if (request.method !== "POST") return json({ error: "Method not supported" }, 405);
    if (Number(request.headers.get("content-length") || 0) > 65_000) return json({ error: "Request too large" }, 413);

    try {
      const body = (await request.json()) as Record<string, unknown>;
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid JSON object");

      if (action === "grant-issue") {
        const owner = await currentOwner(request);
        const projectId = reqUuid(body["project_id"], "project_id");
        const runId = reqUuid(body["run_id"], "run_id");
        const sourceVersionId = reqUuid(body["source_version_id"], "source_version_id");
        const musicJobId = reqUuid(body["music_job_id"], "music_job_id");
        const songId = reqSongId(body["selected_full_song_id"]);
        const handoffId = body["handoff_id"] ? reqUuid(body["handoff_id"], "handoff_id") : null;
        const ttl = typeof body["ttl_minutes"] === "number" ? body["ttl_minutes"] : 360;
        const credential = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
        const issued = (await rpc("cbted_issue_master_import_grant", owner.token, pub, {
          p_project: projectId,
          p_run: runId,
          p_source_version: sourceVersionId,
          p_music_job: musicJobId,
          p_song_id: songId,
          p_secret: credential,
          p_handoff: handoffId,
          p_ttl_minutes: ttl,
        })) as Record<string, unknown>;
        return json({
          contract: CONTRACT,
          grant_id: issued["grant_id"],
          generation: issued["generation"],
          expires_at: issued["expires_at"],
          credential,
        });
      }

      if (action === "grant-revoke") {
        const owner = await currentOwner(request);
        const runId = reqUuid(body["run_id"], "run_id");
        const musicJobId = reqUuid(body["music_job_id"], "music_job_id");
        const songId = body["selected_full_song_id"] ? reqSongId(body["selected_full_song_id"]) : null;
        const count = await rpc("cbted_revoke_master_import_grant", owner.token, pub, {
          p_run: runId,
          p_music_job: musicJobId,
          p_song_id: songId,
        });
        return json({ revoked: true, count });
      }

      if (action === "import-master") {
        assertConfigured();
        const runId = reqUuid(body["run_id"], "run_id");
        const musicJobId = reqUuid(body["music_job_id"], "music_job_id");
        const songId = reqSongId(body["selected_full_song_id"]);
        const credential = typeof body["credential"] === "string" ? body["credential"].trim() : "";
        if (!HEX64.test(credential)) throw new Error("Invalid scoped master import credential");

        const scope = (await rpc("cbted_verify_master_import_grant", service, service, {
          p_run: runId,
          p_music_job: musicJobId,
          p_song_id: songId,
          p_secret: credential,
        })) as Record<string, unknown>;
        const ownerId = reqUuid(scope["owner_id"], "owner_id");
        const projectId = reqUuid(scope["project_id"], "project_id");
        const sourceVersionId = reqUuid(scope["source_version_id"], "source_version_id");
        const grantId = reqUuid(scope["grant_id"], "grant_id");
        const generation = Number(scope["generation"] || 1);

        const [jobs, handoffs, steps, projectAssets] = await Promise.all([
          db("cbted_media_jobs", "GET", { id: `eq.${musicJobId}`, owner_id: `eq.${ownerId}`, project_id: `eq.${projectId}`, run_id: `eq.${runId}`, limit: "1" }) as Promise<Array<Record<string, unknown>>>,
          db("handoffs", "GET", { project_id: `eq.${projectId}`, status: "eq.prepared", "payload->>run_id": `eq.${runId}`, "payload->>music_job_id": `eq.${musicJobId}`, "payload->>selected_full_song_id": `eq.${songId}`, order: "created_at.desc", limit: "50" }) as Promise<Array<Record<string, unknown>>>,
          db("production_steps", "GET", { run_id: `eq.${runId}`, project_id: `eq.${projectId}`, select: "step_key,status,output_text,evidence" }) as Promise<Array<Record<string, unknown>>>,
          db("assets", "GET", { project_id: `eq.${projectId}`, order: "created_at.desc", limit: "100" }) as Promise<Array<Record<string, unknown>>>,
        ]);
        const job = jobs?.[0];
        if (!job || job["provider"] !== "suno" || job["kind"] !== "audio") throw new Error("Owned Suno audio job not found");

        const matchedHandoff = (handoffs || []).find((h) => {
          const p = h["payload"] && typeof h["payload"] === "object" ? (h["payload"] as Record<string, unknown>) : null;
          if (!p) return false;
          if (scope["handoff_id"] && h["id"] !== scope["handoff_id"]) return false;
          return (
            p["owner_selected_for_video"] === true &&
            p["run_id"] === runId &&
            p["music_job_id"] === musicJobId &&
            p["source_version_id"] === sourceVersionId &&
            p["selected_full_song_id"] === songId
          );
        });
        if (!matchedHandoff) throw new Error("Matching owner-selected prepared canonical handoff was not found");
        const payload = matchedHandoff["payload"] as Record<string, unknown>;

        const lockedLyrics = extractLockedManuscript(steps || []);
        if (!lockedLyrics) throw new Error("Canonical reviewed manuscript is not locked");

        const timing = payload["analysis"] as Record<string, unknown> | null;
        const alignment = payload["lyric_alignment"] as Record<string, unknown> | null;
        if ((timing?.audio_id && timing.audio_id !== songId) || (alignment?.audio_id && alignment.audio_id !== songId))
          throw new Error("Timing or lyrics belong to another Suno recording");
        const analysis = parseAnalysis(timing);
        if (!analysis) throw new Error("Prepared handoff is missing valid measured timing analysis");

        // 1. Reuse existing private matching MP3 asset FIRST (0 remote downloads).
        let verified: { asset: Record<string, unknown>; sha256: string; bytes: number } | null = null;
        let reusedExisting = false;
        const candidateAssetIds = [
          typeof payload["audio_asset_id"] === "string" && UUID.test(payload["audio_asset_id"]) ? payload["audio_asset_id"] : null,
          typeof job["result_asset_id"] === "string" && UUID.test(job["result_asset_id"]) ? job["result_asset_id"] : null,
        ].filter((v): v is string => Boolean(v));

        for (const candidateId of candidateAssetIds) {
          const existing = (projectAssets || []).find((a) => a["id"] === candidateId) ?? (await db("assets", "GET", { id: `eq.${candidateId}`, project_id: `eq.${projectId}`, limit: "1" }))[0];
          if (existing) {
            verified = await verifyPrivateMp3Asset(ownerId, projectId, sourceVersionId, songId, existing);
            reusedExisting = true;
            break;
          }
        }
        if (!verified) {
          const bySong = (projectAssets || []).find((a) => {
            const meta = a["metadata"] && typeof a["metadata"] === "object" ? (a["metadata"] as Record<string, unknown>) : {};
            const pid = meta["provider_recording_id"] ?? meta["provider_song_id"];
            return ["audio/mpeg", "audio/mp3"].includes(String(a["mime_type"] || "").toLowerCase()) && pid === songId;
          });
          if (bySong) {
            verified = await verifyPrivateMp3Asset(ownerId, projectId, sourceVersionId, songId, bySong);
            reusedExisting = true;
          }
        }

        // 2. Otherwise import from approved HTTPS Suno audio URL into private storage -> job status = 'needs_review'.
        if (!verified) {
          if (job["status"] !== "submitted") throw new Error("Suno audio job must be in submitted state before importing a new master");
          const rawUrl = typeof body["result_url"] === "string" ? body["result_url"] : "";
          const safeUrl = permittedSunoAudioUrl(rawUrl, allowedHosts);
          const remote = await fetchImpl(safeUrl, { redirect: "error", signal: AbortSignal.timeout(30_000) });
          if (!remote.ok) throw new Error("Provider media could not be downloaded");
          const contentType = String(remote.headers.get("content-type") || "").split(";")[0]?.toLowerCase() || "";
          if (!["audio/mpeg", "audio/mp3"].includes(contentType)) throw new Error("Provider did not return MP3 audio");
          const declared = Number(remote.headers.get("content-length") || 0);
          if (declared > 45_000_000) throw new Error("Audio file exceeds safe import size");
          const data = new Uint8Array(await remote.arrayBuffer());
          if (!isValidMp3(data)) throw new Error("Downloaded bytes are not a valid MP3 file");
          const digest = await sha256Hex(data);
          const reservation = `${contentType}:${digest}`;
          const reserved = (await db(
            "cbted_media_jobs",
            "PATCH",
            { id: `eq.${musicJobId}`, owner_id: `eq.${ownerId}`, status: "eq.submitted", import_digest: "is.null" },
            { import_digest: reservation },
          )) as Array<Record<string, unknown>>;
          if (!reserved?.length) {
            const reread = (await db("cbted_media_jobs", "GET", { id: `eq.${musicJobId}`, owner_id: `eq.${ownerId}`, limit: "1" })) as Array<Record<string, unknown>>;
            const cur = reread?.[0];
            if (!cur || (cur["import_digest"] !== reservation)) {
              throw new Error("Another media result is reserved for this job");
            }
          }
          const assetId = musicJobId;
          const path = `${ownerId}/${projectId}/audios/${assetId}.mp3`;
          const uploaded = await fetchImpl(`${root}/storage/v1/object/${BUCKET}/${path}`, {
            method: "POST",
            headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": contentType, "x-upsert": "false" },
            body: data,
          });
          if (!uploaded.ok) {
            const stored = await fetchImpl(`${root}/storage/v1/object/authenticated/${BUCKET}/${path}`, {
              headers: { apikey: service, Authorization: `Bearer ${service}` },
            });
            if (!stored.ok || (await sha256Hex(new Uint8Array(await stored.arrayBuffer()))) !== digest) {
              throw new Error("Private Supabase media upload failed");
            }
          }
          const created = (await db(
            "assets",
            "POST",
            {},
            {
              id: assetId,
              project_id: projectId,
              asset_role: "generated",
              filename: `${assetId}.mp3`,
              duration_ms: Math.round(analysis.duration_seconds * 1000),
              storage_path: path,
              mime_type: contentType,
              source_version_id: sourceVersionId,
              metadata: {
                generator: "suno",
                model: job["model"] ?? "v6",
                job_id: musicJobId,
                provider_job_id: job["provider_job_id"] ?? null,
                provider_song_id: songId,
                provider_recording_id: songId,
                clip_role: "joined_full_song",
                artifact_sha256: digest,
                scoped_master_import_v1: true,
              },
            },
            "resolution=ignore-duplicates,return=representation",
          )) as Array<Record<string, unknown>>;
          const savedAsset = created?.[0] ?? (await db("assets", "GET", { id: `eq.${assetId}`, project_id: `eq.${projectId}`, limit: "1" }))?.[0];
          if (!savedAsset) throw new Error("Imported MP3 asset record could not be confirmed");
          await db(
            "cbted_media_jobs",
            "PATCH",
            { id: `eq.${musicJobId}`, owner_id: `eq.${ownerId}`, status: "eq.submitted" },
            { result_asset_id: savedAsset["id"], status: "needs_review", updated_at: new Date().toISOString() },
          );
          await db("cbted_media_job_events", "POST", {}, {
            owner_id: ownerId,
            job_id: musicJobId,
            event: "imported",
            details: { asset_id: savedAsset["id"], bytes: data.byteLength, mime_type: contentType, sha256: digest, scoped_master_import: true },
          });
          verified = await verifyPrivateMp3Asset(ownerId, projectId, sourceVersionId, songId, savedAsset);
        }

        // 3. Verify every owned library reference_id individually across creator-owned projects + real byte read.
        const rawRefs = Array.isArray(payload["reference_ids"]) ? payload["reference_ids"] : [];
        const verifiedRefs: Array<{ id: string; project_id: string; bytes: number }> = [];
        for (const r of rawRefs) {
          verifiedRefs.push(await verifyOwnedReference(ownerId, String(r)));
        }

        // 4. Write deterministic immutable owner-private studio_master_handoff_v1 receipt (rejoins normal review).
        const receiptSeed = JSON.stringify(["studio_master_handoff_v1", ownerId, projectId, runId, sourceVersionId, musicJobId, songId]);
        const receiptHash = await sha256Hex(new TextEncoder().encode(receiptSeed));
        const receiptId = `${receiptHash.slice(0, 8)}-${receiptHash.slice(8, 12)}-5${receiptHash.slice(13, 16)}-a${receiptHash.slice(17, 20)}-${receiptHash.slice(20, 32)}`;
        const receiptPath = `${ownerId}/${projectId}/master-handoffs/${receiptId}.json`;
        const lyricsSha256 = await sha256Hex(new TextEncoder().encode(lockedLyrics));
        const lyricAlignment = Array.isArray(alignment) ? alignment : Array.isArray(alignment?.words) ? alignment.words : Array.isArray(alignment?.lines) ? alignment.lines : [];
        const proposedScenes = Array.isArray(payload["proposed_scenes"]) ? payload["proposed_scenes"] : [];
        const receiptMeta = {
          studio_master_handoff_v1: true,
          owner_confirmed: true,
          scoped_closed_browser_import: true,
          handoff_id: matchedHandoff["id"] ?? null,
          run_id: runId,
          source_version_id: sourceVersionId,
          music_job_id: musicJobId,
          selected_full_song_id: songId,
          imported_asset_id: verified.asset["id"],
          verified_sha256: verified.sha256,
          verified_bytes: verified.bytes,
          lyrics_sha256: lyricsSha256,
          song_measurements_v1: {
            asset_id: verified.asset["id"],
            source_version_id: sourceVersionId,
            duration_seconds: analysis.duration_seconds,
            bpm: analysis.bpm,
            beat_times_seconds: analysis.beat_times_seconds,
            lyrics: lockedLyrics,
            method: analysis.method,
          },
          lyric_alignment_count: lyricAlignment.length,
          proposed_scenes_count: proposedScenes.length,
          reference_ids: verifiedRefs.map((r) => r.id),
          reference_projects: verifiedRefs.map((r) => ({ id: r.id, project_id: r.project_id })),
        };
        const receiptDoc = new TextEncoder().encode(JSON.stringify({
          ...receiptMeta,
          analysis: analysis.raw,
          lyric_alignment: lyricAlignment,
          proposed_scenes: proposedScenes,
          approved_lyrics: lockedLyrics,
        }));
        const receiptDocHash = await sha256Hex(receiptDoc);

        const existingReceiptRows = (await db("assets", "GET", { id: `eq.${receiptId}`, project_id: `eq.${projectId}`, limit: "1" })) as Array<Record<string, unknown>>;
        if (existingReceiptRows?.length === 1) {
          const existingMeta = existingReceiptRows[0]!["metadata"] as Record<string, unknown> | undefined;
          if (existingMeta?.["verified_sha256"] !== verified.sha256 || existingMeta?.["imported_asset_id"] !== verified.asset["id"]) {
            throw new Error("A conflicting master attachment receipt already exists for this run/song");
          }
        } else {
          await fetchImpl(`${root}/storage/v1/object/${BUCKET}/${receiptPath}`, {
            method: "POST",
            headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", "x-upsert": "false" },
            body: receiptDoc,
          }).catch(() => null);
          const storedReceipt = await fetchImpl(`${root}/storage/v1/object/authenticated/${BUCKET}/${receiptPath}`, {
            headers: { apikey: service, Authorization: `Bearer ${service}` },
          });
          if (!storedReceipt.ok || (await sha256Hex(new Uint8Array(await storedReceipt.arrayBuffer()))) !== receiptDocHash) {
            throw new Error("Master attachment receipt bytes were not confirmed in private storage");
          }
          await db("assets", "POST", {}, {
            id: receiptId,
            project_id: projectId,
            asset_role: "generated",
            filename: `Final master handoff ${songId}.json`,
            mime_type: "application/json",
            storage_path: receiptPath,
            source_version_id: sourceVersionId,
            metadata: receiptMeta,
          }, "resolution=ignore-duplicates,return=representation");
          await db("cbted_media_job_events", "POST", {}, {
            owner_id: ownerId,
            job_id: musicJobId,
            event: "master_handoff_attached",
            details: { receipt_id: receiptId, imported_asset_id: verified.asset["id"], sha256: verified.sha256, bytes: verified.bytes, reference_count: verifiedRefs.length },
          });
        }

        const masterAssetId = reqUuid(verified.asset["id"], "verified master asset");
        if (matchedHandoff["asset_id"] !== masterAssetId) {
          if (matchedHandoff["asset_id"]) throw new Error("A different asset is linked to this handoff");
          const linked = await db("handoffs", "PATCH", { id: `eq.${matchedHandoff["id"]}`,
            project_id: `eq.${projectId}`, asset_id: "is.null" }, { asset_id: masterAssetId });
          if (!linked.length) {
            const again = await db("handoffs", "GET", { id: `eq.${matchedHandoff["id"]}`, project_id: `eq.${projectId}`, select: "asset_id" });
            if (again[0]?.asset_id !== masterAssetId) throw new Error("Master handoff changed before attachment");
          }
        }

        // Retire single-use grant after confirmed receipt; job stays in needs_review to rejoin normal canonical review.
        await rpc("cbted_mark_master_import_grant_used", service, service, { p_grant_id: grantId, p_generation: generation });

        return json({
          contract: CONTRACT,
          imported_asset_id: verified.asset["id"],
          verified_sha256: verified.sha256,
          verified_bytes: verified.bytes,
          attachment_asset_id: receiptId,
          reused_existing_asset: reusedExisting,
          reference_count: verifiedRefs.length,
          job_status: "needs_review",
          next_stage: "audio_review",
          published: false,
          message: "Master MP3 verified and immutable handoff receipt attached. Rejoined normal canonical review.",
        });
      }

      return json({ error: "Unknown master import action" }, 404);
    } catch (err) {
      const reason = String(err instanceof Error ? err.message : "Request denied").slice(0, 300);
      const status = /not configured|not yet been authorised/i.test(reason) ? 503 : /sign in|expired|inactive|credential/i.test(reason) ? 401 : 400;
      return json({ error: reason }, status);
    }
  };
}

const denoGlobal = (globalThis as {
  Deno?: {
    env: { get(key: string): string | undefined };
    serve(handler: (request: Request) => Promise<Response> | Response): void;
  };
}).Deno;

if (denoGlobal && typeof denoGlobal.serve === "function") {
  const pub = (() => {
    const direct = denoGlobal.env.get("SUPABASE_PUBLISHABLE_KEY") || denoGlobal.env.get("SUPABASE_ANON_KEY");
    if (direct) return direct;
    try {
      return JSON.parse(denoGlobal.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default || "";
    } catch {
      return "";
    }
  })();
  const handler = createMasterImportHandler({
    supabaseUrl: denoGlobal.env.get("SUPABASE_URL") || "",
    serviceRoleKey: denoGlobal.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    publishableKey: pub,
    allowedHosts: denoGlobal.env.get("CBTED_MEDIA_ALLOWED_HOSTS") || "",
  });
  denoGlobal.serve(handler);
}