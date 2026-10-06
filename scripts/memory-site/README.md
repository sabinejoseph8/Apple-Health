# Clarivi Memory site builder

Builds the Clarivi Memory site (https://claude.ai/artifact/5Aw5x3PYAro7pDXQRkapTe) from the five project memory files in `docs/`: product-spec.md, design.md, tech-spec.md, progress.md and mvp.md. The site has one tab per file; the Plan tab's ticks live in the page's own database, not in the page, so they survive every rebuild.

## Refreshing the site

1. Once, on a new Mac: `.venv/bin/pip install -r scripts/memory-site/requirements.txt`
2. Optional, so new or reworded tasks match their old ticks: save the site's ticks with the ArtifactData tool (`list` on collection `tasks` with `out_dir`).
3. Build: `.venv/bin/python scripts/memory-site/build.py --ticks <that folder>`
   It writes `private/memory-site/index.html` (git ignores `private/`) and updates `assets/task-ids.json`. It names any new task ids and any ids no longer in the plan.
4. Check: `node scripts/memory-site/check.mjs`. It looks at the page at desktop and phone width, in light and dark, for page errors and anything wider than the screen. Pass `--mermaid <path to mermaid.min.js>` to the build first if the diagrams should be checked too.
5. Publish `private/memory-site/index.html` to the same artifact URL with the Artifact tool, leaving out `icon` and `capabilities` so they carry over. Commit the updated `assets/task-ids.json`.
6. Tick tasks done since the last build with ArtifactData: one document per task in `tasks`, id = the task id, `{done, done_at, text, by}`. A `- [x]` in progress.md also shows as done.

## How it works

- `mdlib.py` reads the Markdown; `common.py` holds shared pieces; `tab_*.py` turn each file's sections into the site's cards, lists and diagrams.
- Task ids (`p1a-01`, `p2-03`, `p6-14` ...) are kept by matching each task's words with `assets/task-ids.json`, so a tick never moves to the wrong task when tasks are added or reworded. `OVERRIDES` in `taskids.py` pins a task whose words changed too much.
- `assets/` holds what isn't in the Markdown: the page's styles and script, the drawn design previews (in the app's current words, D85), and the diagrams. Change a diagram in `assets/mermaid.json`.
- R-numbers link to the product spec's requirements, except on the MVP tab, where R1 to R26 are the MVP's own risks. D-numbers link to the MVP tab's decision register from every tab.

The repository is public: the site shows only what the project memory files already hold.
