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
:::

:::callout{type=warning}
Import the managed solution into production. The unmanaged one is for a
development environment where you intend to change the control itself — it
cannot be cleanly uninstalled.
:::

The import asks for the **Web API** and **Utility** features, the same two
0.2.x asked for. 0.3.0 adds no new permission to the prompt.

## Requirements

- A relationship between the form's table and the table your tags live in:
  a native many-to-many, or a lookup on the tag table pointing at the form's
  table. See [Model-driven apps](model-driven.md).
- Model-driven apps. Canvas apps and custom pages are not supported; see
  [Limitations](limitations.md).
