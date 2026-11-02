import assert from "node:assert/strict";
import { writingFieldCopy } from "../app/writing-fields.mjs";

const song = writingFieldCopy("lyrics");
assert.equal(song.titleLabel, "Song title");
assert.equal(song.currentLabel, "My current lyrics");
assert.equal(song.ideasLabel, "My ideas");
assert.match(song.suggestionsLabel, /Suggested lyrics/);
assert.match(song.titlePlaceholder, /song title/i);
assert.match(song.ideasPlaceholder, /My ideas/);
assert.match(song.suggestionsPlaceholder, /Suggested lyrics/);
assert.match(song.suggestionsHelp, /won't replace your current lyrics/);

for (const type of ["lyrics", "poem", "story", "script", "treatment", "notes", "other"]) {
  const fields = writingFieldCopy(type);
  for (const field of [
    "titleLabel", "titlePlaceholder", "currentLabel", "currentHelp",
    "currentPlaceholder", "ideasLabel", "ideasHelp", "ideasPlaceholder",
    "suggestionsLabel", "suggestionsHelp", "suggestionsPlaceholder"
  ]) {
    assert.ok(typeof fields[field] === "string" && fields[field].length > 5,
      "Missing " + field + " for " + type);
  }
}
assert.match(writingFieldCopy("story").titleLabel, /Story/);
assert.match(writingFieldCopy("script").suggestionsLabel, /dialogue/);
assert.match(writingFieldCopy("poem").currentLabel, /poem/);
assert.match(writingFieldCopy("unexpected").currentLabel, /writing/);

console.log("Writing Studio field labels and placeholder tests passed.");
