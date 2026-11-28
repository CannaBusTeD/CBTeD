const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timelineSchema = "cbted-video-edit-v1";
const textPattern = /^[^\p{Cc}\p{Cs}]*$/u;
const placements = ["top", "centre", "bottom"];
const entrances = ["none", "fade", "rise"];
const fonts = ["classic", "editorial", "typewriter", "poster", "rounded"];
const alignments = ["left", "centre", "right"];

function checkedId(value, name) {
  if (typeof value !== "string" || !uuid.test(value)) throw new Error(`Provide a valid ${name}.`);
  return value.toLowerCase();
}

function integer(value, field, min, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${field}.`);
  return value;
}

export async function timelineProject(rest, token, owner, input) {
  const hasId = input.project_id !== undefined;
  const hasName = input.project_name !== undefined;
  if (hasId === hasName) throw new Error("Provide either an exact project name or a project ID.");
  const query = { select: "id,title,owner_id", owner_id: `eq.${owner}` };
  if (hasId) {
    const id = checkedId(input.project_id, "project ID");
    const rows = await rest(token, "projects", { ...query, id: `eq.${id}`, limit: "1" });
    if (rows[0]?.id !== id || rows[0]?.owner_id !== owner) throw new Error("Project not found or not accessible.");
    return rows[0];
  }
  if (typeof input.project_name !== "string" || input.project_name.length > 200 || !input.project_name.trim())
    throw new Error("Provide the saved project name.");
  const name = input.project_name.normalize("NFC").trim().toLowerCase();
  let after = "";
  let match;
  for (;;) {
    const rows = await rest(token, "projects", { ...query, order: "id.asc", limit: "100", ...(after ? { id: `gt.${after}` } : {}) });
    for (const row of rows) {
      if (row.owner_id !== owner || !uuid.test(row.id)) continue;
      if (row.title?.normalize("NFC").trim().toLowerCase() !== name) continue;
      if (match) throw new Error("More than one project has that name. Use the intended project ID.");
      match = row;
    }
    if (rows.length < 100) break;
    const last = rows.at(-1)?.id;
    if (!uuid.test(last) || (after && last <= after)) throw new Error("Could not verify the project list.");
    after = last;
  }
  if (!match) throw new Error("Project not found or not accessible.");
  return match;
}

async function getRevision(rest, token, id, revision) {
  const rows = await rest(token, "video_edit_versions", {
    project_id: `eq.${id}`, select: "project_id,id,version,created_at,plan", limit: "1",
    ...(revision ? { id: `eq.${revision}` } : { order: "version.desc" }),
  });
  const row = rows[0];
  if (!row) return null;
  if (row.project_id !== id || (revision && row.id !== revision) || !uuid.test(row.id) || !Number.isSafeInteger(row.version) || row.version < 1)
    throw new Error("Could not verify the timeline revision.");
  return row;
}

function summarize(revision) {
  const plan = revision.plan;
  if (!plan || plan.schema !== timelineSchema || !Array.isArray(plan.clips) || !Array.isArray(plan.audio) ||
      (plan.titles !== undefined && !Array.isArray(plan.titles)) || (plan.overlays !== undefined && !Array.isArray(plan.overlays)))
    throw new Error("This saved edit has an invalid timeline.");
  let length = 0;
  const cuts = plan.clips.map((clip) => {
    const start = length;
    const trimIn = integer(clip.inMs, "clip trim", 0);
    const trimOut = integer(clip.outMs, "clip trim", trimIn + 100);
    length = integer(length + trimOut - trimIn, "timeline duration", 0);
    return { clip_id: clip.id, asset_id: clip.assetId, kind: clip.kind, start_ms: start, end_ms: length, source_in_ms: trimIn, source_out_ms: trimOut };
  });
  return { revision_id: revision.id, version: revision.version, saved_at: revision.created_at, duration_ms: length,
    aspect_ratio: plan.aspect, frame_rate: plan.fps, cuts, audio_count: plan.audio.length,
    overlay_count: (plan.overlays ?? []).length, titles: plan.titles ?? [] };
}

const studioUrl = (id) => `https://studio.cannabusted.com/studio/video/edit?project=${id}`;

export async function readVideoTimeline(rest, token, project, includeAssets = true) {
  const url = studioUrl(project.id);
  const draft = await getRevision(rest, token, project.id);
  if (draft) return { project_id: project.id, project_title: project.title, editor_url: url, state: "saved_draft", ...summarize(draft) };
  if (!includeAssets) return { state: "no_saved_draft", editor_url: url };
  const rows = await rest(token, "assets", {
    project_id: `eq.${project.id}`, select: "id,project_id,filename,mime_type,asset_role,duration_ms",
    mime_type: "like.video/*", order: "created_at.desc", limit: "30",
  });
  const videos = rows.filter((row) => row.project_id === project.id && row.mime_type?.startsWith("video/"))
    .map((row) => ({ asset_id: row.id, filename: row.filename, role: row.asset_role,
      duration_ms: Number.isSafeInteger(row.duration_ms) && row.duration_ms > 0 ? row.duration_ms : null }));
  return { project_id: project.id, project_title: project.title, editor_url: url, state: "no_saved_draft", videos };
}

function titleFor(input, revision, id) {
  const timeline = summarize(revision);
  if (!timeline.duration_ms) throw new Error("Add a picture clip before placing a title.");
  const text = input.text;
  if (typeof text !== "string" || !text.trim() || text.length > 120 || !textPattern.test(text))
    throw new Error("Provide title text up to 120 characters on one line.");
  const startMs = integer(input.start_ms ?? 0, "title start", 0);
  const span = integer(input.duration_ms ?? 3000, "title duration", 100);
  const endMs = integer(startMs + span, "title end", 100, timeline.duration_ms);
  const entrance = input.entrance ?? "none";
  const position = input.position ?? "centre";
  const font = input.font ?? "classic";
  const align = input.align ?? "centre";
  const colour = input.colour ?? "#ffffff";
  const box = input.backing ?? false;
  if (!entrances.includes(entrance) || !placements.includes(position) || !fonts.includes(font) ||
      !alignments.includes(align) || typeof colour !== "string" || !/^#[0-9a-f]{6}$/i.test(colour) || typeof box !== "boolean")
    throw new Error("Choose a supported title style.");
  const size = integer(input.size ?? 6, "title size", 3, 15);
  const fadeInMs = integer(input.fade_in_ms ?? (entrance === "none" ? 0 : Math.min(450, Math.floor(span / 2))), "fade in", 0, span);
  const fadeOutMs = integer(input.fade_out_ms ?? 0, "fade out", 0, span - fadeInMs);
  if (timeline.titles.length >= 100 || timeline.titles.some((title) => title.startMs < endMs && title.endMs > startMs))
    throw new Error("That time is occupied on the Text track. Choose a free interval.");
  if ([...revision.plan.clips, ...revision.plan.audio, ...(revision.plan.overlays ?? []), ...timeline.titles].some((item) => item.id === id))
    throw new Error("This request ID already belongs to another timeline item.");
  return { id, text, startMs, endMs, position, style: { font, size, colour, align, box },
    entrance: entrance === "none" && fadeInMs ? "fade" : entrance, fadeInMs, fadeOutMs };
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function addVideoTimelineTitle(rest, token, project, input) {
  const previousId = checkedId(input.expected_revision_id, "current timeline revision ID");
  const requestId = checkedId(input.request_id, "request ID");
  if (requestId === previousId) throw new Error("Use a new request ID for the title.");
  const [previous, replay, latest] = await Promise.all([
    getRevision(rest, token, project.id, previousId), getRevision(rest, token, project.id, requestId),
    getRevision(rest, token, project.id),
  ]);
  if (!previous) throw new Error("Read the latest saved timeline before making changes.");
  const title = titleFor(input, previous, requestId);
  const plan = { ...previous.plan, titles: [...(previous.plan.titles ?? []), title] };
  const version = previous.version + 1;
  const exact = (row) => row?.version === version && stable(row.plan) === stable(plan);
  if (replay && !exact(replay)) throw new Error("This request ID already belongs to a different edit.");
  if (!replay) {
    if (latest?.id !== previousId) throw new Error("A newer timeline has been saved. Read it again before editing.");
    try {
      await rest(token, "video_edit_versions", {}, "POST", { project_id: project.id, id: requestId, version, plan });
    } catch {
      // Confirm an exact append after a lost response or a concurrent save.
    }
    const saved = await getRevision(rest, token, project.id, requestId);
    if (!exact(saved)) throw new Error("Could not confirm the draft save. Read the latest timeline before retrying.");
  }
  return { project_id: project.id, project_title: project.title, editor_url: studioUrl(project.id),
    revision_id: requestId, version, title, render_submitted: false };
}
