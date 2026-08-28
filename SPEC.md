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

## No tags ever showed, on a real form — `name`/`alias` were backwards

Reported as: bind the control to a real view, get zero chips, regardless of
how many related tag records actually exist.

`resolveChips()` in `TagListControl.tsx` looked up the property-set columns
by `column.name === 'labelField'`/`'colorField'` and read record values by
`column.alias`. That's exactly backwards. Confirmed against the platform's
own type comments (`Column.name`: "unique name of the column";
`EntityRecord.getFormattedValue`'s `columnName` param) and two independent
write-ups of this exact property-set pattern, not assumed:
`column.alias` holds the property-set's own role name (`labelField`, fixed,
from the manifest), and `column.name` holds the *real* schema name of
whichever column the maker actually bound in their view. `getFormattedValue`
takes the latter. So on a real form, `dataset.columns.find((c) => c.name ===
'labelField')` can never match — the maker's real column is never literally
named `labelField` — `labelColumn` comes back `undefined`, `resolveChips`
hits its `!labelColumn` guard, and the control silently renders zero chips
no matter what's actually bound. Fixed by swapping both: find by `.alias`,
read by `.name`.

This shipped and reached `npm run build`/`lint`/`check` clean because
`demo/tags.json` masked it completely: the original fixture set `name` and
`alias` to the *same* string (`"labelField"`/`"colorField"`) for both
columns, so a lookup by either field found the same column and returned the
same value — self-consistently wrong in a way nothing in this repo could
catch. `resources/js/demo-harness/context/DataSet.ts`'s `getFormattedValue`
doesn't help either: it's a dumb `record.values[columnName]` passthrough
with no view-resolution rules of its own, so it can't tell a correct lookup
key from a wrong one that happens to match a fixture. Rewrote the fixture to
use realistic, *distinct* schema names (`cr123_tagname`/`cr123_tagcolor`)
for `name`, keeping `alias` as the role name — the shape an actual bound
view has — so this class of bug fails in the demo instead of only in
production. Checked both directions by hand before and after the fix
(simulating `resolveChips`'s lookup against the fixture): the corrected
`alias`-then-`.name` lookup resolves all six chips; the original
`name`-then-`.alias` lookup returns `undefined` for `labelColumn` against
the corrected fixture, which is what should have failed the demo from the
start.

## New tags weren't linked to the host record

`onCreateTag` called `webAPI.createRecord(dataset.getTargetEntityType(), { name: label })`
and nothing else — that mints a standalone record in the tag entity, not one
associated to whatever record the control is mounted on. Reported as: create
a tag, it exists, but it doesn't show up as related to the record you created
it from.

The instinct is to read the current record's id/table from `context` and
`@odata.bind` it in. The documented route, per the component framework FAQ
("Can I access form context like I can in model-driven apps event
handlers?"), is a bound `SingleLine.Text` input property the maker wires to
the host record's primary key column, plus one bound to `entitylogicalname`.
**First attempt used that** (`parentRecordId`/`parentEntityName` properties) —
wrong, because that binding option (Microsoft's screenshot shows it against a
plain form field) doesn't exist in the maker UI for a property on a
dataset/subgrid control; there's no "bind to form column" there, only Static
value. Confirmed by trying to configure it, not by reading further docs.

What actually works, and is what `TagList/index.ts`'s `createTag()` uses now,
is `context.mode.contextInfo.{entityId,entityTypeName}` — populated by the
platform on every model-driven form, but **absent from
`@types/powerapps-component-framework`** (hence the cast), and absent from
the official API reference too. Undocumented, not unreal: multiple
independent reports of it working, and nothing else exposes this without
either a bound property (unavailable here, see above) or a hard dependency on
the global `Xrm` client API, which the demo harness and canvas-app hosting
can't provide. Treated as another thing that can be missing, same as an
unbound `parentLookupField` — `createTag()` falls back to creating the tag
unlinked and logs a `console.warn` rather than throwing, since `contextInfo`
won't exist outside a model-driven form (canvas apps, this project's own demo
harness).

`parentLookupField` (`SingleLine.Text`, optional) is still a bound property —
it has to be, since it names an arbitrary schema column on the tag entity
(which lookup points back to the parent), not something `contextInfo` or any
platform metadata call can tell the control. `@odata.bind` addresses also
need the parent's *entity set* name (plural), not `contextInfo.entityTypeName`
(logical, singular) — resolved through `context.utils.getEntityMetadata()` at
create time, since there's no static logical-name → set-name mapping
available to a control.

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

## Localisation

Added Spanish (`3082`), French (`1036`), German (`1031`), and Japanese
(`1041`) alongside the base `1033` (English) resx, each registered as its own
`<resx>` in `<resources>`. All five carry the same key set — checked, not
assumed (`grep 'data name=' TagList/strings/*.resx`, all five identical).

Two different consumers read these, and only one of them was actually wired
up before now:

- **Maker-configuration strings** (`display-name-key`/`description-key` on
  every `<property>`) were already fully localised — that's the properties
  pane and the hub's API reference, resolved from the resx matching the
  Dataverse org's provisioned language.
- **Runtime UI strings** — "Add", the add-box placeholder, "No tags yet", the
  "+N more" toggle, and the chip's "Remove {label}" `aria-label` — were
  hardcoded English literals in `TagListControl.tsx`, not resx-backed at all.
  Moved to six new keys (`TagList_Loading`, `TagList_Empty`,
  `TagList_MoreButton`, `TagList_RemoveLabel`, `TagList_AddPlaceholder`,
  `TagList_AddButton`), read through `context.resources.getString()` in
  `index.ts` and threaded into `TagListControl` as a `getString` prop.
  `getString` does no interpolation of its own, so `{0}` placeholders
  (`TagList_MoreButton`, `TagList_RemoveLabel`) are substituted with a plain
  `.replace('{0}', …)` in the component.

Confirmed against `resources/js/demo-harness/context/Resources.ts` in
pcfhub: the demo harness's `getString` already reads real resx-exported
strings keyed by id (`resources.strings`, PLAN.md §12.3), not a fixture — so
these six keys flow through the hub's demo automatically once ingested,
no harness change needed.

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

## A failed Web API call is an unhandled rejection

Found by the dev rig on its first run, which did not fail an assertion — it
**ended the Node process**, which is what an unhandled promise rejection does
there.

`onRemoveTag` chains `.finally(() => dataset.refresh())` onto
`webAPI.deleteRecord` and no `.catch`. `createTag` has the same shape. So a
rejected call — a plugin refusing the delete, a privilege the user does not
have, the record already gone — produces an unhandled rejection. In a browser
that is a console error nobody sees: the view refreshes, the tag is still
there, and the control says nothing about why.

Deliberately **not** fixed here, because it is not a one-line change. `IProps`
carries no error surface, so somebody has to decide what the user is told — a
message on the chip, a status line, a toast — and that is a design decision
rather than a missing `catch`. The smoke suite carries a comment where the
assertion would go, and `dev/host.js` already supports `webApiFails: true` to
drive it once there is a decision to assert.

## Still open

- The unhandled rejection above.
- Category: set to `data` (existing hub category) — reasonable but not
  confirmed against how the hub actually buckets dataset-view controls.
- `docs/*.md` are still the template's empty stubs — not written.
- The "search existing tags to associate" behaviour noted above under
  "What it does" is unimplemented; `onCreateTag` always mints a new tag.
