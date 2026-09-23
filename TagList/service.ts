/**
 * What adding and removing a tag *means*, per binding — and nothing else.
 *
 * | binding    | attach an existing tag          | create one              | remove                         |
 * | ---------- | ------------------------------- | ----------------------- | ------------------------------ |
 * | manyToMany | POST `$ref` from the parent     | create, then POST `$ref`| DELETE `$ref`                  |
 * | oneToMany  | bind the tag's lookup           | create with the bind    | clear the lookup (`null`)      |
 * | linkRows   | —                               | —                       | delete the row, after a confirm|
 *
 * **Removing never deletes a tag.** 0.2.x called `deleteRecord` on the target,
 * which on a native many-to-many subgrid deleted the tag itself, from every
 * record that had it. The only delete left is `linkRows`, where the row *is*
 * the link and deleting it is the unlink — and that asks first.
 *
 * Every method refreshes the dataset after a change, because the row moves in
 * the next fetch and not in the call, and rejects with an `Error` whose
 * message is one readable sentence (see `messageOf`), so the caller can put
 * it in front of the user unchanged.
 */

import { Binding, resolveBinding } from './binding';
import { bareId, Found, messageOf, Platform, TableInfo } from './platform';

export interface Resolved {
    binding: Binding;
    target: TableInfo;
    /** The parent's entity set, or `null` where there is no parent or metadata would not say. */
    parentSet: string | null;
}

export interface ServiceInputs {
    platform: Platform;
    dataset: ComponentFramework.PropertyTypes.DataSet;
    relationshipName: string;
    /** Used only where metadata will not name the primary column. */
    primaryNameField: string;
}

/** How many suggestions a search shows. */
export const SUGGESTIONS = 8;

export class TagService {
    private resolving: { key: string; promise: Promise<Resolved>; value: Resolved | null } | null = null;

    /** Every tag the record is linked to under a many-to-many, read once per binding and kept current by this service's own writes. */
    private linked: { key: string; promise: Promise<Set<string> | null> } | null = null;

    /** Reads the current inputs on every call, because a context is a new object every pass. */
    constructor(private readonly read: () => ServiceInputs) {}

    /** The binding, resolved once per parent, target, label column and relationship name. */
    resolve(): Promise<Resolved> {
        const key = this.key();

        if (this.resolving?.key !== key.key) {
            const entry: { key: string; promise: Promise<Resolved>; value: Resolved | null } = {
                key: key.key,
                promise: this.resolveUncached(key.target, key.labelColumn),
                value: null,
            };

            entry.promise.then((value) => {
                entry.value = value;
            }, () => undefined);
            this.resolving = entry;
        }

        return this.resolving.promise;
    }

    /**
     * The resolution for the current inputs if it has already settled, else
     * `null` — so a remount (a form tab switched back to) draws the add box
     * at once instead of a pass later.
     */
    peek(): Resolved | null {
        return this.resolving?.key === this.key().key ? this.resolving.value : null;
    }

    private key(): { key: string; target: string; labelColumn: string } {
        const { platform, dataset, relationshipName } = this.read();
        const target = dataset.getTargetEntityType();
        const labelColumn = dataset.columns.find((column) => column.alias === 'labelField')?.name ?? '';

        return { key: [platform.parent?.id ?? '', target, labelColumn, relationshipName].join('|'), target, labelColumn };
    }

    private async resolveUncached(target: string, labelColumn: string): Promise<Resolved> {
        const { platform, relationshipName, primaryNameField } = this.read();
        const parentTable = platform.parent?.table ?? null;

        const [manyToMany, manyToOne, targetInfo, parentInfo] = await Promise.all([
            parentTable === null ? Promise.resolve(null) : platform.manyToMany(parentTable),
            platform.manyToOne(target),
            platform.tableInfo(target),
            parentTable === null ? Promise.resolve(null) : platform.tableInfo(parentTable),
        ]);

        let binding = resolveBinding({ parentTable, target, manyToMany, manyToOne, relationshipName, labelColumn });

        // A $ref and a bind are both spelled with entity sets. Without them the
        // binding is known and still cannot be acted on.
        if ((binding.kind === 'manyToMany' || binding.kind === 'oneToMany') && (!parentInfo?.entitySet || !targetInfo.entitySet)) {
            binding = { kind: 'unknown', reason: 'noMetadata' };
        }

        return {
            binding,
            target: { ...targetInfo, primaryName: targetInfo.primaryName || primaryNameField || 'name' },
            parentSet: parentInfo?.entitySet ?? null,
        };
    }

    /**
     * Tags whose name contains `text`, excluding the ones already on this
     * record. `contains` is case-insensitive on the server (measured, P4). A
     * one-to-many search is limited to tags nobody owns yet: attaching binds
     * the tag's lookup, which would take it from another record.
     */
    async search(text: string): Promise<Found[]> {
        const { platform, dataset } = this.read();
        const { binding, target } = await this.resolve();
        const term = text.trim();

        if (term === '' || platform.webAPI === null || (binding.kind !== 'manyToMany' && binding.kind !== 'oneToMany')) {
            return [];
        }

        const escaped = term.replace(/'/g, "''");
        const clauses = [`contains(${target.primaryName},'${escaped}')`];

        if (binding.kind === 'oneToMany') {
            clauses.push(`_${binding.column}_value eq null`);
        }

        const attached = await this.attachedIds();
        const query =
            `?$select=${target.primaryId},${target.primaryName}` +
            `&$filter=${encodeURIComponent(clauses.join(' and '))}` +
            // Over-ask by the tags a record could already have among the matches, capped.
            `&$orderby=${target.primaryName}&$top=${SUGGESTIONS + Math.min(attached.size, 100)}`;

        try {
            const result = await platform.webAPI.retrieveMultipleRecords(dataset.getTargetEntityType(), query);

            return result.entities
                .map((row) => ({ id: bareId(String(row[target.primaryId])), name: String(row[target.primaryName] ?? '') }))
                .filter((row) => !attached.has(row.id))
                .slice(0, SUGGESTIONS);
        } catch (error) {
            throw new Error(messageOf(error));
        }
    }

    /**
     * Every tag this record already has — the loaded chips, and under a
     * many-to-many every linked id, read through the parent's navigation
     * property. Without the second half a suggestion list offers tags the
     * record has on a page the dataset has not loaded (found in the harness,
     * 2026-09-23: "Accessibility" offered while linked on page 2). A failed
     * read falls back to the loaded chips.
     */
    private async attachedIds(): Promise<Set<string>> {
        const { platform, dataset } = this.read();
        const { binding, target, parentSet } = await this.resolve();
        const ids = new Set(dataset.sortedRecordIds.map(bareId));

        if (binding.kind !== 'manyToMany' || platform.parent === null || parentSet === null) {
            return ids;
        }

        const key = this.key().key;

        if (this.linked?.key !== key) {
            this.linked = { key, promise: platform.linkedIds(`${parentSet}(${platform.parent.id})/${binding.navigation}`, target.primaryId) };
        }

        (await this.linked.promise)?.forEach((id) => ids.add(id));

        return ids;
    }

    /** Keep the cached link set true to this service's own writes, once it has been read. */
    private noteLink(id: string, present: boolean): void {
        void this.linked?.promise.then((ids) => {
            if (ids) {
                if (present) {
                    ids.add(bareId(id));
                } else {
                    ids.delete(bareId(id));
                }
            }
        });
    }

    /** Attach an existing tag to this record. */
    async attach(tag: Found): Promise<void> {
        await this.guarded(() => this.link(tag.id));
        this.read().dataset.refresh();
    }

    /**
     * Create a tag and attach it. Under many-to-many that is two requests, and
     * a failure between them leaves a tag that exists and is not linked — the
     * message says which half failed, and the tag is there to attach next time.
     */
    async create(name: string): Promise<void> {
        const { platform, dataset } = this.read();
        const { binding, target, parentSet } = await this.resolve();
        const table = dataset.getTargetEntityType();

        if (platform.webAPI === null || platform.parent === null) {
            throw new Error('Tags cannot be created on this host.');
        }

        const data: ComponentFramework.WebApi.Entity = { [target.primaryName]: name };

        if (binding.kind === 'oneToMany') {
            data[`${binding.navigation}@odata.bind`] = `/${parentSet}(${platform.parent.id})`;
        } else if (binding.kind !== 'manyToMany') {
            throw new Error('Tags cannot be created here.');
        }

        const webAPI = platform.webAPI;
        const created = await this.guarded(() => webAPI.createRecord(table, data));

        try {
            if (binding.kind === 'manyToMany') {
                await this.guarded(() => this.link(bareId(created.id)));
            }
        } finally {
            dataset.refresh();
        }
    }

    /**
     * The platform's own lookup dialog, multi-select. Resolves how many tags
     * were attached — `0` for a cancel, which is a resolve with `[]`.
     */
    async browse(): Promise<number> {
        const { platform, dataset } = this.read();
        const { binding } = await this.resolve();
        const table = dataset.getTargetEntityType();

        if (platform.pick === null || (binding.kind !== 'manyToMany' && binding.kind !== 'oneToMany')) {
            return 0;
        }

        const picked = await this.guarded(() =>
            platform.pick!({
                entityTypes: [table],
                defaultEntityType: table,
                allowMultiSelect: true,
                filters:
                    binding.kind === 'oneToMany'
                        ? [
                              {
                                  entityLogicalName: table,
                                  filterXml: `<filter type="and"><condition attribute="${binding.column}" operator="null" /></filter>`,
                              },
                          ]
                        : undefined,
            }),
        );

        const attached = new Set(dataset.sortedRecordIds.map(bareId));
        const fresh = picked.filter((tag) => !attached.has(tag.id));

        try {
            // One at a time: a failure names the tag it failed on, and the ones
            // before it stay attached, which the refresh then shows.
            for (const tag of fresh) {
                await this.guarded(() => this.link(tag.id), tag.name);
            }
        } finally {
            if (fresh.length > 0) {
                dataset.refresh();
            }
        }

        return fresh.length;
    }

    /**
     * Take a tag off this record. Resolves `false` when nothing was done — a
     * cancelled confirmation — so the caller does not report a removal.
     */
    async remove(id: string, label: string, confirmText: { title: string; text: string }): Promise<boolean> {
        const { platform, dataset } = this.read();
        const { binding, parentSet } = await this.resolve();
        const tagId = bareId(id);

        if (binding.kind === 'manyToMany' && platform.parent) {
            await this.guarded(() => platform.reference('DELETE', `${parentSet}(${platform.parent!.id})/${binding.navigation}(${tagId})/$ref`));
            this.noteLink(tagId, false);
        } else if (binding.kind === 'oneToMany' && platform.webAPI) {
            const webAPI = platform.webAPI;

            await this.guarded(() =>
                webAPI.updateRecord(dataset.getTargetEntityType(), tagId, { [`${binding.navigation}@odata.bind`]: null }),
            );
        } else if (binding.kind === 'linkRows' && platform.webAPI && platform.confirm) {
            if (!(await platform.confirm(confirmText.title, confirmText.text))) {
                return false;
            }

            const webAPI = platform.webAPI;

            await this.guarded(() => webAPI.deleteRecord(dataset.getTargetEntityType(), id));
        } else {
            throw new Error(`${label} cannot be removed here.`);
        }

        dataset.refresh();

        return true;
    }

    /** Link one tag, by id, under the resolved binding. */
    private async link(id: string): Promise<void> {
        const { platform, dataset } = this.read();
        const { binding, target, parentSet } = await this.resolve();

        if (platform.parent === null) {
            throw new Error('There is no record to add the tag to.');
        }

        if (binding.kind === 'manyToMany') {
            await platform.reference('POST', `${parentSet}(${platform.parent.id})/${binding.navigation}/$ref`, {
                '@odata.id': `${platform.clientUrl}/api/data/v9.2/${target.entitySet}(${bareId(id)})`,
            });
            this.noteLink(id, true);
        } else if (binding.kind === 'oneToMany' && platform.webAPI) {
            await platform.webAPI.updateRecord(dataset.getTargetEntityType(), bareId(id), {
                [`${binding.navigation}@odata.bind`]: `/${parentSet}(${platform.parent.id})`,
            });
        } else {
            throw new Error('Tags cannot be added here.');
        }
    }

    /** Run a platform call and turn whatever it rejects with into an `Error` carrying one sentence. */
    private async guarded<T>(call: () => Promise<T>, subject?: string): Promise<T> {
        try {
            return await call();
        } catch (error) {
            const message = messageOf(error);

            throw new Error(subject ? `${subject}: ${message}` : message);
        }
    }
}
