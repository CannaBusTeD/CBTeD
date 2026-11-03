// CBTeD Studios: shared project navigation, saved studio setups, and real
// preproduction record creation. No generation provider is connected here.
// Private user content is read/written with the signed-in Supabase session.

const $ = (name) => document.getElementById(name);
const studios = ["project", "writing", "visual", "animation", "run"];
const assetSelectors = [
  "visual-character-asset", "visual-style-asset",
  "visual-location-asset", "visual-object-asset", "animation-start-asset"
];
const writingSelectors = ["visual-source-ref", "animation-source-ref"];
const fields = {
  visual: [
    "visual-purpose", "visual-source-ref", "visual-concept", "visual-source-moment",
    "visual-count", "visual-ratio", "visual-world", "visual-characters",
    "visual-camera", "visual-continuity", "visual-restrictions",
    "visual-character-asset", "visual-style-asset", "visual-location-asset",
    "visual-object-asset", "visual-thumbnail-title"
  ],
  animation: [
    "animation-source-ref", "animation-start-asset", "animation-goal",
    "animation-count", "animation-seconds", "animation-ratio",
    "animation-provider", "animation-subject", "animation-camera",
    "animation-atmosphere", "animation-audio", "animation-continuity"
  ]
};
const defaults = {
  visual: {
    "visual-purpose": "song", "visual-count": "1", "visual-ratio": "16:9"
  },
  animation: {
    "animation-count": "1", "animation-seconds": "10",
    "animation-ratio": "16:9", "animation-provider": "unselected"
  }
};

export function createStudioWorkspace({ db, getContext, message, refreshProjects, refreshTasks }) {
  const state = {
    projectId: null,
    settings: { visual: null, animation: null },
    approvedWriting: [],
    runs: [],
    latestRun: null,
    busy: false
  };
  const text = (id, value) => { $(id).textContent = value; };
  const fail = (error) => {
    console.error("CBTeD studio action failed", error);
    message("Studio action failed: " + (error?.message || "Unexpected error"), true);
  };
  async function runQuery(promise) {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
  }
  const assertProject = () => {
    const project = getContext().project;
    if (!project || project.id !== state.projectId) throw Error("Select a project first.");
    return project;
  };
  const safeAction = (handler) => async (event) => {
    event.preventDefault();
    if (state.busy) return;
    state.busy = true;
    const control = event.currentTarget.querySelector?.('button[type="submit"]') || event.currentTarget;
    control.setAttribute("aria-busy", "true");
    try { await handler(event); }
    catch(error) { fail(error); }
    finally {
      control.removeAttribute("aria-busy");
      state.busy = false;
    }
  };

  function openStudio(studio) {
    if (!studios.includes(studio)) return;
    $("studio-selector").value = studio;
    for (const name of studios) {
      $("page-" + name).hidden = name !== studio;
    }
    if (studio === "run") showPreflight();
    const names = {
      project: "Project setup",
      writing: "Writing Studio",
      visual: "Visual Studio",
      animation: "Animation Studio",
      run: "Production control"
    };
    text("studio-nav-help", names[studio] +
      ". Your other studio pages are still available using this selector.");
  }

  function currentInputs(studio) {
    const snapshot = {};
    for (const key of fields[studio]) snapshot[key] = $(key).value;
    return snapshot;
  }
  function renderInputs(studio, settings) {
    const config = settings || defaults[studio];
    for (const key of fields[studio]) {
      $(key).value = config[key] ?? defaults[studio][key] ?? "";
    }
  }

  function populateAssetOptions() {
    const assets = getContext().assets || [];
    const imageAssets = assets.filter((asset) =>
      (asset.mime_type || "").startsWith("image/") ||
      ["images", "references"].includes(asset.asset_role)
    );
    for (const selector of assetSelectors) {
      const element = $(selector);
      const previous = element.value;
      const initial = element.options[0]?.textContent || "No image selected";
      element.replaceChildren(new Option(initial, ""));
      for (const asset of imageAssets) {
        element.add(new Option(asset.filename || "Unnamed image", asset.id));
      }
      if ([...element.options].some((option) => option.value === previous)) element.value = previous;
    }
  }

  async function reloadApprovedWriting() {
    if (!state.projectId) return;
    const projectId = state.projectId;
    const approvalEvents = await runQuery(db.from("approvals")
      .select("source_version_id,decision,created_at").eq("project_id", projectId)
      .not("source_version_id", "is", null).order("created_at", { ascending: false }).limit(500));
    if (projectId !== state.projectId) return;
    const latestDecisions = new Map();
    for (const event of approvalEvents || []) {
      if (!latestDecisions.has(event.source_version_id)) {
        latestDecisions.set(event.source_version_id, event.decision);
      }
    }
    const approvedIds = [...latestDecisions.entries()]
      .filter(([, decision]) => decision === "approved").map(([id]) => id);
    let versions = [];
    if (approvedIds.length) {
      versions = await runQuery(db.from("source_versions")
        .select("id,source_id,version_number").eq("project_id", projectId).in("id", approvedIds));
    }
    if (projectId !== state.projectId) return;
    const sources = getContext().sources || [];
    state.approvedWriting = (versions || []).map((v) => ({
      ...v, title: sources.find((s) => s.id === v.source_id)?.title || "Saved writing"
    })).sort((a,b) => a.title.localeCompare(b.title) || b.version_number - a.version_number);
    for (const pickerId of writingSelectors) {
      const picker = $(pickerId);
      const previous = picker.value;
      const placeholder = pickerId === "visual-source-ref"
        ? "Independent visual concept, without writing"
        : "Independent animation concept";
      picker.replaceChildren(new Option(placeholder, ""));
      for (const source of state.approvedWriting) {
        picker.add(new Option(source.title + " (approved version " + source.version_number + ")", source.id));
      }
      if ([...picker.options].some((opt) => opt.value === previous)) picker.value = previous;
    }
    // Always restore saved approved source references after reloading options.
    for (const studio of ["visual","animation"]) {
      const saved = state.settings[studio]?.settings;
      const refId = studio === "visual" ? "visual-source-ref" : "animation-source-ref";
      if (saved?.[refId] && state.approvedWriting.some((x) => x.id === saved[refId])) {
        if (!$(refId).value) $(refId).value = saved[refId];
      }
    }
  }

  async function loadSettings(studio) {
    const projectId = assertProject().id;
    const rows = await runQuery(db.from("studio_settings")
      .select("id,studio,version_number,settings,source_version_id,created_at")
      .eq("project_id", projectId).eq("studio", studio)
      .order("version_number", { ascending: false }).limit(1));
    if (state.projectId !== projectId) return;
    state.settings[studio] = rows?.[0] || null;
    renderInputs(studio, rows?.[0]?.settings || null);
    const label = studio === "visual" ? "visual-save-info" : "animation-save-info";
    text(label, rows?.[0]
      ? "Saved setup version " + rows[0].version_number + " (" + new Date(rows[0].created_at).toLocaleString() + ")."
      : "No " + (studio === "visual" ? "Visual" : "Animation") + " setup saved yet.");
  }

  async function saveSettings(studio) {
    const project = assertProject();
    const snapshot = currentInputs(studio);
    const main = studio === "visual" ? "visual-concept" : "animation-goal";
    if (!snapshot[main]?.trim()) {
      throw Error("Describe what you want to " + (studio === "visual" ? "see in your images" : "happen in the video") + ".");
    }
    const count = Number(snapshot[studio + "-count"]);
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      throw Error("Choose between 1 and 50 separate outputs.");
    }
    if (studio === "animation" && (!Number.isInteger(Number(snapshot["animation-seconds"])) ||
       Number(snapshot["animation-seconds"]) < 1 || Number(snapshot["animation-seconds"]) > 300)) {
      throw Error("Enter a valid duration between 1 and 300 seconds.");
    }
    const assetIds = new Set((getContext().assets || []).map((a) => a.id));
    for (const field of assetSelectors.filter((field) => field.startsWith(studio + "-"))) {
      if (snapshot[field] && !assetIds.has(snapshot[field])) throw Error("An image reference is no longer in your project.");
    }
    const sourceRef = snapshot[studio === "visual" ? "visual-source-ref" : "animation-source-ref"];
    if (sourceRef && !state.approvedWriting.some((s) => s.id === sourceRef)) {
      throw Error("The selected writing must have a currently approved saved version.");
    }
    const prev = state.settings[studio]?.version_number || 0;
    const row = await runQuery(db.from("studio_settings").insert({
      project_id: project.id, studio, version_number: prev + 1,
      settings: snapshot, source_version_id: sourceRef || null
    }).select("id,version_number,settings,created_at,source_version_id").single());
    state.settings[studio] = { ...row,studio };
    text(studio + "-save-info", "Saved setup version " + row.version_number +
      ". Earlier settings remain preserved.");
    message((studio === "visual" ? "Visual" : "Animation") + " Studio settings saved as version " +
      row.version_number + ". No media was generated.");
    showPreflight();
  }

  async function saveProjectDetails() {
    const project = assertProject();
    const title = $("project-display-title").value.trim();
    const description = $("project-description").value;
    if (!title) throw Error("Enter a project title.");
    const saved = await runQuery(db.from("projects").update({
      title, description, updated_at: new Date().toISOString()
    }).eq("id", project.id).select("id,title,description").single());
    text("project-save-info", "Saved project title and description.");
    message("Project details saved: " + saved.title);
    await refreshProjects(saved.id);
    openStudio("project");
  }

  function selectedStages() {
    return ["writing","visual","animation"].filter((studio) => $("run-" + studio).checked);
  }
  function preflightErrors() {
    const stages = selectedStages();
    const context = getContext();
    const errors = [];
    if (!stages.length) errors.push("Choose at least one studio.");
    if (stages.includes("writing") && !context.version) {
      errors.push("Writing: save a writing draft first.");
    }
    if (stages.includes("visual") && !state.settings.visual) {
      errors.push("Visual: save the Visual setup first.");
    }
    if (stages.includes("animation") && !state.settings.animation) {
      errors.push("Animation: save the Animation setup first.");
    }
    if (stages.includes("animation") && state.settings.animation &&
      !state.settings.animation.settings["animation-start-asset"]) {
      errors.push("Animation: choose an uploaded start image and save the Animation setup.");
    }
    return errors;
  }
  function showPreflight() {
    if (!state.projectId) return;
    const stages = selectedStages();
    const errors = preflightErrors();
    const node = $("run-preflight");
    node.replaceChildren();
    if (errors.length) {
      node.append(document.createTextNode("Not ready: " + errors.join(" ")));
      node.classList.add("has-errors");
    } else {
      node.append(document.createTextNode("Ready to prepare " +
        stages.map((stage) => stage[0].toUpperCase() + stage.slice(1)).join(", ") +
        ". GO will record a production brief and create tasks awaiting provider execution."));
      node.classList.remove("has-errors");
    }
    $("run-submit").disabled = errors.length > 0;
  }

  async function loadRuns() {
    const projectId = assertProject().id;
    const rows = await runQuery(db.from("project_runs")
      .select("id,status,created_at,stage_selection,snapshot")
      .eq("project_id", projectId).order("created_at", { ascending: false }).limit(30));
    if (projectId !== state.projectId) return;
    state.runs = rows || [];
    state.latestRun = state.runs[0] || null;
    const list = $("runs-list");
    list.replaceChildren();
    $("runs-empty").hidden = state.runs.length > 0;
    $("download-brief").disabled = !state.latestRun;
    for (const run of state.runs) {
      const li = document.createElement("li");
      const stageNames = Object.keys(run.stage_selection || {}).filter((k) => run.stage_selection[k]);
      li.textContent = new Date(run.created_at).toLocaleString() +
        " · " + run.status + " · " + stageNames.join(", ");
      list.append(li);
    }
  }

  async function runProduction() {
    const project = assertProject();
    const errors = preflightErrors();
    if (errors.length) throw Error(errors.join(" "));
    const stages = selectedStages();
    const context = getContext();
    // Retrieve every source and approval at execution time; do not rely solely
    // on cached settings when determining which version is authoritative.
    const wantedSourceIds = [
      ...(stages.includes("writing") && context.version ? [context.version.id] : []),
      ...stages.filter((stage) => stage !== "writing")
        .map((stage) => state.settings[stage]?.source_version_id).filter(Boolean)
    ];
    const uniqSourceIds = [...new Set(wantedSourceIds)];
    let sources = [];
    if (uniqSourceIds.length) {
      sources = await runQuery(db.from("source_versions")
        .select("id,source_id,version_number,content,ideas,suggested_text,created_at")
        .eq("project_id", project.id).in("id", uniqSourceIds));
      if ((sources || []).length !== uniqSourceIds.length) throw Error("One of the source versions is missing.");
    }
    // Recheck accepted approvals before handing a source to Visual/Animation.
    await reloadApprovedWriting();
    for (const stage of stages.filter((s) => s !== "writing")) {
      const approvedSource = state.settings[stage]?.source_version_id;
      if (approvedSource && !state.approvedWriting.some((s) => s.id === approvedSource)) {
        throw Error(stage + " setup points to writing that is no longer approved.");
      }
    }
    const currentRules = new Map();
    for (const item of context.rules || []) {
      const key = item.scope + "|" + item.rule_key;
      if (!currentRules.has(key) || currentRules.get(key).revision_number < item.revision_number)
        currentRules.set(key,item);
    }
    const assets = (context.assets || []).map((asset) => ({
      id: asset.id, role: asset.asset_role, filename: asset.filename,
      mime_type: asset.mime_type, storage_path: asset.storage_path
    }));
    const snapshot = {
      project: { id: project.id, title: project.title, description: project.description || "" },
      writing: sources || [],
      rules: [...currentRules.values()].map(({scope,rule_key,revision_number,body}) =>
        ({scope,rule_key,revision_number,body})),
      assets,
      studio_settings: Object.fromEntries(stages.filter((s) => s !== "writing").map((studio) => [
        studio,{ id: state.settings[studio].id, version: state.settings[studio].version_number,
          settings: state.settings[studio].settings,
          source_version_id: state.settings[studio].source_version_id }
      ])),
      execution: {
        kind: "preproduction_only",
        media_generation_connected: false,
        description: "Production brief prepared; generation and editing providers are not connected.",
        unit_rule: "Each generated image or video clip requires a distinct tool execution and inspection."
      }
    };
    const selection = Object.fromEntries(stages.map((studio) => [studio,true]));
    const requestId = crypto.randomUUID();
    message("Preparing a traceable production run…");
    const run = await runQuery(db.from("project_runs").insert({
      project_id: project.id, request_id: requestId,
      stage_selection: selection, snapshot, status: "prepared"
    }).select("id,status,created_at,stage_selection,snapshot").single());
    // Save one explicit blocked task per requested studio. No unperformed output is
    // recorded as completed. The retained run snapshot allows safe recovery.
    const tasks = [];
    for (const studio of stages) {
      const configuration = state.settings[studio]?.settings || {};
      const units = studio === "writing" ? 1 : Number(configuration[studio + "-count"]) || 1;
      tasks.push({
        project_id: project.id, run_id: run.id, studio,
        operation: studio === "writing" ? "Writing Studio from saved source" :
          studio === "visual" ? "Generate separate images from saved Visual Studio setup" :
          "Animate separate clips from saved Animation Studio setup",
        status: "blocked", current_step: "Awaiting connected and authorised creative execution provider",
        requested_units: units, completed_units: 0,
        source_version_id: studio === "writing" ? context.version?.id || null :
          state.settings[studio]?.source_version_id || null,
        start_asset_id: studio === "animation" ? configuration["animation-start-asset"] || null : null,
        requirements: {
          source: "saved_project_run", run_id: run.id,
          studio_setup_version: state.settings[studio]?.version_number || null,
          provider_connected: false
        }
      });
    }
    try {
      await runQuery(db.from("tasks").insert(tasks).select("id,studio,status,run_id"));
    } catch (error) {
      await loadRuns();
      text("run-status", "The production snapshot was saved, but task creation failed. " +
        "The run remains recoverable. " + (error?.message || ""));
      throw error;
    }
    await loadRuns();
    await refreshTasks();
    text("run-status", "Production brief saved and " + stages.length +
      " studio task(s) created. All generation tasks are waiting for a provider connection.");
    message("Production run recorded. The production brief can be downloaded. No AI media generated.");
  }

  function downloadBrief() {
    if (!state.latestRun) throw Error("No saved production run to download.");
    const run = state.latestRun;
    const content = JSON.stringify({
      title: "CBTeD Studios production brief",
      run_id: run.id,
      created_at: run.created_at,
      status: run.status,
      stages: run.stage_selection,
      ...run.snapshot
    }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "CBTeD-production-" + run.id.slice(0,8) + ".json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    message("Production brief download requested.");
  }

  async function loadProject(project) {
    state.projectId = project.id;
    state.approvedWriting = [];
    state.settings = { visual: null, animation: null };
    state.latestRun = null;
    $("project-display-title").value = project.title;
    $("project-description").value = project.description || "";
    text("project-save-info", "Save any changes to the project title or description.");
    openStudio("project");
    populateAssetOptions();
    await reloadApprovedWriting();
    if (state.projectId !== project.id) return;
    await loadSettings("visual");
    if (state.projectId !== project.id) return;
    await loadSettings("animation");
    if (state.projectId !== project.id) return;
    // Load approved writing list again after settings, so references are selected.
    await reloadApprovedWriting();
    if (state.projectId !== project.id) return;
    populateAssetOptions();
    for (const studio of ["visual","animation"]) {
      const saved = state.settings[studio]?.settings;
      if (!saved) continue;
      for (const key of assetSelectors.filter((x) => x.startsWith(studio + "-"))) {
        if (saved[key] && [...$(key).options].some((option) => option.value === saved[key]))
          $(key).value = saved[key];
      }
    }
    await loadRuns();
    showPreflight();
  }

  $("studio-selector").addEventListener("change", (event) => openStudio(event.target.value));
  $("project-settings-form").addEventListener("submit", safeAction(saveProjectDetails));
  $("visual-form").addEventListener("submit", safeAction(() => saveSettings("visual")));
  $("animation-form").addEventListener("submit", safeAction(() => saveSettings("animation")));
  $("run-form").addEventListener("submit", safeAction(runProduction));
  $("download-brief").addEventListener("click", safeAction(downloadBrief));
  for (const studio of ["writing","visual","animation"]) {
    $("run-" + studio).addEventListener("change", showPreflight);
  }
  return {
    loadProject,
    refreshAssets: populateAssetOptions,
    refreshSources: reloadApprovedWriting,
    openStudio
  };
}
