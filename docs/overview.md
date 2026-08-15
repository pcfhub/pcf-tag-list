---
title: Overview
description: What Tag List does, and when to reach for it.
order: 1
---

# Tag List

A many-to-many tag picker rendered as removable chips, bound to a dataset.

::image{src=media/screenshot.png alt="Tag List on a form" zoom}

## Why this one

The built-in way to show a many-to-many relationship on a form is a subgrid
— a full grid, with column headers and a ribbon, for what is usually a
handful of short labels. Tag List renders the same relationship as inline
chips: compact, wraps naturally, and collapses past a configurable count
instead of scrolling. Removing a tag is one click on the chip; adding one is
a text box, not "Add existing record".

It is not a replacement for a subgrid you actually page, sort or filter —
it's for the case where the relationship *is* the content (categories,
labels, skills) and a grid is more chrome than the data needs.

## What it works with

Model-driven forms only — **Web**, **Phone** and **Tablet**. Not supported
in canvas apps or custom pages: the control's whole model is a Dataverse
many-to-many relationship on a subgrid, which doesn't have a canvas
equivalent (see [Limitations](limitations.md)).

Adding and removing tags reaches Dataverse directly (`context.webAPI`), so
there's no offline story — see [Limitations](limitations.md) for what that
means for removal specifically.
