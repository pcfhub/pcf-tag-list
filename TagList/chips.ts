/**
 * What the list shows between a write and the fetch that reads it back.
 *
 * Since 0.5.1 no write ends with `dataset.refresh()` — a refresh starts the
 * view again at its first page and dropped every chip **Load more** had
 * brought in — so the list holds its own writes until the rows agree: tags it
 * added (shown first) and tags it removed (hidden). Pure, and loaded by the
 * suite through `dev/modules.js`, because this is exactly the state a static
 * render cannot hold: 0.5.1's first build removed a just-created tag through
 * the API and kept showing it — the removal hid rows and never touched the
 * "added" list (found on the form, 2026-09-29).
 */

import { bareId, Found } from './platform';

export interface Chip {
    id: string;
    label: string;
    color: string | null;
}

/** This list's writes the rows have not caught up with. Ids are bare. */
export interface Pending {
    added: Chip[];
    removed: string[];
}

export const NOTHING_PENDING: Pending = { added: [], removed: [] };

/** Tags this list just attached or created — shown first, newest first, until the rows hold them. */
export function afterAdd(pending: Pending, tags: Found[]): Pending {
    const ids = new Set(tags.map((tag) => bareId(tag.id)));

    return {
        added: [
            ...tags.map((tag) => ({ id: bareId(tag.id), label: tag.name, color: null })),
            ...pending.added.filter((chip) => !ids.has(chip.id)),
        ],
        removed: pending.removed.filter((id) => !ids.has(id)),
    };
}

/**
 * A tag this list just removed. **Both lists**: a tag it added and has not
 * read back yet exists only in `added`, so hiding rows alone leaves it on
 * screen — the 0.5.1 fault this module exists for.
 */
export function afterRemove(pending: Pending, id: string, loadedIds: string[]): Pending {
    const tag = bareId(id);

    return {
        added: pending.added.filter((chip) => chip.id !== tag),
        // Only a tag the rows hold needs hiding; one they never held is simply gone.
        removed: loadedIds.map(bareId).includes(tag) && !pending.removed.includes(tag)
            ? [...pending.removed, tag]
            : pending.removed,
    };
}

/** Retire what the rows now agree with: an added tag they hold, a removed one they no longer hold. */
export function reconcile(pending: Pending, loadedIds: string[]): Pending {
    const present = new Set(loadedIds.map(bareId));
    const added = pending.added.filter((chip) => !present.has(chip.id));
    const removed = pending.removed.filter((id) => present.has(id));

    return added.length === pending.added.length && removed.length === pending.removed.length
        ? pending
        : { added, removed };
}

/** The chips to draw: the tags just added first, then the rows, less the tags just removed. */
export function visibleChips(rows: Chip[], pending: Pending): Chip[] {
    const hidden = new Set(pending.removed);
    const fromRows = rows.filter((chip) => !hidden.has(bareId(chip.id)));
    const shown = new Set(fromRows.map((chip) => bareId(chip.id)));

    return [...pending.added.filter((chip) => !shown.has(chip.id)), ...fromRows];
}

/**
 * The platform's count moved by this list's writes since its last fetch —
 * or unchanged when the platform does not count (`-1`).
 */
export function adjustedTotal(reported: number, rows: Chip[], pending: Pending): number {
    if (reported < 0) {
        return reported;
    }

    const present = new Set(rows.map((chip) => bareId(chip.id)));
    const addedNotRead = pending.added.filter((chip) => !present.has(chip.id)).length;
    const removedStillRead = pending.removed.filter((id) => present.has(id)).length;

    return reported + addedNotRead - removedStillRead;
}
