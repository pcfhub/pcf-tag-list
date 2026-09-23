---
title: Limitations
description: What Tag List does not do.
order: 7
---

# Limitations

## Model-driven forms only

Canvas apps and custom pages are not supported. The control finds the record
it is on through the form, and links tags through Dataverse's relationship
endpoints, and neither exists in a canvas app.

## It needs to know the relationship, and sometimes has to ask

A subgrid does not tell a control which relationship it shows. Tag List reads
them from metadata and asks for **Relationship name** when there is more than
one. Until then it shows chips and changes nothing. A table related to itself
(a many-to-many from `cll_tag` to `cll_tag`) is not supported: the two sides
cannot be told apart by name.

## Suggestions search the name only

The search box matches anywhere in the tag's primary name, ignoring case. It
does not search other columns, and it shows eight suggestions at most. Use
**Browse** for the platform's full lookup, with its views and filters.

## Very large tag sets

To keep suggestions free of tags the record already has, Tag List reads the
record's links once, up to 5,000 of them. Past that, a suggestion may name a
tag the record already has; picking it changes nothing. Chips load a page at a
time; **+N more** and **Load more** reach the rest.

## A junction table's view

A subgrid over a junction table's own view (each row a link, the label read
through a linked table) can remove, by deleting the link row after a
confirmation, but cannot add. Use the native many-to-many, or the one-to-many,
for adding.

## Changes are immediate

There is no undo in the control. A tag removed by mistake is attached again
from the search box, since the tag itself still exists.

## The demo on this page runs on sample data

The demo's account and tags live in your browser, not in Dataverse. Searching,
linking, unlinking, creating and Browse all work, through the same requests a
form sends; nothing is saved, and Reset puts the demo back. Browse opens a
simpler dialog than the platform's, with no views, and a refused request
cannot be shown there because the demo grants everything.
