---
title: Installation
description: Import the solution and make the control available.
order: 2
---

# Installation

<!--
  Do not link to the release assets by hand. The hub serves the managed and
  unmanaged downloads for the version the reader is viewing, and a hard-coded
  link goes stale on the next release.
-->

:::steps
1. Download the **managed** solution for your environment.
2. In the Power Platform admin centre, import the solution.
3. Publish all customizations.
4. Enable **Code components for canvas apps** if this control is used there.
:::

:::callout{type=warning}
Import the managed solution into production. The unmanaged one is for a
development environment where you intend to change the control itself — it
cannot be cleanly uninstalled.
:::

## Requirements

- A many-to-many relationship (or a view of one) to bind the subgrid to —
  see [Model-driven apps](model-driven.md) for how the subgrid itself is
  configured. There is no field-level installation path; this is a dataset
  control, added to a subgrid, not to a column.
- Canvas apps and custom pages are not supported — see
  [Limitations](limitations.md).
