# CBTeD Studios visual identity

Version: 0.1
Authority: Artist-supplied approved emblem `app/assets/cbted-emblem.webp`, derived without redesigning the supplied source image. The website asset is an optimised 96 × 96 WebP rendition for small-screen and favicon use; keep the user's original high-resolution image as the master when preparing larger graphics.

## Brand name

**CBTeD Studios**. In emblem typography, the main oversized engraved letters are C, B, T and D, tightly set together. A small lowercase **e** sits inside the magnifying-glass lens at the base between the T and D. The letters and lens are one visual lockup. Do not replace the lowercase e with a capital or another letter. Do not open up the letter spacing between T and D.

"STUDIOS" is the accompanying word in distressed embossed steel with deep crimson insets. In the website header it is reproduced as accessible HTML text with an engraved styling treatment; for marketing art, use the separately approved visual asset when available rather than claiming the HTML approximation is that source.

## Key imagery

- Realistic worked gunmetal/steel: bevelled edges, patina, worn engraved surfaces, scratches, dark recesses.
- Deep-crimson velvet backdrop with visible folded fabric.
- Twisted crimson rope around the emblem's outer wheel.
- Four genuinely faceted ruby stones mounted at the cardinal points in metal.
- Industrial cog ring, metal bolts, red recesses and magnifying glass are part of the supplied emblem.
- The emblem is the project logo, **not** a prompt to introduce additional props, characters or drug-related motifs.

## Interface colours

| Usage | Token | Colour |
| --- | --- | --- |
| Dark background | `--bg` | `#110c10` |
| Gunmetal card | `--panel` | `#211d21` |
| Silver text | `--text` | `#fff9f6` |
| Muted silver | `--muted` | `#e1d4d5` |
| Ruby primary action | `--accent` | `#b72c43` |
| Highlight ruby | `--ruby` | `#d14155` |
| Steel border | `--line` | `#756970` |

Ruby is an accent, not a text-only signal for errors or approvals. Maintain high-contrast text, clear labels and visible focus outlines so the design remains usable with magnification and screen readers.

## Website implementation

- Emblem: `app/assets/cbted-emblem.webp` (transparent, genuine resized copy from the supplied image).
- Header and favicon: `app/index.html`.
- Gunmetal, red-velvet and ruby styling: `app/styles.css`.
- Source check for logo links and styling: `tests/check-project-manager.mjs`.
- Application functionality and user data remain separate from this presentation layer.

## Continuity rules

New site screens, login, project selection, Writing Studio, Visual Studio, Animation Studio, approvals and handoff screens should share the same header, palette and visual family. Use consistent typography, tactile metallic borders and a restrained velvet accent without sacrificing readability. Preserve the established logo precisely; do not generate a new or altered brand image automatically when a smaller layout is needed. Use the supplied image and scale it.

Future updates can add large-format original artwork and an independently approved high-resolution wordmark. Do not enlarge the current small web optimisation beyond its intended crisp display size.
