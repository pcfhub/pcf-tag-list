# Tag List

A many-to-many tag picker rendered as removable chips, bound to a dataset.

[![Build](https://github.com/pcfhub/pcf-tag-list/actions/workflows/build.yml/badge.svg)](https://github.com/pcfhub/pcf-tag-list/actions/workflows/build.yml)
[![Release](https://github.com/pcfhub/pcf-tag-list/actions/workflows/release.yml/badge.svg)](https://github.com/pcfhub/pcf-tag-list/actions/workflows/release.yml)

Documentation lives on [PCFHub](https://pcfhub.dev/components/pcf-tag-list), built
from the `docs/` directory in this repository. Edit the Markdown here; the hub
recompiles it.

## What it does

Bind it to a view of the tags related to the current record and it renders each one
as a removable chip. Removing a chip disassociates the tag; typing a new one
associates it — both through the Web API, against the record the control is mounted
on. It reads that record from `context.mode.contextInfo` rather than a bound
property, because the maker UI for a dataset control only offers static values for
input properties, not "bind to a form column".

It is a **model-driven** control. The dataset binding it needs has no canvas
equivalent, which is why there is no canvas guide in `docs/`.

## Properties

| Property | Type | Usage | Default | What it controls |
| --- | --- | --- | --- | --- |
| `tags` | Dataset | bound | — | The view of related tags to render |
| `labelField` | SingleLine.Text | property-set, **required** | — | Which column of `tags` holds the chip label |
| `colorField` | SingleLine.Text | property-set | — | Optional column holding a chip colour |
| `allowCreate` | TwoOptions | input | `true` | Whether the picker can create new tags |
| `maxVisible` | Whole.None | input | `12` | Chips shown before the rest collapse behind a counter |
| `primaryNameField` | SingleLine.Text | input | `name` | The tag table's primary name column, used when creating |
| `parentLookupField` | SingleLine.Text | input | — | Lookup on the tag table pointing back at the parent record, so a newly created tag is linked rather than orphaned |
| `selectedTagId` | SingleLine.Text | output | — | Id of the chip the user last activated |

`labelField` and `colorField` are a property set: the author's view decides which
column plays which role, so the control never assumes fixed column names.

Requires the **WebAPI** and **Utility** features. Maker-facing strings ship in
English, Spanish, French, German and Japanese.

## On the hub

The demo runs at **mocked** fidelity. Associating and disassociating a tag is a real
Dataverse write, so the sandbox stands in a mock Web API and a fixed set of tags
(`demo/tags.json`) — the interaction is faithful, the persistence is not.

## Install

Download the managed solution from the
[latest release](https://github.com/pcfhub/pcf-tag-list/releases/latest), or from
the component's page on the hub, and import it into your environment.

## Develop

```bash
npm install
npm start          # the PCF test harness
npm run build
npm run lint
```

To pack the solution locally you need msbuild — either Visual Studio or the
Visual Studio Build Tools:

```bash
cd Solution
msbuild /t:build /restore /p:configuration=Release
```

Both zips land in `Solution/bin/Release`.

## Release

1. Bump the version in **three** places, in one commit — they are checked
   against each other in CI:
   - `TagList/ControlManifest.Input.xml` → `<control version="…">`
   - `Solution/src/Other/Solution.xml` → `<Version>`
   - `package.json` → `"version"`
2. Tag it: `git tag v1.2.3 && git push --tags`

The release workflow builds, packs both solution types, and attaches them to a
GitHub Release. PCFHub picks the release up from its webhook within seconds, or
from the hourly sweep otherwise.

## Repository layout

| Path | What it is |
| --- | --- |
| `TagList/` | The control: manifest, entry point, CSS, localised strings |
| `Solution/` | The Dataverse solution that packages it |
| `demo/` | The dataset fixture the hub's demo mounts |
| `docs/` | The pages PCFHub publishes — see the comments in each file |
| `media/` | Images and video referenced from the docs |
| `pcfhub.json` | The hub's manifest: identity, links, docs path, demo |
| `scripts/` | Template setup and the CI guard that keeps it adopted |

## Licence

[MIT](LICENSE)
