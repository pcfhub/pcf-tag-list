# pcf-tag-list — what building it taught us

A multi-select lookup for model-driven forms. 0.3.0 turned a create-only chip
list whose remove button could delete shared records into one that attaches,
creates and unlinks over whichever relationship the subgrid shows.

Why 0.3.0 was this release: the most repeated model-driven request in the
community is a multi-select lookup over a many-to-many (Microsoft's own needs
a Field Service licence; PCF Gallery lists several community ones that break in
views or read-only mode), and this control's own `docs/limitations.md` named
the same gap as two refusals. See the skill's *Pick the features outward*.

## The probe, 2026-09-23

A throwaway 0.2.2 build (`TagList/probe.ts`, since removed) was imported into a
real environment and called from the console on an **Account** form with a
native many-to-many subgrid of `cll_tag`. Answers as returned, with the
organisation host and record ids redacted (`<org>`, `<account>`, `<tag>`).

**P1 — what the subgrid hands over.**

```json
{
  "contextInfo": { "entityTypeName": "account", "entityId": "<account>", "entityRecordName": "Adventure Works (sample)" },
  "targetEntityType": "cll_tag",
  "viewId": "<view>",
  "linkedEntities": "(no getLinkedEntities)",
  "filter": null,
  "columns": [{ "name": "cll_tagname", "alias": "labelField", "dataType": "SingleLine.Text" }],
  "rows": 0, "totalResultCount": 0, "hasNextPage": false,
  "clientUrl": "https://<org>.crm.dynamics.com",
  "hasLookupObjects": true, "hasConfirmDialog": true
}
```

`getFilter()` is `null` on a relationship subgrid — the relationship is
invisible, as `pcf-chart-view` measured for a one-to-many. `contextInfo` names
the parent. (`linkedEntities` read `dataset.getLinkedEntities`, which lives on
`dataset.linking`; a probe bug, and chart-view already measured it empty.)

**P2 — relationships from metadata** (same-origin GET of `EntityDefinitions`).

```json
{
  "manyToMany": [{
    "SchemaName": "cll_Account_cll_Tag_cll_Tag",
    "Entity1LogicalName": "cll_tag", "Entity2LogicalName": "account",
    "IntersectEntityName": "cll_account_cll_tag",
    "Entity1NavigationPropertyName": "cll_Account_cll_Tag_cll_Tag",
    "Entity2NavigationPropertyName": "cll_Account_cll_Tag_cll_Tag"
  }],
  "manyToOneToParent": [{
    "SchemaName": "cll_Account_Account_cll_Tag",
    "ReferencedEntity": "account", "ReferencingAttribute": "cll_account",
    "ReferencingEntityNavigationPropertyName": "cll_Account"
  }],
  "manyToOneStatus": 200
}
```

The navigation property is the SchemaName on both sides. **The same two tables
have a many-to-many and a lookup**, and nothing in P1 says which the subgrid
shows — which is why `binding.ts` answers `ambiguous` and the control asks for
`relationshipName` rather than picking.

**P3 — `$ref` from a control.**

| Call | Status | Body | Rows after `refresh()` |
| --- | --- | --- | --- |
| POST `accounts(<account>)/cll_Account_cll_Tag_cll_Tag/$ref` | 204 | `""` | 1 |
| the same POST again | **204** | `""` | 1 |
| DELETE `accounts(<account>)/cll_Account_cll_Tag_cll_Tag(<tag>)/$ref` | 204 | `""` | 0 |
| the same DELETE again | **204** | `""` | 0 |

Both verbs work through a same-origin `fetch` with the OData headers and
`credentials: 'same-origin'`, and **both are idempotent**: a status says nothing
about whether anything changed. The dev rig now models exactly that.

**P4 — the type-ahead query.** `?$select=cll_tagid,cll_tagname&$filter=contains(cll_tagname,'a')&$orderby=cll_tagname&$top=8`
returned 3 rows including "Black" and "Power Apps": `contains` is
**case-insensitive**.

## What the harness found that the suite did not

With five chips loaded of fourteen, a search for "a" offered "Accessibility",
"Backlog" and "Performance" — all linked, on pages the dataset had not loaded.
Excluding the loaded chips was not enough. `service.ts` now reads every linked
id once through the parent's collection-valued navigation property
(`accounts(<id>)/<nav>?$select=<id column>`), keeps it current on its own
writes, and falls back to the loaded chips if the read fails. The suite asserts
it now (and was mutation-tested against it); it did not before the harness
showed it.

## What the form found that the harness did not (0.3.0 → 0.3.2)

Two measurements on the Account form, 2026-09-23, each of which killed a design:

- **0.3.0 — `position: absolute` under the field.** The searches went out and
  answered 200, and no list appeared, not even "Searching…": the subgrid's
  section ends at the field, and an ancestor clipped the list. The skill had
  said an inline popup is "not a risk worth taking blind" on a form section.
- **0.3.1 — `position: fixed`, in-flow when an ancestor would trap it.** The
  form *has* such an ancestor (a `transform`, `filter` or `contain` above the
  subgrid), so the list went in-flow and pushed the section open. It worked; it
  was not a dropdown, and the user said so.

**Nothing inside the form's tree can be both unclipped and overlaid**, so 0.3.2
takes the list out of it, as the platform's own lookup flyout does. A portal is
the usual way and is not available: ReactDOM is an external only behind
pcf-scripts' `pcfReactPlatformLibraries` flag, and a second bundled copy defeats
the platform library. `components/placement.ts` has React render the list in
place and moves that one `<ul>` into a layer at the end of `<body>`, placed
fixed against the field. Safe because the list is never conditionally
unmounted (toggled with `hidden`), so React only edits its children; clickable
because React 16 delegates events at `document`; themed because the control
copies its resolved `--TagList-*` properties onto the layer, which sits outside
the FluentProvider that publishes the tokens.

Checked in `dev/harness.html` with both form conditions on (`overflow: hidden`
with a tight height, and a transformed ancestor): the list is in the body layer,
visible at its centre point, the section grows by 0px, a click on "Dataverse"
links it, the theme is copied, one layer survives four remounts, and a real
unmount leaves no layer and nothing in `<body>`. No React warnings. The suite
renders without layout and sees none of this.

## Design decisions worth keeping

- **`allowCreate` kept its 0.2.x meaning** (false hides the add box, the
  documented read-only list), and `allowNewTags` is new. Making the search box
  appear on forms set to false would have been a changed default.
- **`parentLookupField` is not read as a relationship name.** On the probe's
  tables a 0.2.x value of `cll_account` would have picked the lookup under an
  N:N subgrid.
- **An ambiguous or unknown binding shows chips and changes nothing.** A wrong
  guess is harmless to data (P3: an unlink of an absent link is a 204 no-op)
  but leaves a chip on screen with no explanation.
- **The chip colour is a lower-case custom property**, `--taglist-chip-accent`:
  React 16.8's server renderer hyphenates capitals in a custom property name.

## Not verified

- **The linked-ids read** (`<set>(<id>)/<nav>?$select=…`) on a real form. Standard
  Web API, same URL family as P3, not called by the probe.
- **A one-to-many subgrid on a real form**: the bind, the `null` clear, and the
  `_<column>_value eq null` search filter. The bind and clear were measured by
  `pcf-data-table` 0.5.0 on another table; this control has not run them.
- **The junction-view signal.** `linkRows` is recognised by the label column's
  name containing `.` (a linked table's column). Unmeasured; no junction subgrid
  was probed.
- **Browse** on a real form: `lookupObjects` with `allowMultiSelect` and, for a
  one-to-many, the `filters` FetchXML condition.
- **A 403** for a user without Append / Append To — the message shape is the
  rig's, not the server's.
- **Load more** accumulating on this control's subgrid (bare `loadNextPage()`,
  after `pcf-compact-list`, which also has not seen it on a form).
- **The stylesheet on a real form**, including the dark theme and forced
  colours. Checked in `dev/harness.html` with `getComputedStyle` only.
- **The lifted list on the real form** (0.3.2): overlaid, clickable, themed,
  and following the field when the form scrolls. The form's own scroll container
  is an ancestor, so the capture-phase scroll listener should see it.

## Screenshots

`media/chips.png`, `search.png` and `narrow.png` are rendered by headless
Chrome from a page kept outside the repository, against `npm run harness` on port
8100: the built bundle and stylesheet, the dev fixture, the shipped English
strings, `--force-device-scale-factor=2`, `--virtual-time-budget=5000`, and
`*, *::before, *::after { transition: none }` (the focus underline is an
`::after`, and `*` alone left it mid-animation). Headless Chrome will not lay
out narrower than about 500px, so the narrow shot sets the root to 280px and
the window to 320px.

## History, briefly

- 0.1.x read `column.name` and `column.alias` backwards and rendered no chips on
  any real form; the fixture had set both to the same string. Explained where it
  matters, in `resolveChips()`'s comment and the fixture's header.
- 0.2.0 linked new tags to the parent through `contextInfo` and a metadata round
  trip for the entity set name, because a dataset control's input cannot be
  bound to a form column.
- 0.2.1's dev rig found `.finally()` without `.catch()`: a failed call was an
  unhandled rejection. 0.3.0 turns every failure into a sentence under the
  control, and the suite fails on any unhandled rejection.
- 0.2.x removed a chip with `deleteRecord` on the target table. On a native
  many-to-many that deleted the tag everywhere. Promoted to the skill's
  *`deleteRecord`, beyond the N:N trap*; fixed in 0.3.0.
