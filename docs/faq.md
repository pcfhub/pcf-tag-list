---
title: FAQ
description: Questions that come up more than once.
order: 8
---

# FAQ

## Does removing a tag delete it?

No. Under a many-to-many it unlinks the tag from this record; the tag stays,
and so does every other record's link to it. Under a one-to-many it clears the
tag's lookup. The one case that deletes anything is a subgrid over a junction
table's own view, where the row *is* the link, and that asks first.

0.2.x did delete the tag on a many-to-many subgrid. If you used it that way,
see [Migration](migration.md).

## The control says "More than one relationship joins these tables"

Your two tables are joined by more than one relationship, often a many-to-many
and a lookup, and nothing a subgrid hands to a control says which one it shows.
Copy the name the message gives for your subgrid's relationship into
**Relationship name**. See [Model-driven apps](model-driven.md).

## A tag I know exists does not appear in the suggestions

Four reasons, in the order they usually turn out to be:

- **It is already on this record.** Suggestions leave those out.
- **Under a one-to-many, another record owns it.** Attaching would move it, so
  it is not offered.
- **Its name does not contain what you typed.** The search matches anywhere in
  the name and ignores case, but it searches the name only.
- **You cannot read it.** Suggestions come from the server as you, so your
  security roles apply.

## Why does Browse show a different list from the search?

Browse is the platform's own lookup dialog, so it uses the table's lookup view
and its filters. The search box searches the primary name directly.

## Does it work offline?

No. Every change is a request to Dataverse as it happens.

## The control does not appear in the component list

The subgrid has to be switched to Tag List explicitly: subgrid properties →
**Components** → **Add component** → **Tag List**, then turn it on for the
client types you need.

## How do I report a bug?

Open an issue at <https://github.com/pcfhub/pcf-tag-list/issues>, with the
control version from the solution and what the message under the control said,
if it said anything.
