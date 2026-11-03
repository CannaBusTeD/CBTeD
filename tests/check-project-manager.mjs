import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("app/index.html", "utf8");
const js = readFileSync("app/app.js", "utf8");
const config = readFileSync("app/config.js", "utf8");
const workflow = readFileSync(".github/workflows/deploy-cbted-manager.yml", "utf8");

assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/);
// Site branding must use the actual optimised emblem asset, not substitute art.
assert.match(html, /class="brand-emblem" src="\.\/assets\/cbted-emblem\.webp"/);
assert.match(html, /rel="icon" type="image\/webp"/);
assert.match(html, /CBTeD Studios \| Creative Project Manager/);
assert.match(html, /WRITING/);
assert.match(html, /VISUAL/);
assert.match(html, /ANIMATION/);
const css = readFileSync("app/styles.css", "utf8");
assert.match(css, /--ruby:#d14155/);
assert.match(css, /repeating-linear-gradient/);
assert.match(css, /\.brand-emblem/);
assert.match(css, /\.brand-studios/);

const actualIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const referencedIds = new Set([...js.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]));
const missing = [...referencedIds].filter((id) => !actualIds.has(id));
assert.deepEqual(missing, [], "JavaScript refers to HTML IDs that do not exist");

for (const required of [
  "auth-form", "project-form", "source-form", "rule-form", "file-form",
  "task-form", "source-select", "version-select", "source-text", "project-list",
  "writing-title-label", "writing-current-label", "writing-current-help",
  "writing-ideas", "writing-ideas-label", "writing-ideas-help",
  "writing-suggestions", "writing-suggestions-label", "writing-suggestions-help",
  "signup-dialog", "signup-dialog-title", "signup-dialog-description",
  "signup-dialog-instructions", "signup-dialog-close"
]) assert.ok(actualIds.has(required), "Missing required control: " + required);

assert.match(html, /<dialog id="signup-dialog"/);
assert.match(html, /aria-labelledby="signup-dialog-title"/);
assert.match(html, /aria-describedby="signup-dialog-description"/);
assert.match(js, /showRegistrationNotice\("submitted", email\)/);
assert.match(js, /showRegistrationNotice\("cooldown", email\)/);
assert.match(js, /showRegistrationNotice\("unconfirmed", email\)/);

// Current writing, personal ideas and suggested alternatives must be different fields.
assert.match(html, /My current lyrics/);
assert.match(html, /My ideas/);
assert.match(html, /Suggested lyrics \/ alternative lines/);
assert.match(html, /placeholder="Type your song title here"/);
assert.match(js, /writingFieldCopy/);
assert.match(js, /"writing-ideas"/);
assert.match(js, /"writing-suggestions"/);
assert.match(js, /ideas: ideas\.trim\(\) \? ideas : null/);
assert.match(js, /suggested_text: suggestedText\.trim\(\) \? suggestedText : null/);
assert.match(js, /content,ideas,suggested_text,storage_path/);

assert.match(js, /signInWithPassword/);
assert.match(js, /auth\.signUp/);
assert.match(js, /from\("projects"\)/);
assert.match(js, /from\("source_versions"\)/);
assert.match(js, /from\("approvals"\)/);
assert.match(js, /from\("project_rules"\)/);
assert.match(js, /from\("handoffs"\)/);
assert.match(js, /storage\.from\(STORAGE_BUCKET\)/);
assert.match(config, /loadPublicConfig/);
assert.ok(!config.includes("sb_secret_"), "Never include secret keys in browser config");
assert.ok(!config.includes("SUPABASE_SERVICE_ROLE_KEY"), "Do not reference service role in client config");
assert.match(workflow, /path: app/);

console.log("CBTeD project manager source checks passed: " +
  referencedIds.size + " referenced HTML IDs found.");
