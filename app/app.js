import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import { loadPublicConfig } from "./config.js";
import { writingFieldCopy } from "./writing-fields.mjs";
import { createStudioWorkspace } from "./studio-workspace.mjs";
import { isTemporaryRegistrationLimit, isEmailConfirmationRequired, registrationNotice } from "./auth-notices.mjs";

// Get only the project's browser-safe publishable configuration.
// Never embed a database password, secret key or service-role key in this app.
let publicConfig;
try {
  publicConfig = await loadPublicConfig();
} catch (error) {
  document.getElementById("status").textContent =
    "Unable to connect to CBTeD configuration: " + (error?.message || "Unknown error");
  document.getElementById("status").classList.add("error");
  throw error;
}
const STORAGE_BUCKET = publicConfig.bucket;
const db = createClient(publicConfig.url, publicConfig.publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const $ = (id) => document.getElementById(id);
const state = {
  user: null, projects: [], project: null, sources: [], source: null,
  versions: [], version: null, versionApproved: false, assets: [], tasks: [],
  rules: [], handoffs: [], projectLoadSerial: 0
};
const id = () => crypto.randomUUID();
const readableDate = (value) => value ? new Date(value).toLocaleString() : "";
const safeFileName = (value) => (value || "file").replace(/[^A-Za-z0-9._-]/g, "_").slice(-90);

function message(text, isError = false) {
  const node = $("status");
  node.textContent = String(text || "");
  node.classList.toggle("error", Boolean(isError));
}
function fail(error, description) {
  console.error(description, error);
  message(description + ": " + (error?.message || "Unexpected error."), true);
}
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function clear(node) { node.replaceChildren(); }
function requireProject() {
  if (!state.user || !state.project) throw new Error("Sign in and select a project first.");
  return state.project;
}
const activeActions = new WeakSet();
function handle(handler) {
  return async (event) => {
    event?.preventDefault?.();
    const control = event?.currentTarget;
    if (control && activeActions.has(control)) return;
    if (control) {
      activeActions.add(control);
      control.setAttribute("aria-busy", "true");
    }
    try { await handler(event); }
    catch (error) { fail(error, "Operation failed"); }
    finally {
      if (control) {
        activeActions.delete(control);
        control.removeAttribute("aria-busy");
      }
    }
  };
}
async function query(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

function signedOut() {
  state.user = null;
  state.project = null;
  state.projects = [];
  state.sources = [];
  state.version = null;
  state.source = null;
  state.projectLoadSerial += 1;
  $("workspace").hidden = true;
  $("auth-panel").hidden = false;
  $("project-details").hidden = true;
  message("Sign in to open your private projects.");
}
async function syncSession(session) {
  if (!session) { signedOut(); return; }
  const { data, error } = await db.auth.getUser();
  if (error || !data?.user) { signedOut(); return; }
  if (state.user?.id === data.user.id) return;
  state.user = data.user;
  $("user-email").textContent = data.user.email || "Signed-in user";
  $("auth-panel").hidden = true;
  $("workspace").hidden = false;
  message("Signed in. Loading your projects.");
  await loadProjects();
}
function showRegistrationNotice(kind, email) {
  const notice = registrationNotice(kind, email);
  $("signup-dialog-title").textContent = notice.title;
  $("signup-dialog-description").textContent = notice.description;
  $("signup-dialog-instructions").textContent = notice.instructions;
  const dialog = $("signup-dialog");
  if (!dialog.open) dialog.showModal();
}

async function signIn() {
  const email = $("email").value.trim();
  const password = $("password").value;
  message("Signing in…");
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    if (isEmailConfirmationRequired(error)) {
      message("Confirm your email before signing in.");
      showRegistrationNotice("unconfirmed", email);
      return;
    }
    throw error;
  }
  $("password").value = "";
  await syncSession(data.session);
}
async function signUp() {
  const email = $("email").value.trim();
  const password = $("password").value;
  if (password.length < 8) throw new Error("Choose a password at least 8 characters long.");
  message("Creating your account…");
  const { data, error } = await db.auth.signUp({
    email, password,
    options: { emailRedirectTo: window.location.origin + window.location.pathname }
  });
  if (error) {
    if (isTemporaryRegistrationLimit(error)) {
      $("password").value = "";
      message("Your earlier registration request may already have gone through. Check your email.");
      showRegistrationNotice("cooldown", email);
      return;
    }
    throw error;
  }
  $("password").value = "";
  if (data.session) {
    await syncSession(data.session);
  } else {
    message("Registration submitted. Check your inbox or spam folder for your confirmation email.");
    showRegistrationNotice("submitted", email);
  }
}

function drawProjects() {
  const list = $("project-list");
  clear(list);
  $("project-empty").hidden = state.projects.length !== 0;
  for (const project of state.projects) {
    const li = el("li");
    const button = el("button", project.title, "project-button");
    button.type = "button";
    button.setAttribute("aria-current", String(state.project?.id === project.id));
    button.addEventListener("click", handle(() => chooseProject(project)));
    li.append(button);
    list.append(li);
  }
}
async function loadProjects(preferredId = null) {
  const projects = await query(db.from("projects")
    .select("id,title,description,status,current_studio,created_at,updated_at")
    .order("updated_at", { ascending: false }));
  state.projects = projects || [];
  const selectedId = preferredId || state.project?.id;
  const chosen = state.projects.find((p) => p.id === selectedId) || state.projects[0] || null;
  if (chosen) await chooseProject(chosen);
  else {
    state.project = null;
    $("project-details").hidden = true;
    drawProjects();
    message("No projects yet. Create one to get started.");
  }
}
async function createProject() {
  const title = $("project-title").value.trim();
  if (!title) throw new Error("Enter a project name.");
  message("Creating project…");
  const project = await query(db.from("projects")
    .insert({ title, owner_id: state.user.id })
    .select("id,title,description,status,current_studio,created_at,updated_at").single());
  $("project-title").value = "";
  await loadProjects(project.id);
  message("Project created: " + project.title);
}
async function chooseProject(project) {
  state.project = project;
  state.source = null;
  state.version = null;
  state.versionApproved = false;
  state.projectLoadSerial += 1;
  const serial = state.projectLoadSerial;
  $("project-details").hidden = false;
  $("selected-heading").textContent = project.title;
  $("project-summary").textContent = "Created " + readableDate(project.created_at) + ". Private to your account.";
  drawProjects();
  message("Loading " + project.title + "…");
  await loadSources(serial);
  if (serial !== state.projectLoadSerial) return;
  await loadRules(serial);
  if (serial !== state.projectLoadSerial) return;
  await loadAssets(serial);
  if (serial !== state.projectLoadSerial) return;
  await loadTasks(serial);
  if (serial !== state.projectLoadSerial) return;
  await loadHandoffs(serial);
  if (serial !== state.projectLoadSerial) return;
  await studioWorkspace.loadProject(project);
  if (serial === state.projectLoadSerial) message("Project ready: " + project.title);
}
function updateWritingLabels() {
  const fields = writingFieldCopy($("source-type").value);
  const mapping = [
    ["writing-title-label", "textContent", fields.titleLabel],
    ["source-title", "placeholder", fields.titlePlaceholder],
    ["writing-current-label", "textContent", fields.currentLabel],
    ["writing-current-help", "textContent", fields.currentHelp],
    ["source-text", "placeholder", fields.currentPlaceholder],
    ["writing-ideas-label", "textContent", fields.ideasLabel],
    ["writing-ideas-help", "textContent", fields.ideasHelp],
    ["writing-ideas", "placeholder", fields.ideasPlaceholder],
    ["writing-suggestions-label", "textContent", fields.suggestionsLabel],
    ["writing-suggestions-help", "textContent", fields.suggestionsHelp],
    ["writing-suggestions", "placeholder", fields.suggestionsPlaceholder]
  ];
  for (const [elementId, property, value] of mapping) $(elementId)[property] = value;
}

function resetSourceForm() {
  state.source = null;
  state.version = null;
  state.versions = [];
  state.versionApproved = false;
  $("source-select").value = "";
  $("source-title").value = "";
  $("source-type").value = "lyrics";
  $("source-text").value = "";
  $("writing-ideas").value = "";
  $("writing-suggestions").value = "";
  updateWritingLabels();
  $("version-select").disabled = true;
  $("version-select").replaceChildren(new Option("No drafts saved yet", ""));
  $("version-info").textContent = "New writing. Your first save will create Version 1.";
  $("approval-info").textContent = "Approval is an explicit user decision.";
  $("approve-source").disabled = true;
  $("handoff-source").disabled = true;
}
async function loadSources(serial = state.projectLoadSerial, preferredSourceId = null, preferredVersionId = null) {
  const project = requireProject();
  const sources = await query(db.from("sources")
    .select("id,title,source_kind,created_at").eq("project_id", project.id)
    .order("created_at", { ascending: true }));
  if (serial !== state.projectLoadSerial) return;
  state.sources = sources || [];
  const picker = $("source-select");
  picker.replaceChildren(new Option("Start something new", ""));
  for (const source of state.sources) picker.add(new Option(source.title, source.id));
  const selected = state.sources.find((x) => x.id === preferredSourceId) || state.sources[0];
  if (selected) await chooseSource(selected.id, preferredVersionId);
  else resetSourceForm();
}
async function chooseSource(sourceId, preferredVersionId = null) {
  const source = state.sources.find((x) => x.id === sourceId);
  if (!source) { resetSourceForm(); return; }
  state.source = source;
  state.version = null;
  state.versionApproved = false;
  $("source-select").value = source.id;
  $("source-title").value = source.title;
  $("source-type").value = source.source_kind || "other";
  updateWritingLabels();
  const projectId = requireProject().id;
  const versions = await query(db.from("source_versions")
    .select("id,version_number,created_at,based_on_id,storage_path")
    .eq("project_id", projectId).eq("source_id", source.id)
    .order("version_number", { ascending: false }).limit(150));
  if (state.project?.id !== projectId || state.source?.id !== source.id) return;
  state.versions = versions || [];
  const picker = $("version-select");
  clear(picker);
  for (const v of state.versions) picker.add(new Option("Version " + v.version_number, v.id));
  picker.disabled = !state.versions.length;
  const chosen = state.versions.find((x) => x.id === preferredVersionId) || state.versions[0];
  if (chosen) await chooseVersion(chosen.id);
  else {
    $("source-text").value = "";
    $("writing-ideas").value = "";
    $("writing-suggestions").value = "";
    $("version-info").textContent = "This piece of writing has no saved drafts yet.";
    $("approve-source").disabled = true;
    $("handoff-source").disabled = true;
  }
}
async function chooseVersion(versionId) {
  const chosen = state.versions.find((x) => x.id === versionId);
  if (!chosen) return;
  const projectId = requireProject().id;
  const sourceId = state.source.id;
  const version = await query(db.from("source_versions")
    .select("id,source_id,version_number,content,ideas,suggested_text,storage_path,created_at,based_on_id")
    .eq("project_id", projectId).eq("source_id", sourceId)
    .eq("id", chosen.id).single());
  if (state.project?.id !== projectId || state.source?.id !== sourceId) return;
  state.version = version;
  $("version-select").value = version.id;
  $("source-text").value = version.content || "";
  $("writing-ideas").value = version.ideas || "";
  $("writing-suggestions").value = version.suggested_text || "";
  $("version-info").textContent = "Version " + version.version_number + " saved " +
    readableDate(version.created_at) + (version.storage_path ? " (stored file version)" : "");
  $("approve-source").disabled = false;
  await loadVersionApproval();
}
async function loadVersionApproval() {
  state.versionApproved = false;
  $("handoff-source").disabled = true;
  if (!state.version) return;
  const versionId = state.version.id;
  const { data, error } = await db.from("approvals")
    .select("decision,created_at").eq("project_id", state.project.id)
    .eq("source_version_id", versionId)
    .order("created_at", { ascending: false }).limit(1);
  if (error) throw error;
  if (state.version?.id !== versionId) return;
  const decision = data?.[0];
  state.versionApproved = decision?.decision === "approved";
  $("approval-info").textContent = decision
    ? "Latest decision: " + decision.decision + " on " + readableDate(decision.created_at)
    : "This version has not been approved.";
  $("handoff-source").disabled = !state.versionApproved;
}
async function saveSource() {
  const project = requireProject();
  const title = $("source-title").value.trim();
  const kind = $("source-type").value;
  const content = $("source-text").value;
  const ideas = $("writing-ideas").value;
  const suggestedText = $("writing-suggestions").value;
  if (!title) throw new Error("Enter a title for your song, poem or other writing.");
  if (![content, ideas, suggestedText].some((value) => value.trim())) {
    throw new Error("Write something in Current Writing, My Ideas, or Suggested Changes before saving.");
  }
  message("Saving your writing, ideas and suggestions as a new version…");
  let source = state.source;
  if (!source) {
    source = await query(db.from("sources").insert({
      project_id: project.id, title, source_kind: kind
    }).select("id,title,source_kind,created_at").single());
    // Retain the newly-created source if its first version insert later fails.
    // A retry then uses the same source rather than creating a duplicate.
    state.source = source;
  } else if (source.title !== title || source.source_kind !== kind) {
    source = await query(db.from("sources")
      .update({ title, source_kind: kind }).eq("id", source.id)
      .eq("project_id", project.id).select("id,title,source_kind,created_at").single());
  }
  const recent = await query(db.from("source_versions")
    .select("id,version_number").eq("project_id", project.id)
    .eq("source_id", source.id).order("version_number", { ascending: false }).limit(1));
  const previous = recent?.[0] || null;
  const nextNumber = previous ? previous.version_number + 1 : 1;
  const version = await query(db.from("source_versions").insert({
    project_id: project.id, source_id: source.id,
    version_number: nextNumber,
    content: content.trim() ? content : null,
    ideas: ideas.trim() ? ideas : null,
    suggested_text: suggestedText.trim() ? suggestedText : null,
    based_on_id: state.version?.id || previous?.id || null,
    change_note: nextNumber === 1 ? "Initial source" : "User saved a new version"
  }).select("id,version_number").single());
  await loadSources(state.projectLoadSerial, source.id, version.id);
  await studioWorkspace.refreshSources();
  message("Saved " + source.title + ", Version " + version.version_number + ". Current writing, ideas and suggested changes are stored separately. The draft remains unapproved until you approve it.");
}
async function approveVersion() {
  const project = requireProject();
  if (!state.version) throw new Error("Select a saved source version.");
  if (!window.confirm("Approve version " + state.version.version_number + " of " + state.source.title + "?")) return;
  await query(db.from("approvals").insert({
    project_id: project.id, source_version_id: state.version.id, decision: "approved",
    decided_by: state.user.id, note: "Approved by project owner in CBTeD manager"
  }));
  await loadVersionApproval();
  await studioWorkspace.refreshSources();
  message("Version " + state.version.version_number + " approved. Other versions remain unchanged.");
}
async function prepareHandoff() {
  const project = requireProject();
  if (!state.version || !state.versionApproved) throw new Error("Approve this source version first.");
  await query(db.from("handoffs").insert({
    project_id: project.id,
    from_studio: "writing", to_studio: "visual",
    source_version_id: state.version.id, status: "prepared",
    note: "Prepared for Visual Studio from approved Writing Studio source."
  }));
  await loadHandoffs();
  message("Visual handoff recorded. This does not generate an image or start an external studio.");
}

async function loadRules(serial = state.projectLoadSerial) {
  const projectId = requireProject().id;
  const rules = await query(db.from("project_rules")
    .select("id,scope,rule_key,rule_kind,body,revision_number,created_at")
    .eq("project_id", projectId).order("created_at", { ascending: false }).limit(300));
  if (serial !== state.projectLoadSerial) return;
  state.rules = rules || [];
  const current = new Map();
  for (const rule of state.rules) {
    const key = rule.scope + ":" + rule.rule_key;
    const old = current.get(key);
    if (!old || rule.revision_number > old.revision_number) current.set(key, rule);
  }
  const list = $("rules-list");
  clear(list);
  $("rules-empty").hidden = current.size !== 0;
  for (const rule of current.values()) {
    const li = el("li");
    li.append(el("strong", rule.rule_key + " (" + rule.scope + ", v" + rule.revision_number + ")"));
    li.append(el("span", " · " + rule.rule_kind, "meta"));
    li.append(el("p", rule.body));
    list.append(li);
  }
}
async function saveRule() {
  const project = requireProject();
  const scope = $("rule-scope").value;
  const ruleKey = $("rule-key").value.trim();
  const kind = $("rule-kind").value;
  const body = $("rule-body").value;
  if (!ruleKey || !body.trim()) throw new Error("Enter a rule name and rule text.");
  const prior = await query(db.from("project_rules")
    .select("id,revision_number").eq("project_id", project.id).eq("scope", scope)
    .eq("rule_key", ruleKey).order("revision_number", { ascending: false }).limit(1));
  const previous = prior?.[0] || null;
  await query(db.from("project_rules").insert({
    project_id: project.id, scope, rule_key: ruleKey, rule_kind: kind,
    body, revision_number: (previous?.revision_number || 0) + 1,
    supersedes_id: previous?.id || null, is_locked: true
  }));
  $("rule-key").value = "";
  $("rule-body").value = "";
  await loadRules();
  message("Project rule revision saved. Earlier revisions are preserved.");
}

async function loadAssets(serial = state.projectLoadSerial) {
  const projectId = requireProject().id;
  const assets = await query(db.from("assets")
    .select("id,filename,asset_role,storage_path,mime_type,created_at")
    .eq("project_id", projectId).order("created_at", { ascending: false }).limit(250));
  if (serial !== state.projectLoadSerial) return;
  state.assets = assets || [];
  const list = $("files-list");
  clear(list);
  $("files-empty").hidden = state.assets.length > 0;
  for (const asset of state.assets) {
    const li = el("li", undefined, "file-entry");
    const description = el("div");
    description.append(el("strong", asset.filename || "Unnamed file"));
    description.append(el("span", asset.asset_role + " · " + readableDate(asset.created_at), "meta"));
    const button = el("button", "Download", "secondary");
    button.type = "button";
    button.setAttribute("aria-label", "Download " + (asset.filename || "file"));
    button.addEventListener("click", handle(() => downloadAsset(asset)));
    li.append(description, button);
    list.append(li);
  }
}
async function uploadAsset() {
  const project = requireProject();
  const file = $("project-file").files?.[0];
  if (!file) throw new Error("Choose a file to upload.");
  const category = $("file-category").value;
  const path = state.user.id + "/" + project.id + "/" + category + "/" + id() + "-" + safeFileName(file.name);
  message("Uploading " + file.name + " privately…");
  const { error: uploadError } = await db.storage.from(STORAGE_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploadError) throw uploadError;
  try {
    await query(db.from("assets").insert({
      project_id: project.id, asset_role: category, filename: file.name,
      storage_path: path, mime_type: file.type || "application/octet-stream",
      metadata: { byte_size: file.size }
    }));
  } catch (error) {
    throw new Error("File upload succeeded, but its database record failed. Private file path: " +
      path + ". Cause: " + (error?.message || "unknown"));
  }
  $("project-file").value = "";
  await loadAssets();
  studioWorkspace.refreshAssets();
  message("File uploaded and recorded privately: " + file.name);
}
async function downloadAsset(asset) {
  const project = requireProject();
  if (!state.assets.some((item) => item.id === asset.id)) throw new Error("File is not in selected project.");
  message("Retrieving " + (asset.filename || "file") + "…");
  const { data, error } = await db.storage.from(STORAGE_BUCKET).download(asset.storage_path);
  if (error) throw error;
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = asset.filename || "cbted-file";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  message("Download requested for " + (asset.filename || "file") + ".");
}

async function loadTasks(serial = state.projectLoadSerial) {
  const projectId = requireProject().id;
  const tasks = await query(db.from("tasks")
    .select("id,studio,operation,status,requested_units,completed_units,current_step,created_at")
    .eq("project_id", projectId).order("created_at", { ascending: false }).limit(250));
  if (serial !== state.projectLoadSerial) return;
  state.tasks = tasks || [];
  const list = $("tasks-list");
  clear(list);
  $("tasks-empty").hidden = state.tasks.length > 0;
  for (const task of state.tasks) {
    const li = el("li", undefined, "task-entry");
    const description = el("div");
    description.append(el("strong", task.operation));
    description.append(el("span", task.studio + " · " + task.status + " · " +
      task.completed_units + "/" + task.requested_units + " verified units", "meta"));
    li.append(description);
    list.append(li);
  }
}
async function createTask() {
  const project = requireProject();
  const studio = $("task-studio").value;
  const operation = $("task-operation").value.trim();
  const units = Number($("task-units").value);
  if (!operation || !Number.isInteger(units) || units < 1 || units > 1000) {
    throw new Error("Enter a task and a valid number of outputs.");
  }
  await query(db.from("tasks").insert({
    project_id: project.id, studio, operation, requested_units: units,
    completed_units: 0, status: "pending", current_step: "awaiting execution"
  }));
  $("task-operation").value = "";
  await loadTasks();
  message("Task recorded for " + studio + ". No generation has been started.");
}
async function loadHandoffs(serial = state.projectLoadSerial) {
  const projectId = requireProject().id;
  const handoffs = await query(db.from("handoffs")
    .select("id,from_studio,to_studio,status,source_version_id,created_at")
    .eq("project_id", projectId).order("created_at", { ascending: false }).limit(150));
  if (serial !== state.projectLoadSerial) return;
  state.handoffs = handoffs || [];
  const list = $("handoffs-list");
  clear(list);
  $("handoffs-empty").hidden = !state.handoffs.length;
  for (const handoff of state.handoffs) {
    const li = el("li", undefined, "handoff-entry");
    li.append(el("strong", handoff.from_studio + " → " + handoff.to_studio));
    li.append(el("span", handoff.status + " · " + readableDate(handoff.created_at), "meta"));
    list.append(li);
  }
}

// Shared client-side studio controller. All reads and writes use the
// authenticated Supabase session; no private data enters GitHub.
const studioWorkspace = createStudioWorkspace({
  db,
  bucket: STORAGE_BUCKET,
  getContext: () => state,
  message,
  refreshProjects: (id) => loadProjects(id),
  refreshTasks: () => loadTasks(),
  refreshAssets: () => loadAssets()
});

$("auth-form").addEventListener("submit", handle(signIn));
$("sign-up").addEventListener("click", handle(signUp));
$("signup-dialog-close").addEventListener("click", () => $("signup-dialog").close());
$("sign-out").addEventListener("click", handle(async () => {
  const { error } = await db.auth.signOut();
  if (error) throw error;
  signedOut();
}));
$("project-form").addEventListener("submit", handle(createProject));
$("source-select").addEventListener("change", handle(async () => {
  if (!$("source-select").value) resetSourceForm();
  else await chooseSource($("source-select").value);
}));
$("version-select").addEventListener("change", handle(() => chooseVersion($("version-select").value)));
$("source-form").addEventListener("submit", handle(saveSource));
$("source-type").addEventListener("change", updateWritingLabels);
$("new-source").addEventListener("click", () => resetSourceForm());
$("approve-source").addEventListener("click", handle(approveVersion));
$("handoff-source").addEventListener("click", handle(prepareHandoff));
$("rule-form").addEventListener("submit", handle(saveRule));
$("file-form").addEventListener("submit", handle(uploadAsset));
$("task-form").addEventListener("submit", handle(createTask));

db.auth.onAuthStateChange((_event, session) => {
  // Avoid calling Supabase APIs synchronously inside the auth callback.
  setTimeout(() => syncSession(session).catch((error) => fail(error, "Session refresh failed")), 0);
});
try {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  await syncSession(data.session);
} catch (error) {
  fail(error, "Unable to start CBTeD");
}
