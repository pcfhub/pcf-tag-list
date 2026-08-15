# pcf-tag-list — scaffolded and building

Adopted from `_template` (`node scripts/setup.mjs --control TagList --namespace
PCFHub --slug pcf-tag-list ...`), real control code written, and verified end
to end with Microsoft's actual tooling — `npm run refreshTypes` and `npm run
build` both succeed (ESLint, `tsc`, webpack), producing a real
`out/controls/TagList/bundle.js` that calls `window.ComponentFramework
.registerControl`. Not a spec anymore; this section records what changed
between the draft and the thing that actually builds.

Picked to prove the hardest untested path in pcfhub's demo harness: a real
**dataset**-bound control (`ComponentFramework.PropertyTypes.DataSet` built
from a fixture — records, columns, paging, sorting, `refresh()`,
`openDatasetItem()`), which nothing published on the hub exercises yet.
`demo.fidelity: "mocked"` because adding/removing a tag associates/
disassociates the record in Dataverse — real WebAPI calls the harness can
only simulate (`resources/js/demo-harness/context/WebApi.ts`).

## What it does

Renders the bound dataset (`tags`) as removable chips
(`TagList/components/TagListControl.tsx`). Clicking a chip's `×` removes it;
typing in the add box and pressing Enter/Add creates a new tag; a chip's
label click fires `openDatasetItem()` on that record. Chips beyond
`maxVisible` collapse into a "+N more" toggle.

**Correction from the original draft:** "typing in the add box filters the
dataset and associates an existing tag" was the planned behaviour, but
building the add path against the real `ComponentFramework.WebApi` type
definitions showed there's no way to search-and-associate through it (see
below) — `onCreateTag` calls `webAPI.createRecord` instead. Searching
existing tags to attach one, versus always minting a new one, is a real
follow-up, not a demo-only gap.

## A real API-surface limitation, found by building it

The draft assumed a `context.webAPI.execute()` custom-action call to
disassociate a tag. Checked against the actual
`@types/powerapps-component-framework` type definitions in this exact
toolchain (`node_modules/@types/powerapps-component-framework/
componentframework.d.ts`): **`ComponentFramework.WebApi` has no `execute`
method at all** — only `createRecord`, `deleteRecord`, `updateRecord`,
`retrieveRecord`, `retrieveMultipleRecords`. There is no documented way for
a PCF control to disassociate a native Dataverse M:N relationship through
the public SDK, full stop — not a gap in this control, a gap in the
platform surface. `onRemoveTag` now calls `deleteRecord(dataset
.getTargetEntityType(), recordId)`, which only does the intended thing if
`tags` is bound to the join/intersect entity's own view rather than the
relationship's virtual one. That's a real constraint for whoever takes this
past the demo stage, not a shortcut I'm papering over.

The first version of this code called the nonexistent `execute()` and would
have failed at the `tsc` step; ESLint caught an unrelated unused-parameter
error on the same line first, which is what actually surfaced it.

## Manifest shape (`TagList/ControlManifest.Input.xml`)

- `<data-set name="tags">` with two `property-set` roles: `labelField`
  (bound, required — which column is the chip text) and `colorField`
  (bound, optional — which column tints the chip), each `of-type="SingleLine
  .Text"` directly (matching the project's own tested pattern in
  `ControlManifestParserTest`, not the `of-type-group` node the first draft
  used). At runtime a property-set-bound column's `name` is the property-set
  name itself (`labelField`/`colorField`), and its `alias` is whichever real
  column the maker mapped it to — `TagListControl.tsx`'s `resolveChips()`
  looks columns up by `name` and reads values by `alias`, and `demo/tags.json`
  was rewritten to use `labelField`/`colorField` as both name and alias to
  match (the original draft fixture used `name`/`color`, which doesn't
  resolve through that lookup at all).
- Inputs: `allowCreate` (`TwoOptions`, default `true` — hides the add affordance
  when false), `maxVisible` (`Whole.None`, default `12` — chips beyond this
  collapse into a "+N more" affordance, which is also what the `overflow`
  demo state below is for).
- Output: `selectedTagId` (`SingleLine.Text`) — the id of the last-opened tag,
  for a form to react to.
- `<feature-usage><uses-feature name="WebAPI" required="true" /></feature-usage>`
  — documents why this can never be `full` fidelity.

## Demo

- `demo.datasetFixture: "demo/tags.json"` — six sample tags (id/name/color),
  shaped exactly as `DataSet.ts` requires (`targetEntityType`, `title`,
  `columns[].{name,displayName,dataType,alias,order,visualSizeFactor}`,
  `records[].{id,values}`). This seeds the **default** preset on first sync.
- `demo.presets` in `pcfhub.json` can only carry `props` (`ManifestPreset`
  has no per-preset fixture field — confirmed against
  `app/Modules/Ingestion/Data/ManifestPreset.php`). The **empty** state (zero
  chips) and **overflow** state (30+ chips, proving wrap/collapse instead of
  a fixed-width layout bug) are *not* declared here — they get added as
  additional `demo_presets` rows through the admin preset editor after the
  first sync, each with its own `dataset_fixture` JSON. That's the existing,
  tested path (`DemoPresetManagementTest`), not a gap.

## Bundle path was also wrong, and not the only place

The draft declared `demo.bundle: "out/controls/PCFHub.TagList/bundle.js"` —
guessed from `pcf-code-editor`'s `pcfhub.json`, which declares `out/controls/
PCF.CodeEditor/bundle.js`. The real `pcf-scripts build` output for *both*
controls is just the constructor name (`out/controls/TagList/bundle.js`,
`out/controls/CodeEditor/bundle.js`), no namespace prefix — confirmed by
actually running the build, not by reading either manifest. **So
pcf-code-editor's own already-published `pcfhub.json` has the same wrong
path.** It turns out not to matter operationally: `.github/workflows/
release.yml` finds the bundle by recursive glob
(`Get-ChildItem out/controls -Filter bundle.js -Recurse`) and re-attaches it
under a fixed asset name, and `SyncComponentFromRepository.php`'s
`demo_bundle` artifact pattern defaults to matching that literal asset name
(`'bundle.js'`) — `demo.bundle` in `pcfhub.json` isn't consulted by ingestion
at all, near as I can tell from reading that code path. It's documentation,
not a live contract, but documentation should still be true, so this
control's copy is fixed. Worth someone fixing pcf-code-editor's copy too,
separately from this task.

## Still open

- Category: set to `data` (existing hub category) — reasonable but not
  confirmed against how the hub actually buckets dataset-view controls.
- `docs/*.md` are still the template's empty stubs — not written.
- No GitHub repo exists yet; this is a local scaffold under
  `C:\dev\pcf-components\pcf-tag-list` with `npm install` run and a working
  build, not yet `git init`'d or pushed anywhere.
- Solution packaging (`msbuild` via the Windows-only release workflow) was
  not attempted — only the Node/webpack half of the pipeline (`pcf-scripts
  build`) was verified locally.
- The "search existing tags to associate" behaviour noted above under
  "What it does" is unimplemented; `onCreateTag` always mints a new tag.
