// Writing Studio field language, kept separate from storage identifiers.
// Labels adapt to what the user is writing; storage remains content / ideas / suggested_text.
const generic = {
  titleLabel: "Writing title",
  titlePlaceholder: "Type a title for this piece of writing",
  currentLabel: "My current writing",
  currentHelp: "Paste the writing you already have. Leave it blank if you only have ideas so far.",
  currentPlaceholder: "My current writing: paste or type what I've written so far.",
  ideasLabel: "My ideas",
  ideasHelp: "Your thoughts, direction, images and rough notes go here, separate from the finished writing.",
  ideasPlaceholder: "My ideas: what I want this piece to say, explore or become.",
  suggestionsLabel: "Suggested changes / alternative writing",
  suggestionsHelp: "Put possible rewrites here. They don't replace the current writing.",
  suggestionsPlaceholder: "Suggested changes: alternative wording or passages to consider."
};

const byKind = {
  lyrics: {
    titleLabel: "Song title",
    titlePlaceholder: "Type your song title here",
    currentLabel: "My current lyrics",
    currentHelp: "These are the lyrics you've written already. Leave this blank if you're still working out the idea.",
    currentPlaceholder: "My current lyrics: paste or type the lyrics I have so far.",
    ideasLabel: "My ideas",
    ideasHelp: "Themes, images, musical direction, rough lines and notes go here, not in your finished lyrics.",
    ideasPlaceholder: "My ideas: what this song is about, images I want to use, lines I'm thinking about.",
    suggestionsLabel: "Suggested lyrics / alternative lines",
    suggestionsHelp: "Put possible rewrites or suggested lines here. They remain suggestions and won't replace your current lyrics.",
    suggestionsPlaceholder: "Suggested lyrics: alternative lines, verses or choruses to consider."
  },
  poem: {
    titleLabel: "Poem title",
    titlePlaceholder: "Type your poem title here",
    currentLabel: "My current poem",
    currentPlaceholder: "My current poem: type or paste the poem as it stands.",
    ideasLabel: "My ideas for the poem",
    ideasPlaceholder: "My ideas: images, themes and fragments I might use.",
    suggestionsLabel: "Suggested lines for the poem",
    suggestionsPlaceholder: "Suggested lines: wording or alternative stanzas to consider."
  },
  story: {
    titleLabel: "Story title",
    titlePlaceholder: "Type your story title here",
    currentLabel: "My current story",
    currentPlaceholder: "My current story: paste the draft or the part I've written.",
    ideasLabel: "My story ideas",
    ideasPlaceholder: "My story ideas: plot, characters, scenes, twists and endings.",
    suggestionsLabel: "Suggested story changes",
    suggestionsPlaceholder: "Suggested changes: passages or scene ideas to consider."
  },
  script: {
    titleLabel: "Script title",
    titlePlaceholder: "Type your script or scene title here",
    currentLabel: "My current script",
    currentPlaceholder: "My current script: paste scenes, action and dialogue as written.",
    ideasLabel: "My scene ideas",
    ideasPlaceholder: "My ideas: scenes, characters, dialogue beats and visual moments.",
    suggestionsLabel: "Suggested dialogue or scenes",
    suggestionsPlaceholder: "Suggested scenes: alternate dialogue, actions or sequences."
  },
  treatment: {
    titleLabel: "Film or story title",
    titlePlaceholder: "Type the film or story title here",
    currentLabel: "My current treatment",
    currentPlaceholder: "My current treatment: the outline or story plan as it stands.",
    ideasLabel: "My project ideas",
    ideasPlaceholder: "My ideas: possible events, scenes, characters and story developments.",
    suggestionsLabel: "Suggested changes to the treatment",
    suggestionsPlaceholder: "Suggested changes: alternate story directions or scenes."
  },
  notes: {
    titleLabel: "Notes title",
    titlePlaceholder: "What are these notes about?",
    currentLabel: "My current notes",
    currentPlaceholder: "My current notes: what I have written down so far.",
    ideasLabel: "More ideas",
    ideasPlaceholder: "More ideas: anything else I'm considering.",
    suggestionsLabel: "Possible alternatives",
    suggestionsPlaceholder: "Possible alternatives: wording or approaches I might try."
  }
};

export function writingFieldCopy(kind) {
  return { ...generic, ...(byKind[kind] || {}) };
}
