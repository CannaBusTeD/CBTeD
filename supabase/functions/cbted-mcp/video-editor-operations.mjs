// Generated from Studio videoEditCommandsSchema.
export const videoOperations = {
  minItems: 1,
  maxItems: 32,
  type: "array",
  items: {
    anyOf: [
      {
        type: "object",
        properties: {
          op: {
            type: "string",
            const: "set_canvas",
          },
          aspect: {
            type: "string",
            enum: ["16:9", "9:16", "1:1", "4:5", "4:3", "7:3"],
          },
          fps: {
            anyOf: [
              {
                type: "number",
                const: 24,
              },
              {
                type: "number",
                const: 25,
              },
              {
                type: "number",
                const: 30,
              },
              {
                type: "number",
                const: 50,
              },
              {
                type: "number",
                const: 60,
              },
            ],
          },
          background: {
            type: "string",
            enum: ["blur", "black"],
          },
        },
        required: ["op"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          op: {
            type: "string",
            const: "add_media",
          },
          assetId: {
            type: "string",
            format: "uuid",
            pattern:
              "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          },
          track: {
            type: "string",
            enum: ["picture", "overlay", "music", "voice"],
          },
          inMs: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
          outMs: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
          index: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
          startMs: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
        },
        required: ["op", "assetId", "track"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          op: {
            type: "string",
            const: "add_title",
          },
          startMs: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
          endMs: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
          text: {
            type: "string",
            minLength: 1,
            maxLength: 120,
            pattern: "^[^\\p{Cc}\\p{Cs}]*$",
          },
          settings: {
            type: "object",
            properties: {
              position: {
                type: "string",
                enum: ["top", "centre", "bottom"],
              },
              entrance: {
                type: "string",
                enum: ["none", "fade", "rise"],
              },
              fadeInMs: {
                type: "integer",
                minimum: 0,
                maximum: 9007199254740991,
              },
              fadeOutMs: {
                type: "integer",
                minimum: 0,
                maximum: 9007199254740991,
              },
              style: {
                type: "object",
                properties: {
                  font: {
                    type: "string",
                    enum: [
                      "classic",
                      "editorial",
                      "typewriter",
                      "poster",
                      "rounded",
                    ],
                  },
                  size: {
                    type: "integer",
                    minimum: 3,
                    maximum: 15,
                  },
                  colour: {
                    type: "string",
                    pattern: "^#[a-fA-F0-9]{6}$",
                  },
                  align: {
                    type: "string",
                    enum: ["left", "centre", "right"],
                  },
                  box: {
                    type: "boolean",
                  },
                },
                additionalProperties: false,
              },
            },
            additionalProperties: false,
          },
        },
        required: ["op", "startMs", "endMs", "text"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          op: {
            type: "string",
            const: "set_title",
          },
          itemId: {
            type: "string",
            format: "uuid",
            pattern:
              "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          },
          startMs: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
          endMs: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
          text: {
            type: "string",
            maxLength: 120,
            pattern: "^[^\\p{Cc}\\p{Cs}]*$",
          },
          settings: {
            type: "object",
            properties: {
              position: {
                type: "string",
                enum: ["top", "centre", "bottom"],
              },
              entrance: {
                type: "string",
                enum: ["none", "fade", "rise"],
              },
              fadeInMs: {
                type: "integer",
                minimum: 0,
                maximum: 9007199254740991,
              },
              fadeOutMs: {
                type: "integer",
                minimum: 0,
                maximum: 9007199254740991,
              },
              style: {
                type: "object",
                properties: {
                  font: {
                    type: "string",
                    enum: [
                      "classic",
                      "editorial",
                      "typewriter",
                      "poster",
                      "rounded",
                    ],
                  },
                  size: {
                    type: "integer",
                    minimum: 3,
                    maximum: 15,
                  },
                  colour: {
                    type: "string",
                    pattern: "^#[a-fA-F0-9]{6}$",
                  },
                  align: {
                    type: "string",
                    enum: ["left", "centre", "right"],
                  },
                  box: {
                    type: "boolean",
                  },
                },
                additionalProperties: false,
              },
            },
            additionalProperties: false,
          },
        },
        required: ["op", "itemId"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          op: {
            type: "string",
            const: "set_picture",
          },
          itemId: {
            type: "string",
            format: "uuid",
            pattern:
              "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          },
          settings: {
            type: "object",
            properties: {
              framing: {
                type: "string",
                enum: ["fit", "fill"],
              },
              colour: {
                type: "string",
                enum: ["original", "vivid", "warm", "cool", "mono"],
              },
              tint: {
                type: "string",
                enum: ["none", "amber", "blue", "ink"],
              },
              mirror: {
                type: "boolean",
              },
              volume: {
                type: "integer",
                minimum: 0,
                maximum: 100,
              },
              fadeInMs: {
                type: "integer",
                minimum: 0,
                maximum: 9007199254740991,
              },
              fadeOutMs: {
                type: "integer",
                minimum: 0,
                maximum: 9007199254740991,
              },
              fadeMs: {
                anyOf: [
                  {
                    type: "number",
                    const: 0,
                  },
                  {
                    type: "number",
                    const: 250,
                  },
                  {
                    type: "number",
                    const: 500,
                  },
                ],
              },
              title: {
                type: "string",
                maxLength: 120,
                pattern: "^[^\\p{Cc}\\p{Cs}]*$",
              },
              titlePosition: {
                type: "string",
                enum: ["top", "centre", "bottom"],
              },
              titleStyle: {
                type: "object",
                properties: {
                  font: {
                    type: "string",
                    enum: [
                      "classic",
                      "editorial",
                      "typewriter",
                      "poster",
                      "rounded",
                    ],
                  },
                  size: {
                    type: "integer",
                    minimum: 3,
                    maximum: 15,
                  },
                  colour: {
                    type: "string",
                    pattern: "^#[a-fA-F0-9]{6}$",
                  },
                  align: {
                    type: "string",
                    enum: ["left", "centre", "right"],
                  },
                  box: {
                    type: "boolean",
                  },
                },
                required: ["font", "size", "colour", "align", "box"],
                additionalProperties: false,
              },
              adjustments: {
                type: "object",
                properties: {
                  brightness: {
                    type: "integer",
                    minimum: -100,
                    maximum: 100,
                  },
                  contrast: {
                    type: "integer",
                    minimum: -100,
                    maximum: 100,
                  },
                  saturation: {
                    type: "integer",
                    minimum: -100,
                    maximum: 100,
                  },
                },
                additionalProperties: false,
              },
            },
            additionalProperties: false,
          },
        },
        required: ["op", "itemId", "settings"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          op: {
            type: "string",
            const: "set_audio",
          },
          itemId: {
            type: "string",
            format: "uuid",
            pattern:
              "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          },
          settings: {
            type: "object",
            properties: {
              lane: {
                type: "string",
                enum: ["music", "voice"],
              },
              volume: {
                type: "integer",
                minimum: 0,
                maximum: 100,
              },
              fadeInMs: {
                type: "integer",
                minimum: 0,
                maximum: 9007199254740991,
              },
              fadeOutMs: {
                type: "integer",
                minimum: 0,
                maximum: 9007199254740991,
              },
            },
            additionalProperties: false,
          },
        },
        required: ["op", "itemId", "settings"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          op: {
            type: "string",
            const: "set_overlay",
          },
          itemId: {
            type: "string",
            format: "uuid",
            pattern:
              "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          },
          settings: {
            type: "object",
            properties: {
              position: {
                type: "string",
                enum: [
                  "top-left",
                  "top-right",
                  "centre",
                  "bottom-left",
                  "bottom-right",
                ],
              },
              opacity: {
                type: "integer",
                minimum: 0,
                maximum: 100,
              },
              scale: {
                type: "integer",
                minimum: 10,
                maximum: 100,
              },
              fadeInMs: {
                type: "integer",
                minimum: 0,
                maximum: 9007199254740991,
              },
              fadeOutMs: {
                type: "integer",
                minimum: 0,
                maximum: 9007199254740991,
              },
            },
            additionalProperties: false,
          },
        },
        required: ["op", "itemId", "settings"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          op: {
            type: "string",
            const: "trim_item",
          },
          itemId: {
            type: "string",
            format: "uuid",
            pattern:
              "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          },
          inMs: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
          outMs: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
          startMs: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
        },
        required: ["op", "itemId"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          op: {
            type: "string",
            const: "split_item",
          },
          itemId: {
            type: "string",
            format: "uuid",
            pattern:
              "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          },
          atMs: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
        },
        required: ["op", "itemId", "atMs"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          op: {
            type: "string",
            const: "move_item",
          },
          itemId: {
            type: "string",
            format: "uuid",
            pattern:
              "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          },
          index: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
          startMs: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
        },
        required: ["op", "itemId"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          op: {
            type: "string",
            const: "duplicate_item",
          },
          itemId: {
            type: "string",
            format: "uuid",
            pattern:
              "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          },
          index: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
          startMs: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
        },
        required: ["op", "itemId"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          op: {
            type: "string",
            const: "remove_item",
          },
          itemId: {
            type: "string",
            format: "uuid",
            pattern:
              "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          },
          ripple: {
            type: "boolean",
          },
        },
        required: ["op", "itemId"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          op: {
            type: "string",
            const: "cut_range",
          },
          startMs: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
          endMs: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
        },
        required: ["op", "startMs", "endMs"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          op: {
            type: "string",
            const: "set_volume_range",
          },
          startMs: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
          endMs: {
            type: "integer",
            minimum: 0,
            maximum: 9007199254740991,
          },
          track: {
            type: "string",
            enum: ["all", "picture", "music", "voice"],
          },
          volume: {
            type: "integer",
            minimum: 0,
            maximum: 100,
          },
        },
        required: ["op", "startMs", "endMs", "track", "volume"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          op: {
            type: "string",
            const: "detach_audio",
          },
          itemId: {
            type: "string",
            format: "uuid",
            pattern:
              "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          },
          track: {
            type: "string",
            enum: ["music", "voice"],
          },
        },
        required: ["op", "itemId"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          op: {
            type: "string",
            const: "clear_timeline",
          },
        },
        required: ["op"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          op: {
            type: "string",
            const: "replace_plan",
          },
          plan: {
            type: "object",
            propertyNames: {
              type: "string",
            },
            additionalProperties: {},
          },
        },
        required: ["op", "plan"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          op: {
            type: "string",
            const: "restore_revision",
          },
          revisionId: {
            type: "string",
            format: "uuid",
            pattern:
              "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          },
        },
        required: ["op", "revisionId"],
        additionalProperties: false,
      },
    ],
  },
};
