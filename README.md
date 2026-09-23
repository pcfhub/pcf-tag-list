# Tag List

A multi-select lookup for model-driven forms: the records a record is related to,
as chips, with a type-ahead to attach more.

[![Build](https://github.com/pcfhub/pcf-tag-list/actions/workflows/build.yml/badge.svg)](https://github.com/pcfhub/pcf-tag-list/actions/workflows/build.yml)
[![Release](https://github.com/pcfhub/pcf-tag-list/actions/workflows/release.yml/badge.svg)](https://github.com/pcfhub/pcf-tag-list/actions/workflows/release.yml)

Documentation lives on [PCFHub](https://pcfhub.dev/components/pcf-tag-list), built
from the `docs/` directory in this repository. Edit the Markdown here; the hub
recompiles it.

## What it does

Put it on a subgrid of related records and it renders each one as a chip. Typing
suggests existing records the current one does not have yet; **Browse** opens the
platform's lookup dialog; **Create "…"** makes a new one when nothing matches.
Removing a chip unlinks it and never deletes it.

What adding and removing mean depends on the relationship behind the subgrid, which
a subgrid does not report. `TagList/binding.ts` reads it from metadata:

| Relationship | Add | Remove |
| --- | --- | --- |
| Native many-to-many | `POST <parent>(<id>)/<nav>/$ref` | `DELETE <parent>(<id>)/<nav>(<tag>)/$ref` |
| One-to-many (lookup on the tag) | bind the lookup | clear the lookup |
| A junction table's own view | — | delete the link row, after a confirm |

`context.webAPI` has no relationship verbs, so the many-to-many link is a
same-origin `$ref` request, measured working from a control on a real form
(`SPEC.md`, P3). When the two tables share more than one relationship, the control
says so and asks for **Relationship name** rather than guessing.

It is a **model-driven** control. It finds its record through
`context.mode.contextInfo`, which canvas does not have, which is why there is no
canvas guide in `docs/`.

## Properties

| Property | Type | Usage | Default | What it controls |
| --- | --- | --- | --- | --- |
| `tags` | Dataset | bound | — | The subgrid's related records |
| `labelField` | SingleLine.Text | property-set, **required** | — | Which column holds the chip label |
| `colorField` | SingleLine.Text | property-set | — | Optional column holding a chip colour |
| `allowCreate` | TwoOptions | input | `true` | Whether the add box is shown at all |
| `allowNewTags` | TwoOptions | input | `true` | Whether the add box can create a tag that does not exist |
| `maxVisible` | Whole.None | input | `12` | Chips shown before the rest collapse behind a counter |
| `relationshipName` | SingleLine.Text | input | — | Which relationship the subgrid shows, when there is more than one |
| `primaryNameField` | SingleLine.Text | input | `name` | The tag table's primary name, if metadata cannot say |
| `parentLookupField` | SingleLine.Text | input | — | No longer read (0.3.0); kept so existing forms import |
| `selectedTagId` | SingleLine.Text | output | — | Id of the chip the user last opened |

Requires the **WebAPI** and **Utility** features, as 0.2.x did. Strings ship in
English, Spanish, French, German and Japanese.

## On the hub

The demo runs at **limited** fidelity. It has no Dataverse behind it and no record
to attach tags to, so it shows the chips and the notice the control shows off a
saved record. Search, Browse and linking need a real form.

## Install

Download the managed solution from the
[latest release](https://github.com/pcfhub/pcf-tag-list/releases/latest), or from
the component's page on the hub, and import it into your environment.

## Develop

```bash
npm install
npm run lint           # separately: a lint failure still exits 0 from the build
npm run build
npm run smoke          # the control's decisions, asserted against the built bundle
npm run harness        # dev/harness.html: the control against a stand-in subgrid
```

`dev/` is a stand-in host (`host.js`), a fixture shaped after the probe's
environment (`fixture.js`), and the suite (`smoke.js`). It is kept current with the
template by `node ../_template/scripts/sync-rig.mjs --into .`.

To pack the solution locally you need msbuild — either Visual Studio or the
Visual Studio Build Tools:

```bash
cd Solution
msbuild /t:build /restore /p:configuration=Release
```

Both zips land in `Solution/bin/Release`.

## Release

```bash
npm run bump -- --minor    # every version location, by anchor
npm run release            # tags with the notes, headings intact
```

The release workflow builds, packs both solution types, and attaches them to a
GitHub Release. PCFHub picks the release up from its webhook within seconds, or
from the hourly sweep otherwise.

## Repository layout

| Path | What it is |
| --- | --- |
| `TagList/` | The control: manifest, entry point, binding, service, component, CSS, strings |
| `Solution/` | The Dataverse solution that packages it |
| `dev/` | The stand-in host, fixture, suite and harness page |
| `demo/` | The dataset fixture the hub's demo mounts |
| `docs/` | The pages PCFHub publishes |
| `media/` | Images referenced from the docs and `pcfhub.json` |
| `pcfhub.json` | The hub's manifest: identity, links, docs path, demo |
| `scripts/` | The CI guard, the version tool and the release tool |
| `SPEC.md` | What building it taught us, and what is not yet verified |

## Licence

[MIT](LICENSE)
