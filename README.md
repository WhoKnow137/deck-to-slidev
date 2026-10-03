# `.deck` to Slidev

An offline command that turns a Figma Slides `.deck` into a self-contained Slidev source project. It reads the ZIP container and `canvas.fig` directly; it does not require the forensic scratch folder, a Figma login, or an AI agent.

This repository contains the converter source and a wholly synthetic test deck. Exported decks, extracted media, and generated Slidev projects are not included. The generated project bundles a pinned build of the [Studio addon fork](https://github.com/WhoKnow137/slidev-addon-studio).

## Use

The converter requires Node.js 20 or later; the generated Slidev project requires Node.js 22.12 or later. In this folder:

```powershell
npm ci
npm run convert -- ".\example.deck" --out ".\output\example-slidev"
```

Then, in the generated output folder, run `node install-slidev.mjs` and `npm run dev`. On Windows, `start-slidev.ps1` combines those steps:

```powershell
node install-slidev.mjs
.\start-slidev.ps1
```

`node install-slidev.mjs` installs the exact Slidev dependencies from the generated project's lockfile when they are missing. It skips an existing matching installation; `--force` reinstalls. It keeps npm's cache and temporary files in `.slidev-runtime` on the output drive, which also works when C: has no free space. Use `.\start-slidev.ps1` to launch Slidev on port 3200. The start script installs automatically if dependencies are missing. If PowerShell blocks scripts, run `powershell -NoProfile -ExecutionPolicy Bypass -File .\start-slidev.ps1`. Open the URL Slidev prints. Presenter notes are in the final HTML comment of each page. `npm run build` creates a static site; `npm run verify` checks node IDs, classification, and media hashes. Add `--build` to the conversion command to install, build, and verify automatically.

## Visual editing with Studio

Generated projects include the pinned local Studio fork `0.3.1-oe2-evidence.0`, its vendor archive, and a matching lockfile. Start Slidev in development mode, then press **E** or click the Studio button. Managed `StudioText` objects use the accepted text and typography editor. Managed `StudioLayer` objects use **Layer transform** for X/Y, W/H and rotation at their declared capability level. Drag previews are temporary; releasing the pointer saves one revision-guarded source transaction. Arrow keys move a selected layer by 1 slide unit, or 10 with Shift. Supported layers can be duplicated or deleted from the inspector. Undo/redo follows shared text/layer/structural source order. Presenter notes remain in each page's final HTML comment.

Fresh conversions promote safe root image, GIF and video frames to full geometry editing. Shapes, vectors, frames and instance roots support position and rotation with W/H disabled. Unsupported affine geometry is read-only. Nested children retain their parent-local source and resolve to their explicit root owner; generated path/gradient pieces are not separate editable layers. M6 adds guarded root delete, duplicate, reorder, simple frame reparent, cross-slide move and slide reorder/duplicate/delete. Paint/crop, media replacement, corners, path editing and component overrides remain unavailable. Plain Slidev renders the same saved geometry without the editor. Manual source editing is available through Slidev's side editor.

Rerun the same conversion command with the same output path to preserve local managed changes. `data/layer-provenance.json` records geometry ownership, source identity and subtree fingerprints; `layer-regeneration-report.json` reports unchanged, regenerated, locally modified, conflict, deleted and source-removed states. An unchanged local subtree can regenerate from changed source. Local changes are preserved, with a conflict reported when source changes too. Local deletion is not recreated; source removal is not silently deleted. A new layer without an ownership baseline requires explicit migration or fresh conversion. Older outputs keep rendering their existing components; this milestone does not silently promote their non-text objects. Use a new output directory to opt into the new layer grammar.

See [the OE0A contract and editing limits](https://github.com/WhoKnow137/slidev-addon-studio/blob/2c02b0ac79b5bc8fa0170affe53944b878403d3e/docs/OE0A.md). A synthetic managed-layer fixture can be prepared with `node tools/prepare-oe0a-fixture.mjs OUTPUT_DIR`, then run with the generated install/start scripts.

M6 uses a journal under `.studio-structural/` for multi-file structural commits and recovery. `data/structural-provenance.json` records local IDs, tombstones and moves; converter reruns preserve those states and report source/local conflicts. See [the M6 transaction contract](https://github.com/WhoKnow137/slidev-addon-studio/blob/2c02b0ac79b5bc8fa0170affe53944b878403d3e/docs/M6.md). A synthetic two-slide fixture can be prepared with `node tools/prepare-m6-fixture.mjs OUTPUT_DIR`.

OE0B/OE2 currently adds **read-only image-paint inspection** to fresh conversions. The ordered raw paint stack, missing/unknown fields, resource hashes, private mode/matrix and existing renderer projection are retained separately inside the managed source span. Layer opacity and paint opacity remain separate. No stable native paint ID is assigned; ambiguous stacks remain read-only. STRETCH is not classified as Crop. Native crop/mode, replacement, corners and appearance editing remain blocked on controlled Figma fixture exports. See [the evidence contract](https://github.com/WhoKnow137/slidev-addon-studio/blob/2c02b0ac79b5bc8fa0170affe53944b878403d3e/docs/OE2_EVIDENCE.md). Synthetic inspection candidates can be prepared with `node tools/prepare-oe2-evidence-fixture.mjs OUTPUT_DIR`; they are not native goldens.

If another Slidev server uses port 3200, run `.\start-slidev.ps1 -Port 3201` (or another free port).

Options:

- `--out PATH`: output directory; defaults to a sibling `INPUT-slidev` directory.
- `--limit N`: convert only the first N active slides; skipped slide sources are still retained.
- `--strict`: fail if the report contains any known fidelity warning. The inspectable staging directory remains next to the requested output.
- `--build`: install Slidev with the generated installer, then run `npm run build` and `npm run verify` before publishing the output.

The generated project contains `slides.md`, `pages/NNN.md`, `pages/skipped/`, a `data/slides/index.json` mapping every source slide ID to its page, `data/slides/NNN/{scene,media,notes}.json`, a typed `data/classification.json` with per-node source evidence, the exact `data/canvas.fig`, `data/assets.json`, `data/archive.json`, `data/interactions.json`, exact-byte `public/media/`, and `conversion-report.json`. The converter streams archive entries, checks CRC and SHA-1/SHA-256, rejects unsafe ZIP names, and verifies content-addressed media names. It never writes the source `.deck`.

To upgrade an older project generated by this converter, run `node bin/upgrade-studio.mjs OUTPUT_DIR` from the converter folder. It restructures legacy pages and updates the layout so Studio selects each text box independently. It saves changed pages and the original layout in a timestamped `.studio-migration-backup-*` directory. Install the addon in that project's `package.json` and lockfile as well.

## Fidelity and current limits

This version supports the `fig-deck` Kiwi v106 variant tested here. Unknown versions are rejected. Text and numeric measurements are decoded from Kiwi; media is copied byte-for-byte; vector paths are decoded from the source blobs; a referenced component instance is expanded from its symbol master. GIFs and videos retain their original archived bytes. Video autoplay, loop, mute, controls, speed, start, and end metadata are passed to a Slidev component with lazy loading.

An **exact visual match is not yet proven**. Browser font shaping can differ from Figma, and supplied font files have not been checked against Figma's font digests. A nonidentity FILL paint transform currently uses `object-fit: cover` with a warning; some crop edges may differ. Skipped slides are saved as editable source pages but are excluded from normal Slidev routes; a click from an active slide to a skipped slide is reported as unresolved. The report records every encountered known gap. Use `--strict` if any warning should block conversion.

Run `npm test` for parser and regression tests. Conversion reports provide structural and media-integrity counts for each input deck; they are not pixel-level certification.

## License

The converter is released under the [MIT License](LICENSE). The bundled Studio addon retains its own MIT license inside the vendor archive.

## Public test deck

`test/fixtures/public-minimal.deck` is generated entirely from scratch. It contains one slide and one colored shape, with no user artwork or uploaded media. `npm test` converts it into a temporary Slidev project and checks the resulting report and editable layer. To regenerate the binary fixture, use Node.js 24 or later and run `node tools/make-public-fixture.mjs`.
