# pcf-tag-list — what building it taught us

A multi-select lookup for model-driven forms. 0.3.0 turned a create-only chip
list whose remove button could delete shared records into one that attaches,
creates and unlinks over whichever relationship the subgrid shows.

## 0.5.1 / 0.5.2 — adding and removing keep what Load more brought in

`pcf-kanban-board` found it on a form (2026-09-29, its 0.4.1): a dataset
`refresh()` starts the view again at its first page. Every write here ended
with one — attach, create, Browse, remove — so after **Load more** each change
dropped every chip past page one, and a tag just attached that sorted past it
was not shown at all. Now no write refreshes: each resolves what it changed
(the tag, the tags linked, `true`), and the list shows an added tag first and
hides a removed one from its own state, each retiring when the rows agree.

The rig was moved onto the template's host first (`9619109`); against its
page-one refresh, restoring the refresh in `attach` fails "6 loaded, then 2".
In the harness, a page-size-2 many-to-many list after Load more twice:
removing a third-page tag left the other five; Browse put "Power Apps" first
with the five kept.

| | Look at | Right way | Measured |
| --- | --- | --- | --- |
| W1 | A record with more tags than a page: **+N more**, **Load more** until all show, remove one from the last page | That chip goes; the rest stay | **Passed** 2026-09-29 (0.5.1) |
| W2 | Attach a tag by typing and picking it | It appears first; the rest stay | **Passed** 2026-09-29 (0.5.1) |
| W3 | **Browse**, pick two | Both appear first; the rest stay | **Passed** 2026-09-29 (0.5.1) |
| W4 | Create a new tag | It appears first | **Passed** 2026-09-29 (0.5.1) |
| W5 | Reload the form | Every tag in the view's order, the added ones among them | **Passed** 2026-09-29 (0.5.1) |
| W6 | Create a tag from the list, then press its **x** | It goes, and the count with it |  **Passed** 2026-09-29 (0.5.2) |

**W1–W5 passed on 0.5.1 (2026-09-29); W6 found the fault 0.5.2 fixes.** Creating a tag and then removing it unlinked it and left the chip: a removal hid rows only, and a tag the list had just added is in no row — only in its "added" list. The held state is `TagList/chips.ts` since 0.5.2, pure and loaded by the suite through `dev/modules.js`, so this state is asserted rather than assumed; 0.5.1 was never tagged.

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

## What the form found that the harness did not (0.3.0 → 0.3.3)

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
unmounted (toggled with `hidden`), so React only edits its children; themed because the control
copies its resolved `--TagList-*` properties onto the layer, which sits outside
the FluentProvider that publishes the tokens.

**Then the form found a third (0.3.2 → 0.3.3): the options could not be
clicked.** The list floated, stayed attached on scroll, and Browse carried the
text — all confirmed on the form — and a press on an option or "Create" did
nothing. 0.3.2 used React `onMouseDown` on each option, relying on React 16
delegating events at `document`. The platform's React on this form delegates at
the control's own container, as React 17+ does, and the list had been moved out
of it; the harness ran React 16, where it worked. 0.3.3 puts plain `mousedown`
and `mouseover` listeners on the list itself, reading the option from a
`data-index`, with no React pointer handlers left to fire twice. The harness
now has that host as a switch, on by default: it stops pointer events from the
lifted layer before `document`, and was checked to do so.

Checked in `dev/harness.html` with both form conditions on (`overflow: hidden`
with a tight height, and a transformed ancestor): the list is in the body layer,
visible at its centre point, the section grows by 0px, a click on "Dataverse"
links it, the theme is copied, one layer survives four remounts, and a real
unmount leaves no layer and nothing in `<body>`. With React 17+ delegation
simulated, a real mouse click on an option links it exactly once and a click on
"Create" creates and links; with it off (React 16), one click is still one link.
No React warnings. The suite
renders without layout and sees none of this.

## The demo, and the property that was taken back (0.4.0 → 0.5.0)

The hub's harness had no `contextInfo`, no `page`, a `webAPI` rejecting every
call, and a dataset rebuilt from `demo/tags.json` on every render, so 0.3.x
demoed as its no-record notice. 0.4.0 added a `sampleData` input the control
played against instead. It worked and was rejected: a property that exists only
for the demo sits in every maker's panel on a real form. 0.5.0 removes it.

The data moved to the demo instead. The hub's harness now reads an optional
`dataverse` section in a dataset fixture (the hub repository's
`docs/demo-harness-dataverse.md`) and answers `contextInfo`, `getClientUrl`,
`getEntityMetadata`, an OData subset on `webAPI`, relationship metadata, `$ref`
and `lookupObjects` from it. `demo/tags.json` declares the probe's shape (an
N:N *and* a lookup between account and tag), so the "more than one
relationship" preset is the control reading real metadata, not a declared
state. Checked in the hub's own harness from its Vite dev server: search, a
clicked suggestion, create, unlink, Browse with two picks, the ambiguous
preset and Reset.

**A refused request shows since 2026-09-28.** pcfhub/pcfhub#53 let a fixture
declare faults, but a link fault matched only the record in the `$ref` URL, and
every link here starts from the one account on the form. So it could refuse
every tag or none. pcfhub/pcfhub#55 lets a link fault name either record, as
a plugin on the Associate message sees both. `demo/tags.json` now refuses
disassociating *Key account* and associating *Pricing exception*.

Checked with 0.5.0's published bundle against that harness, before the push:

- × on Key account left the chip, with "Key account could not be removed. Key
  account is set by the account team and cannot be removed here." under the
  chips;
- picking Pricing exception from the list added nothing, with "Pricing exception
  could not be added. A pricing exception needs a manager's approval before it
  can be tagged.";
- Upsell linked and EMEA unlinked as before.

**The list is absolute, not fixed** (0.5.0). In the hub's demo 0.4.0's fixed
list flipped up over the chips, because the frame is sized to its content and
the hub's measure-height deliberately skips fixed subtrees, so the frame never
grew and there was never room below. The list is now absolute inside a layer
at the page's origin, which the hub measures and grows to fit, and it flips
upward only with at least 160px above.

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

## Confirmed on a real form after 0.5.0 (2026-09-23)

Reported from the form, not measured request by request:

- **A one-to-many subgrid**: attaching binds the lookup, removing clears it
  (`null`), and the search offers only tags no other record owns.
- **The linked-ids read** (`<set>(<id>)/<nav>?$select=…`): suggestions leave out
  tags the record has on pages the subgrid has not loaded.
- **Browse**: `lookupObjects` with `allowMultiSelect`, opening on what was typed
  (`searchText`), and the one-to-many `filters` condition.
- **Load more**: bare `loadNextPage()` on this control's subgrid.
- **The suggestion list** positioned absolute in its body-level layer.
- **The dark theme**, on both a one-to-many and a many-to-many subgrid: chips,
  the add box, Browse and +N more follow the host's dark tokens. Dark mode is
  not a supported model-driven setting yet (Microsoft Learn, *Modern,
  refreshed look*), so this was seen through the host's dark theme flag.

## 0.5.3: a list left open over the header

pcf-lookup-search 0.3.0 was reported with its list riding up over the form's
header after the form scrolled, and this list is placed the same way: in a
layer at the end of `<body>`, re-placed against the field on every scroll.
Measured on the test form, 2026-10-14, on 0.5.2: with `a` typed, a scroll
that put the field at y 200 — above the form's scroller, which starts at 286 —
left the list drawn at 233–433, over the header.

0.5.3 closes the list when less than half the field is visible, through the
shared `lib/close-when-hidden` (the template's copy). Walked on the form at
1100×650: a 60px scroll kept the list and it followed the field (field 390,
list 423); the scroll that put the field at 230 closed it, with `p` still in
the box and the form left where it was scrolled. A list closed this way, or
by Escape, keeps focus in the box, where focus alone cannot reopen it, so the
box now opens the list on a click as well; a click on the focused box did.

## 0.5.4: focus survives a remove, an add and Load more

Three presses left a keyboard user on the page body:
- **A chip's remove** set `disabled` while the unlink ran. When the unlink finished, the chip left and took its button with it.
- **The add box** set `disabled` while a tag attached, so Enter on an option blurred it.
- ***Load more*** set `disabled` while its page loaded.

Chrome blurs a focused element that becomes disabled at the next rendering
update, and re-enabling it gives nothing back. Measured in Chrome 152 on
2026-10-29: still focused straight after `disabled = true`, gone two frames
later. The workspace's `check-template` warning on `disabled={busy}` found
these, not a report.

The fix:
- **The remove button and *Load more*** use `aria-disabled`, and the press is refused by state.
- **The add box** is `readOnly` and `aria-busy` while it attaches. `choose` and `browse` already refused while `adding`.
- **A removed chip** hands focus to the next chip's remove, else the previous one's, else the add box. This happens only when focus really was lost, so a user who clicked elsewhere keeps their place.

**`npm run focus`** presses Enter in headless Chrome on the harness and reads
`document.activeElement` (`dev/focus.js`).
- **Its harness writes are slowed to 400 ms.** The harness answers within a frame, which hides the blur entirely.
- **Before the fix**, against the 0.5.3 build: the remove left focus on `body`, and so did the add box. *Load more* kept it, because the harness pages synchronously and never reaches the slow path.
- **After the fix:** focus on the next chip's remove ("Remove Bug"), on the add box, and on *Load more*.

**On the form, 2026-10-29** (0.5.4 imported, the subgrid list on the
account's General tab). **Remove Black** was focused and pressed with a real
Enter. This list removes without a confirmation, and focus landed on
**Remove Blue**. Then *Black* was typed into the add box and Enter pressed.
For this binding a removed tag's row is deleted, so the list offered
*Create "Black"*, and the tag came back as a new row. The box was read-only
for the first half-second and focused throughout. The list reads as it did
before the check.

## Not verified

- **The form's own dialog.** A remove confirms through
  `openConfirmDialog`, which on a form moves focus into the dialog and back.
  The harness's dialog resolves without moving focus at all, so the hand-back
  is the walkthrough's to see.
- **The junction-view signal.** `linkRows` is recognised by the label column's
  name containing `.` (a linked table's column). Unmeasured; no junction subgrid
  was probed.
- **A 403** for a user without Append / Append To — the message shape is the
  rig's, not the server's.
- **Forced colours (high contrast) on a real form.** Checked in
  `dev/harness.html` with `getComputedStyle` only.

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
- 0.4.0 added a demo-only `sampleData` input; 0.5.0 removed it in favour of a
  stand-in Dataverse in the hub's harness.
