---
title: Migrating to 0.3.0
description: What changed from 0.2.x, and what a maker has to do about it.
appliesTo: ">=0.3.0"
order: 9
---

# Migrating to 0.3.0

## What changed

**Removing a chip no longer deletes anything but a link.** In 0.2.x, removing
a chip deleted the tag record itself. On a native many-to-many subgrid that
removed the tag from every record that had it, not just this one. 0.3.0
unlinks the tag under a many-to-many, and clears the lookup under a
one-to-many, so the tag survives in both.

Three smaller changes follow from it:

- **The add box searches before it creates.** Typing suggests existing tags;
  **Create "…"** appears only when nothing matches, and only while **Allow new
  tags** is on (it is by default).
- **Parent lookup field is no longer read.** The lookup is found from metadata.
  The property stays so existing forms import cleanly.
- **A form whose tables share more than one relationship asks which one.** It
  shows the chips and no add box until **Relationship name** is set.

## What to do

:::steps
1. Import 0.3.0 over 0.2.x. Existing forms keep their configuration, and the
   import asks for no new permission.
2. Open each form with Tag List on it. If the control shows "More than one
   relationship joins these tables", copy the name it gives for your subgrid
   into **Relationship name**, then save and publish.
3. If you relied on removal *deleting* tags (a one-to-many where a removed tag
   should cease to exist), delete orphaned tags with a bulk delete job or a
   flow: tags whose lookup is empty.
:::

0.4.0 adds only **Sample data**, which feeds the demo on this page. Leave it
blank; there is nothing else to do.

:::callout{type=warning}
If 0.2.x was used on a native many-to-many subgrid, tags removed with it were
deleted, and not only from that record. They cannot be restored by upgrading.
Check the tag table against the audit history if that matters to you.
:::
