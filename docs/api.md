---
title: API reference
description: Properties and outputs, generated from the control manifest.
order: 5
---

# API reference

<!--
  Do not write the property tables by hand.

  `props-table` renders from what the hub parsed out of
  ControlManifest.Input.xml at the release being viewed, so it cannot drift from
  the control. A hand-written table is wrong the first time somebody adds a
  property and forgets this file, and a reader has no way to tell.

  kind: input | bound | output | dataset | dataset_column
  Omit `kind` to render every property in one table.
-->

## Input properties

::props-table{kind=input}

## Bound properties

::props-table{kind=bound}

## Outputs

::props-table{kind=output}

## Notes

`labelField` and `colorField` are **property-set roles**, not fixed column
names — the manifest declares what role each plays, and the maker maps real
columns to them per view (see [Model-driven apps](model-driven.md)). The
table above lists the roles the control declares; it can't show which real
column a given view has mapped to each one, since that's a per-form choice,
not part of the control.

`selectedTagId` updates when a chip's label is clicked (opening that
record), not when a chip is added or removed — there's no separate output
for those, since the dataset itself already reflects the current set of
tags.
