---
title: FAQ
description: Questions that come up more than once.
order: 8
---

# FAQ

## Why does the control not appear in the component list?

Most often the subgrid hasn't had its control swapped from the default grid
— adding the control to the form doesn't do this automatically. Open the
subgrid's properties → **Controls** → **Add control** and choose **Tag
List** explicitly, then enable it for the client types you need. See
[Model-driven apps](model-driven.md).

## Does it work offline / on mobile / in a phone layout?

Web, phone and tablet are all supported layouts for the control itself, but
there's no offline story — adding and removing a tag both call
`context.webAPI` directly against Dataverse, so both require connectivity.
See [Limitations](limitations.md).

## Why doesn't removing a tag work the way I expected?

Almost certainly the subgrid's view is bound to the relationship's virtual
view rather than the join/intersect entity's own view — read
[Limitations](limitations.md) before assuming this is a bug.

## Can I search for an existing tag instead of always creating a new one?

Not currently — the add box always creates a new record. See
[Limitations](limitations.md).

## How do I report a bug?

Open an issue at <https://github.com/pcfhub/pcf-tag-list/issues>, with the
platform version and the control version from the solution.
