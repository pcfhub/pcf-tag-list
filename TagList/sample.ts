/**
 * The `sampleData` input — a JSON document the control plays against instead
 * of Dataverse. It exists for the hub's demo, whose harness has no record, no
 * organisation URL and a Web API that rejects every call, so the live route
 * has nothing to show there but a notice. Blank on every real form.
 *
 *   { "binding": "manyToMany",
 *     "tags":   [ { "id": "t1", "name": "Priority", "color": "#d13438" }, … ],
 *     "linked": [ "t1", … ],
 *     "elsewhere": [ "t9" ],
 *     "refuse": { "remove": "…", "add": "…" } }
 *
 * - `tags` is the whole tag table, which is what a search and a create run
 *   against; `linked` is the ids this record has, in chip order.
 * - `binding` is what `binding.ts` would have resolved on a form:
 *   `manyToMany` (the default), `oneToMany`, `linkRows`, `ambiguous` (with
 *   `candidates`), or one of the `unknown` reasons. Every state the live
 *   route can reach, so a preset can show the one a maker would see.
 * - `elsewhere` are tags another record owns — under `oneToMany` a search
 *   leaves them out, as the live search does with `_x_value eq null`.
 * - `refuse` turns an add or a remove into a refusal carrying that sentence,
 *   the way a missing privilege does on a form.
 *
 * **The parser never throws.** Text that is not such a document is `null`,
 * which the service turns into a named state — never a blank control.
 *
 * The store keeps the document's links in memory for the life of the text:
 * the demo re-renders with the same string and the changes stay; a preset
 * switch hands over a new string and starts again.
 */

import { Binding } from './binding';
import { Found } from './platform';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SampleTag extends Found {
    color: string | null;
}

export interface SampleDocument {
    binding: Binding;
    tags: SampleTag[];
    linked: string[];
    elsewhere: string[];
    refuse: { add: string | null; remove: string | null };
}

/** Tags beyond this are dropped — a demo document, not a table. */
export const SAMPLE_MAX = 500;

const REASONS = ['noParent', 'noMetadata', 'noRelationship', 'unmatchedName', 'selfReferential'] as const;

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

function toBinding(raw: any): Binding | null {
    const kind = raw?.binding ?? 'manyToMany';

    switch (kind) {
        case 'manyToMany':
            return { kind, schemaName: 'sample', navigation: 'sample' };
        case 'oneToMany':
            return { kind, schemaName: 'sample', column: 'sample', navigation: 'sample' };
        case 'linkRows':
            return { kind };
        case 'ambiguous': {
            const candidates = Array.isArray(raw?.candidates) ? raw.candidates.map(text).filter(Boolean) : [];

            return candidates.length > 1 ? { kind, candidates } : null;
        }
        default:
            return (REASONS as readonly string[]).includes(kind) ? { kind: 'unknown', reason: kind } : null;
    }
}

/** The document, or `null` when `raw` is not one. Unknown ids in `linked` are dropped, not fatal. */
export function parseSampleData(raw: string): SampleDocument | null {
    let parsed: any;

    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.tags)) {
        return null;
    }

    const binding = toBinding(parsed);

    if (binding === null) {
        return null;
    }

    const tags: SampleTag[] = [];
    const seen = new Set<string>();

    for (const row of parsed.tags.slice(0, SAMPLE_MAX)) {
        const id = text(row?.id);
        const name = text(row?.name);

        if (id !== null && name !== null && !seen.has(id)) {
            seen.add(id);
            tags.push({ id, name, color: text(row?.color) });
        }
    }

    const ids = (value: unknown): string[] =>
        Array.isArray(value) ? [...new Set(value.map(text).filter((id): id is string => id !== null && seen.has(id)))] : [];

    return {
        binding,
        tags,
        linked: ids(parsed.linked),
        elsewhere: ids(parsed.elsewhere),
        refuse: { add: text(parsed.refuse?.add), remove: text(parsed.refuse?.remove) },
    };
}

/**
 * The document with its links made mutable — what the service searches,
 * links and unlinks on the sample route. Every method mirrors one on the live
 * route, including its refusals, so the component cannot tell them apart.
 */
export class SampleStore {
    private readonly tags: SampleTag[];
    private readonly linked: string[];
    private created = 0;

    constructor(private readonly document: SampleDocument) {
        this.tags = document.tags.map((tag) => ({ ...tag }));
        this.linked = [...document.linked];
    }

    get binding(): Binding {
        return this.document.binding;
    }

    /** The record's tags, in the order they were linked. */
    chips(): SampleTag[] {
        return this.linked.map((id) => this.tags.find((tag) => tag.id === id)).filter((tag): tag is SampleTag => tag !== undefined);
    }

    /** The live search's rules: contains, case-insensitive, by name, the record's own left out. */
    search(term: string, limit: number): Found[] {
        const needle = term.trim().toLowerCase();

        if (needle === '') {
            return [];
        }

        const excluded = new Set([...this.linked, ...(this.binding.kind === 'oneToMany' ? this.document.elsewhere : [])]);

        return this.tags
            .filter((tag) => !excluded.has(tag.id) && tag.name.toLowerCase().includes(needle))
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(0, limit)
            .map(({ id, name }) => ({ id, name }));
    }

    /** Idempotent, as an associate is (SPEC.md P3). */
    link(id: string): void {
        this.refuseIf(this.document.refuse.add);

        if (!this.tags.some((tag) => tag.id === id)) {
            throw new Error('The tag no longer exists.');
        }

        if (!this.linked.includes(id)) {
            this.linked.push(id);
        }
    }

    /** A new tag in the table, then linked — the two halves the live route sends. */
    create(name: string): void {
        this.refuseIf(this.document.refuse.add);

        this.created += 1;

        const tag: SampleTag = { id: `sample-new-${this.created}`, name, color: null };

        this.tags.push(tag);
        this.linked.push(tag.id);
    }

    /** Idempotent, as a disassociate is (SPEC.md P3). The tag stays in the table. */
    unlink(id: string): void {
        this.refuseIf(this.document.refuse.remove);

        const at = this.linked.indexOf(id);

        if (at !== -1) {
            this.linked.splice(at, 1);
        }
    }

    private refuseIf(sentence: string | null): void {
        if (sentence !== null) {
            throw new Error(sentence);
        }
    }
}
