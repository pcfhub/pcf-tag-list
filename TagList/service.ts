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
 *
 * **Two sources, one surface.** With `sampleData` set (the hub's demo) every
 * method answers from a `SampleStore` instead — same rules, same refusals,
 * same `Error`s — and `listing()` hands the component the sample's chips in
 * place of the view's. The component never asks which route it is on.
 */

import { Binding, canChange, resolveBinding } from './binding';
import { listDataset, Listing } from './chips';
import { bareId, Found, messageOf, Platform, TableInfo } from './platform';
import { parseSampleData, SampleStore } from './sample';

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
    /** The `sampleData` input, `''` on a real form. */
    sampleData: string;
}

/** How many suggestions a search shows. */
export const SUGGESTIONS = 8;

export class TagService {
    private resolving: { key: string; promise: Promise<Resolved>; value: Resolved | null } | null = null;

    /** Every tag the record is linked to under a many-to-many, read once per binding and kept current by this service's own writes. */
    private linked: { key: string; promise: Promise<Set<string> | null> } | null = null;

    /** The sample route's store, kept while the text is unchanged so the demo's links survive a re-render. */
    private sampled: { text: string; store: SampleStore | null } | null = null;

    /** Reads the current inputs on every call, because a context is a new object every pass. */
    constructor(private readonly read: () => ServiceInputs) {}

    /**
     * The sample route: `undefined` on a real form, `null` for a document the
     * parser could not read, else the store.
     */
    private sample(): SampleStore | null | undefined {
        const text = this.read().sampleData.trim();

        if (text === '') {
            return undefined;
        }

        if (this.sampled?.text !== text) {
            const document = parseSampleData(text);

            this.sampled = { text, store: document === null ? null : new SampleStore(document) };
        }

        return this.sampled.store;
    }

    /** Whether the control is playing against `sampleData` rather than Dataverse. */
    isSample(): boolean {
        return this.sample() !== undefined;
    }

    /** The chips and paging to render — the view's on a form, the sample's in the demo. */
    listing(dataset: ComponentFramework.PropertyTypes.DataSet): Listing {
        const store = this.sample();

        if (store === undefined) {
            return listDataset(dataset);
        }

        const chips = (store?.chips() ?? []).map((tag) => ({ id: tag.id, label: tag.name, color: tag.color }));

        return { chips, total: chips.length, hasNextPage: false, loading: false, loadNextPage: () => undefined };
    }

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

        const sample = this.read().sampleData.trim();

        return { key: [platform.parent?.id ?? '', target, labelColumn, relationshipName, sample].join('|'), target, labelColumn };
    }

    private async resolveUncached(target: string, labelColumn: string): Promise<Resolved> {
        const { platform, relationshipName, primaryNameField } = this.read();
        const store = this.sample();

        if (store !== undefined) {
            return {
                binding: store?.binding ?? { kind: 'unknown', reason: 'badSample' },
                target: { entitySet: null, primaryId: 'id', primaryName: 'name' },
                parentSet: null,
            };
        }
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
        const store = this.sample();

        if (store !== undefined) {
            return store !== null && (binding.kind === 'manyToMany' || binding.kind === 'oneToMany') ? store.search(term, SUGGESTIONS) : [];
        }

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
        const store = this.sample();

        if (store !== undefined) {
            await this.resolve();
            await this.guarded(async () => this.sampleOnly(store).link(tag.id));

            return;
        }

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
        const store = this.sample();

        if (store !== undefined) {
            if (binding.kind !== 'manyToMany' && binding.kind !== 'oneToMany') {
                throw new Error('Tags cannot be created here.');
            }

            await this.guarded(async () => this.sampleOnly(store).create(name));

            return;
        }

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
     * The platform's own lookup dialog, multi-select, opened on whatever the user
     * had already typed (`searchText`) so Browse continues the search rather
     * than starting over. Resolves how many tags were attached — `0` for a
     * cancel, which is a resolve with `[]`.
     */
    async browse(searchText = ''): Promise<number> {
        const { platform, dataset } = this.read();
        const { binding } = await this.resolve();
        const table = dataset.getTargetEntityType();

        // No dialog on the sample route: the demo's lookupObjects resolves `[]`, which would read as a cancel.
        if (platform.pick === null || this.isSample() || (binding.kind !== 'manyToMany' && binding.kind !== 'oneToMany')) {
            return 0;
        }

        const picked = await this.guarded(() =>
            platform.pick!({
                entityTypes: [table],
                defaultEntityType: table,
                allowMultiSelect: true,
                // Sent only when there is a term: an empty one would open the dialog on a blank search either way.
                ...(searchText.trim() !== '' ? { searchText: searchText.trim() } : {}),
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
        const store = this.sample();

        if (store !== undefined) {
            if (binding.kind === 'linkRows' && platform.confirm && !(await platform.confirm(confirmText.title, confirmText.text))) {
                return false;
            }

            if (!canChange(binding)) {
                throw new Error(`${label} cannot be removed here.`);
            }

            await this.guarded(async () => this.sampleOnly(store).unlink(id));

            return true;
        }

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

    /** The store, or the named state's sentence as a rejection — reached only past a binding that allowed the call. */
    private sampleOnly(store: SampleStore | null): SampleStore {
        if (store === null) {
            throw new Error('The sample data could not be read.');
        }

        return store;
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
