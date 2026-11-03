import assert from "node:assert/strict";

const expected = "https://cannabusted.github.io/CBTeD/production.html";
const page = await fetch(expected,{redirect:"follow",signal:AbortSignal.timeout(20000)});
assert.equal(page.status,200,"Published Production Controller must return HTTP 200");
assert.ok((page.headers.get("content-type")||"").includes("text/html"),"Must serve HTML");
const html=await page.text();
assert.match(html,/<title>CBTeD \| Production Controller<\/title>/);
assert.match(html,/id="production-project"/);
assert.match(html,/id="production-workflow"/);
assert.match(html,/id="production-steps"/);
assert.match(html,/id="run-next"/);

const js = await fetch("https://cannabusted.github.io/CBTeD/production.js",{
  redirect:"follow",signal:AbortSignal.timeout(20000)
});
assert.equal(js.status,200,"Published production JavaScript must return HTTP 200");
assert.match(await js.text(),/execute-next/);
console.log("PASS: published CBTeD Production Controller HTML and JavaScript are reachable.");
