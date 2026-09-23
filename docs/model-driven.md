---
title: Model-driven apps
description: Adding Tag List to a form.
order: 4
---

# Using it on a model-driven form

Tag List is a dataset control: it replaces a subgrid, not a column.

:::steps
1. Add a **subgrid** to the form, showing the related table through the
   relationship you want: **Related records only**, with the many-to-many (or
   one-to-many) relationship chosen.
2. Open the subgrid's properties → **Components** → **Add component** →
   **Tag List**, and turn it on for **Web**, **Phone** and **Tablet**.
3. Map the columns to the control's roles:
   - **Label field** (required): the text on each chip. Usually the tag's
     name column.
   - **Colour field** (optional): a text column holding a colour such as
     `#7C3AED`, drawn as the chip's leading edge.
4. Save, publish, and open a record.
:::

## When the control asks for a relationship name

Nothing a subgrid hands to a control says which relationship it is showing, so
Tag List reads the relationships between the two tables from metadata. When
there is exactly one, it uses it. When there is more than one (a many-to-many
**and** a lookup between the same two tables is common), it shows the chips,
offers no add box or remove buttons, and names the candidates:

> More than one relationship joins these tables. Set Relationship name to one
> of: cll_Account_cll_Tag_cll_Tag, cll_Account_Account_cll_Tag.

Copy the one your subgrid uses into the control's **Relationship name**
property. A many-to-many takes its schema name; a one-to-many takes its schema
name or the lookup column's logical name.

## Properties

| Property | Default | What it does |
| --- | --- | --- |
| **Allow adding tags** | On | Shows the search box. Turn off for a read-only chip list; removal is still offered on an editable form. |
| **Allow new tags** | On | Offers **Create "…"** when nothing matches. Turn off to attach existing tags only. |
| **Maximum visible chips** | 12 | Chips past this collapse into **+N more**. |
| **Relationship name** | (empty) | Needed only when the control asks for it; see above. |
| **Primary name field** | `name` | Used only if the tag table's metadata cannot be read. |
| **Parent lookup field** | (empty) | No longer used. It stays so existing forms import cleanly. |

The full generated list is in the [API reference](api.md).

## Security

Tag List does what the user could do themselves, and no more. Linking needs
**Append** on the tag table and **Append To** on the record's table; creating
needs **Create** on the tag table. A request the server refuses leaves the chips
as they were and puts the server's own sentence under the control, for
example:

> Feature could not be removed. Principal user is missing prvAppendcll_tag privilege.

A read-only form (a closed record, or field security) shows the chips with no
add box and no remove buttons.
