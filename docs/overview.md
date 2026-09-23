---
title: Overview
description: What Tag List does, and when to reach for it.
order: 1
---

# Tag List

A multi-select lookup for model-driven forms: the records a record is related
to, shown as chips, with a search box to attach more.

::image{src=media/chips.png alt="Tag List showing eight coloured chips and a +6 more link above a search box" zoom}

## Why this one

A many-to-many relationship on a form is usually a subgrid: a full grid, with
column headers and a command bar, for what is often a handful of short labels,
and an **Add Existing** dialog to attach one. Tag List shows the same
relationship as chips and attaches from a type-ahead:

- **Type to find a tag**, and pick it. Tags already on the record are left out
  of the suggestions, including the ones on pages the form has not loaded.
- **Create one that does not exist yet**, from the same box, if you allow it.
- **Browse** opens the platform's own lookup dialog, multi-select, with its
  views and its security.
- **Remove a chip** to unlink the tag. The tag itself is kept, and so is
  every other record's link to it.

::image{src=media/search.png alt="Typing da into the search box suggests Dataverse and offers to create da" zoom}

It is not a replacement for a subgrid you page, sort or filter. It is for the
case where the relationship *is* the content, such as categories, labels or
skills, and a grid is more chrome than the data needs.

## What it works with

Model-driven forms: **Web**, **Phone** and **Tablet**. It works with three
kinds of relationship, and it reads which one it is on from the metadata:

| Relationship | Adding a tag | Removing a tag |
| --- | --- | --- |
| **Many-to-many** (native) | Links it | Unlinks it |
| **One-to-many** (a lookup on the tag) | Sets the tag's lookup to this record | Clears the lookup |
| **A junction table's own view** | Not offered | Deletes the link row, after a confirmation |

Canvas apps and custom pages are not supported. See
[Limitations](limitations.md).

## New in 0.3.0

0.2.x could only create tags, and removing one on a native many-to-many
subgrid **deleted the tag itself**, from every record. 0.3.0 unlinks instead,
attaches existing tags, and says why when a request fails. See
[Migration](migration.md) if you are upgrading.
