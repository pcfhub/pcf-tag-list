---
title: Examples
description: Worked configurations of Tag List.
order: 6
---

# Examples

## Shared tags on an account (many-to-many)

The case Tag List is built for. One tag table, `cll_tag`, related to accounts
through a native many-to-many, so a tag like *Strategic* is one record that
many accounts share, and removing it from one account leaves it on the rest.

| Property | Value |
| --- | --- |
| Subgrid | Related records only, through the many-to-many |
| Label field | `cll_tagname` |
| Colour field | `cll_tagcolour` |
| Allow adding tags / Allow new tags | On / On |
| Relationship name | Empty, unless the control asks for one |

::image{src=media/search.png alt="Typing da suggests the existing Dataverse tag and offers to create da"}

Typing shows existing tags this account does not have yet; **Enter** picks the
highlighted one. **Create "…"** appears only when no tag has that exact name,
so a shared vocabulary stays shared.

## A curated vocabulary

The same setup with **Allow new tags** off. Makers maintain the tag table;
users attach from it and cannot add to it. The search box and **Browse**
still work, and **Create "…"** never appears.

## Tags a record owns (one-to-many)

Where each tag belongs to one record, through a lookup on the tag table, such
as notes-like labels on a case. Tag List sets the lookup to attach a tag and
clears it to remove one. It only suggests tags that nobody owns yet, so
attaching never takes a tag away from another record.

## A narrow form column

Tag List wraps its chips to the width it is given, and collapses past
**Maximum visible chips** into **+N more**, which also counts tags on pages the
form has not loaded yet.

::image{src=media/narrow.png alt="Chips wrapping onto four rows in a narrow column, with +6 more and the search box below"}

## A read-only summary

**Allow adding tags** off hides the search box. On an editable form the
remove buttons stay, as in 0.2.x. For a fully read-only list, make the form or
the subgrid read-only: Tag List then shows chips only.
