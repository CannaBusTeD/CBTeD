import { timelineProject } from "./video-timeline.mjs";
import { videoOperations } from "./video-editor-operations.mjs";

const editorApi = "https://studio.cannabusted.com/api/video-editor-agent";
const read = "cbted_video_editor_read";
const edit = "cbted_video_editor_edit";
const render = "cbted_video_editor_render";
const importFile = "cbted_video_editor_import";
const toolNames = new Set([read, edit, render, importFile]);
const readModes = [
  "timeline",
  "history",
  "status",
  "exports",
  "export_status",
  "media_preview",
  "commands",
];
const uuid = { type: "string", format: "uuid" };
const jobId = { type: "string", pattern: "^[a-f0-9]{64}$" };
const positive = { type: "integer", minimum: 1 };
const selector = {
  project_id: uuid,
  project_name: { type: "string", minLength: 1, maxLength: 200 },
  workspace: { type: "string", enum: ["personal"] },
};
const scopeHelp =
  "Supply the exact project_name, project_id, or workspace personal. Supply exactly one.";

export function videoEditorTools(tool) {
  return [
    tool(
      read,
      "Work in the same CBTeD Video Editor as the Studio website. Read timeline to get exact clip IDs, asset IDs, duration, media, canvas, and current revision. Use includePlan for all settings, history to restore older drafts, status for Mac availability, exports or export_status to find/download a render, media_preview for a deliberately requested private asset preview, and commands for the precise operation schema. " +
        scopeHelp,
      {
        ...selector,
        mode: { type: "string", enum: readModes },
        revisionId: uuid,
        assetQuery: { type: "string", maxLength: 255 },
        assetOffset: { type: "integer", minimum: 0 },
        includePlan: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        beforeVersion: positive,
        jobId,
        assetId: uuid,
      },
      [],
      true,
    ),
    tool(
      edit,
      "Edit a saved Studio timeline when the creator asks. Read the latest timeline first and use its latestRevisionId as expectedRevisionId, or null for a new draft. Times are milliseconds. Remove a moment from all tracks with cut_range. Remove one whole item with remove_item, and set ripple true on Picture to shift other tracks. Mute a moment with set_volume_range, volume 0 and track all or a named track. Set effects with set_picture/set_overlay/set_title. Add media from the editor library, trim/split/move/duplicate items, detach audio, change the canvas, or restore a revision. All operations save as one new draft. Use preview true to calculate without saving. Use a fresh requestId for each new request; only reuse it for an exact retry. This tool does not render or publish. " +
        scopeHelp,
      {
        ...selector,
        expectedRevisionId: { anyOf: [uuid, { type: "null" }] },
        requestId: uuid,
        operations: videoOperations,
        preview: { type: "boolean" },
      },
      ["expectedRevisionId", "requestId", "operations"],
      false,
    ),
    tool(
      render,
      "When the creator asks for export, render an exact saved revision as an MP4 on their private Mac, using a fresh attemptId. Reuse that ID for retries of the same request. Use read mode export_status to check when it is ready and get its authenticated Studio download page. Use save_export when the creator wants the completed MP4 in project assets. No social publishing. " +
        scopeHelp,
      {
        ...selector,
        mode: { type: "string", enum: ["render", "save_export"] },
        revisionId: uuid,
        attemptId: uuid,
        jobId,
      },
      ["mode"],
      false,
    ),
    {
      ...tool(
        importFile,
        "Import the file the creator attached in this chat into the chosen private Studio media library. Use only the actual ChatGPT file input. Returns a reusable Studio asset ID. Importing a file does not place it on the timeline. " +
          scopeHelp,
        {
          ...selector,
          file: {
            type: "object",
            additionalProperties: false,
            properties: {
              file_id: { type: "string" },
              download_url: { type: "string" },
              mime_type: { type: "string" },
              file_name: { type: "string" },
            },
            required: ["file_id", "download_url"],
          },
          durationMs: {
            ...positive,
            description:
              "Optional measured video or audio duration in milliseconds. Leave unknown duration unspecified.",
          },
        },
        ["file"],
        false,
      ),
      _meta: { "openai/fileParams": ["file"] },
    },
  ];
}

export function isVideoEditorTool(name) {
  return toolNames.has(name);
}

function values(input, keys) {
  return Object.fromEntries(
    keys
      .filter((key) => input[key] !== undefined)
      .map((key) => [key, input[key]]),
  );
}

const readFields = {
  timeline: ["revisionId", "assetQuery", "assetOffset", "includePlan", "limit"],
  history: ["limit", "beforeVersion"],
  status: [],
  exports: ["limit"],
  export_status: ["jobId"],
  media_preview: ["assetId"],
};

export async function runVideoEditorTool(
  name,
  input,
  rest,
  token,
  owner,
  fetchImpl,
) {
  const mode = input.mode ?? "timeline";
  if (name === read && mode === "commands") {
    const { $schema, ...operations } = videoOperations;
    return {
      operations,
      timing:
        "Milliseconds. Picture indices start at zero. Read the current timeline before editing.",
    };
  }
  let project;
  if (input.workspace !== undefined) {
    if (
      input.workspace !== "personal" ||
      input.project_id !== undefined ||
      input.project_name !== undefined
    )
      throw new Error("Choose either the personal editor or one project.");
  } else {
    project = await timelineProject(rest, token, owner, input);
  }
  let request;
  if (name === read && Object.hasOwn(readFields, mode)) {
    request = { action: mode, ...values(input, readFields[mode]) };
  } else if (name === edit) {
    request = {
      action: "edit",
      ...values(input, [
        "expectedRevisionId",
        "requestId",
        "operations",
        "preview",
      ]),
    };
  } else if (name === render && mode === "render") {
    request = {
      action: "render",
      ...values(input, ["revisionId", "attemptId"]),
    };
  } else if (name === render && mode === "save_export") {
    request = { action: "save_export", ...values(input, ["jobId"]) };
  } else if (name === importFile) {
    request = {
      action: "import_attachment",
      ...values(input, ["file", "durationMs"]),
    };
  } else {
    throw new Error("Choose a supported editor action.");
  }
  request.projectId = project?.id ?? null;
  let response;
  try {
    response = await fetchImpl(editorApi, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(110_000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });
  } catch {
    throw new Error(
      "Studio did not respond. Check the latest draft or export status before retrying.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Studio returned an invalid editor response.");
  }
  if (!response.ok)
    throw new Error(
      typeof data?.error === "string"
        ? data.error.slice(0, 400)
        : "Studio could not complete the editor action.",
    );
  return { ...data, projectTitle: project?.title ?? "Personal workspace" };
}
