---
title: Limitations
description: What Tag List does not do.
order: 7
---

# Limitations

- **Removing a chip doesn't cleanly disassociate a native many-to-many
  relationship.** `ComponentFramework.WebApi` has no relationship-level
  disassociate call and no `execute()` for a custom one — only
  `createRecord`/`deleteRecord`/`updateRecord`/`retrieveRecord`/
  `retrieveMultipleRecords`. There is no documented way to do this through
  the public PCF SDK at all, for any control, not just this one. Removal
  calls `deleteRecord` against the bound entity, which only does the
  intended thing when the subgrid's view is bound to the join/intersect
  entity's own view rather than the relationship's virtual one — on a
  virtual relationship view, it will delete the wrong thing. Check which
  kind of view the subgrid is bound to before enabling removal on a real
  form.
- **No search-and-attach for an existing tag.** The add box always creates a
  brand-new record via `createRecord`; there's no lookup to find and
  associate a tag that already exists elsewhere. If your tag set is shared
  across records, this will create duplicates rather than reuse them.
- **`allowCreate: false` hides the add box, not the remove button.** To get
  a fully read-only chip list, disable the control itself (a business rule,
  field security, or form state), not just `allowCreate` — removal is gated
  on the control's disabled state, not on this property.
- **Canvas apps and custom pages are not supported.** The control's model
  (a Dataverse many-to-many relationship, a subgrid, `context.webAPI`
  create/delete calls) has no canvas equivalent — canvas data sources don't
  expose relationships the same way. Model-driven forms only.
- **No pagination or virtualization past `maxVisible`.** Chips beyond that
  count collapse into a "+N more" toggle, but the whole dataset still loads
  at once — this hasn't been tested against relationships with hundreds of
  related records, and likely degrades before then.
