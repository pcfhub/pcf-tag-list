---
title: Model-driven apps
description: Adding Tag List to a form.
order: 4
---

# Using it on a model-driven form

This is a dataset control, not a field control — it replaces a subgrid, not
a column.

:::steps
1. Add a **subgrid** to the form, bound to the many-to-many relationship (or
   a view that already includes it).
2. Open the subgrid's properties → **Controls** → **Add control** → choose
   **Tag List**, and enable it for **Web**, **Phone** and **Tablet**.
3. Under the subgrid's view, map two columns to the control's property-set
   roles — these are roles, not fixed column names, so any two text columns
   on the related entity work:
   - **Label field** (required) — the text shown on each chip.
   - **Colour field** (optional) — a hex colour value that tints the chip's
     border. Leave unmapped for plain chips.
4. Set **Allow creating new tags** and **Maximum visible chips** on the
   control's own properties, if the defaults (on, 12) don't fit.
5. Save and publish.
:::

## Column types

Both `labelField` and `colorField` are declared as `SingleLine.Text` in the
manifest, so the form designer only offers text columns for either role —
there's no runtime fallback to handle because an incompatible column can't
be selected in the first place.

:::callout{type=warning}
Removing a chip only cleanly disassociates the relationship when the
subgrid's view is bound to the join/intersect entity directly rather than
the relationship's virtual view. See [Limitations](limitations.md) before
relying on remove in a new configuration.
:::
