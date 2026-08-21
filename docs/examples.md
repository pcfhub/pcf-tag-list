---
title: Examples
description: Worked configurations of Tag List.
order: 6
---

# Examples

## Tags on a case form

The common case: a compact, editable list of categories on an Incident form,
where makers and agents both add and remove freely.

| Property | Value |
| --- | --- |
| `allowCreate` | `true` (default) |
| `maxVisible` | `12` (default) |
| Label field | the tag entity's `name` column |
| Colour field | the tag entity's `color` column |

::image{src=media/screenshot.png alt="Two removable tag chips above an Add a tag input and an Add button, which is the default configuration"}

## A read-only, space-constrained summary

Higher on a form, where the relationship is worth showing but not worth
editing inline — a smaller `maxVisible` collapses most of the list behind a
"+N more" toggle instead of pushing other fields down.

| Property | Value |
| --- | --- |
| `allowCreate` | `false` |
| `maxVisible` | `5` |
| Colour field | left unmapped — plain chips, no colour dots |

:::callout{type=info}
Setting `allowCreate` to `false` only hides the add box. It doesn't affect
removal — see [Limitations](limitations.md) if you need a fully read-only
chip list.
:::
