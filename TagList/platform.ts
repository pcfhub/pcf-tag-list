/**
 * Everything read off `context`, in one file, each read guarded — every member
 * here is one a host can withhold: `webAPI` and `utils` on canvas,
 * `contextInfo` and `page` undocumented, `lookupObjects` and the dialogs on a
 * host without them. The rest of the control is written against what this
 * file returns, never against `context`.
 *
 * It is also the **only** file that calls `fetch`. `context.webAPI` has no
 * relationship verbs, so linking a tag over a native many-to-many is a `$ref`
 * request on the organisation URL — measured working from a PCF control on a
 * model-driven form, 2026-09-23 (SPEC.md P3): POST and DELETE both 204, and
 * both idempotent. The relationship metadata is a same-origin GET the same way.
 */

import { IInputs } from './generated/ManifestTypes';
import { ManyToManyRow, ManyToOneRow } from './binding';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Parent {
    table: string;
    /** Bare and lower-case. */
    id: string;
}

export interface TableInfo {
    /** The plural a URL is spelled with (`accounts`, `cll_tags`); `null` when metadata would not say. */
    entitySet: string | null;
    primaryId: string;
    primaryName: string;
}

export interface Found {
    id: string;
    name: string;
}

export interface PickOptions {
    entityTypes: string[];
    defaultEntityType: string;
    allowMultiSelect: boolean;
    filters?: { filterXml: string; entityLogicalName: string }[];
    /** The dialog's opening search term — Unified Interface only, per the `lookupObjects` reference. */
    searchText?: string;
}

export interface Platform {
    /** The record the form is on, or `null` — canvas, the hub's demo, an unsaved record. */
    parent: Parent | null;
    /** `context.webAPI` when this host has one that writes; `null` on canvas and in the demo. */
    webAPI: ComponentFramework.WebApi | null;
    /** The organisation URL a `$ref` and a metadata read start from, or `null`. */
    clientUrl: string | null;
    /** The table's set name and primary columns, from `utils.getEntityMetadata`. */
    tableInfo: (table: string) => Promise<TableInfo>;
    /** A table's many-to-many rows, or `null` when they could not be read. */
    manyToMany: (table: string) => Promise<ManyToManyRow[] | null>;
    /** A table's many-to-one rows, or `null` when they could not be read. */
    manyToOne: (table: string) => Promise<ManyToOneRow[] | null>;
    /** A `$ref` request; rejects with the server's own sentence on anything but 2xx. */
    reference: (method: 'POST' | 'DELETE', path: string, body?: unknown) => Promise<void>;
    /**
     * The ids a collection-valued navigation property holds — every tag a
     * record is linked to, not just the page the dataset loaded — or `null`
     * when the read fails. Follows `@odata.nextLink` up to `LINKED_PAGES`.
     */
    linkedIds: (path: string, idColumn: string) => Promise<Set<string> | null>;
    /** The platform's lookup dialog, or `null`. A cancel resolves `[]`. */
    pick: ((options: PickOptions) => Promise<Found[]>) | null;
    /** The platform's confirm dialog, or `null`. **A cancel is a resolve**, and arrives as `false`. */
    confirm: ((title: string, text: string) => Promise<boolean>) | null;
}

/**
 * How many pages of a record's links are read to keep them out of the
 * suggestions — 5,000 tags at the server's default page size. Past that the
 * suggestions may offer a tag the record has, and choosing it changes
 * nothing: an associate is idempotent (measured, P3).
 */
export const LINKED_PAGES = 10;

export function bareId(id: string): string {
    return String(id).replace(/[{}]/g, '').toLowerCase();
}

/**
 * One readable sentence out of whatever a platform call rejected with. A
 * `webAPI` rejection is a plain object `{ errorCode, message }`, not an
 * `Error`; a Web API response carries `{ error: { message } }`; `fetch`
 * offline throws a `TypeError`. All three reach the user as a sentence.
 */
export function messageOf(error: unknown): string {
    const candidate = error as any;
    const text = candidate?.error?.message ?? candidate?.message ?? (typeof error === 'string' ? error : '');

    return String(text).split('\r\n')[0].trim() || 'The request failed.';
}

function readClientUrl(context: ComponentFramework.Context<IInputs>): string | null {
    try {
        const url = (context as any).page?.getClientUrl?.();

        if (typeof url === 'string' && url !== '') {
            return url.replace(/\/+$/, '');
        }
    } catch {
        // Canvas publishes `getClientUrl` and throws `Method not implemented.`
        // from it (pcf-data-table, measured 2026-09-22).
    }

    return null;
}

const HEADERS = {
    Accept: 'application/json',
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
};

/** The one fetch helper: same origin, OData headers, the server's sentence on refusal. */
async function request(clientUrl: string, method: string, path: string, body?: unknown): Promise<any> {
    if (typeof fetch !== 'function') {
        throw new Error('fetch is not available on this host.');
    }

    const headers: Record<string, string> = { ...HEADERS };

    if (body !== undefined) {
        headers['Content-Type'] = 'application/json; charset=utf-8';
    }

    const response = await fetch(`${clientUrl}/api/data/v9.2/${path}`, {
        method,
        headers,
        credentials: 'same-origin',
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let parsed: any = null;

    try {
        parsed = text === '' ? null : JSON.parse(text);
    } catch {
        parsed = null;
    }

    if (!response.ok) {
        throw new Error(messageOf(parsed) !== 'The request failed.' ? messageOf(parsed) : `HTTP ${response.status}`);
    }

    return parsed;
}

export function readPlatform(context: ComponentFramework.Context<IInputs>): Platform {
    const any = context as any;
    const info = any.mode?.contextInfo;
    const parent: Parent | null =
        info?.entityTypeName && info?.entityId ? { table: String(info.entityTypeName), id: bareId(info.entityId) } : null;
    const clientUrl = readClientUrl(context);
    const webAPI: ComponentFramework.WebApi | null =
        typeof any.webAPI?.createRecord === 'function' && typeof any.webAPI?.retrieveMultipleRecords === 'function'
            ? context.webAPI
            : null;
    const utils = any.utils;
    const navigation = any.navigation;

    const rows = async (table: string, kind: string, select: string): Promise<any[] | null> => {
        if (clientUrl === null) {
            return null;
        }

        try {
            const answer = await request(clientUrl, 'GET', `EntityDefinitions(LogicalName='${table}')/${kind}?$select=${select}`);

            return Array.isArray(answer?.value) ? answer.value : null;
        } catch {
            return null;
        }
    };

    return {
        parent,
        webAPI,
        clientUrl,

        /*
         * `getEntityMetadata` resolves a class instance whose public surface
         * is prototype getters — read by name, never by walking keys.
         */
        tableInfo: async (table) => {
            const fallback: TableInfo = { entitySet: null, primaryId: `${table}id`, primaryName: '' };

            if (typeof utils?.getEntityMetadata !== 'function') {
                return fallback;
            }

            try {
                const metadata = await utils.getEntityMetadata(table, []);

                return {
                    entitySet: typeof metadata?.EntitySetName === 'string' ? metadata.EntitySetName : null,
                    primaryId: typeof metadata?.PrimaryIdAttribute === 'string' ? metadata.PrimaryIdAttribute : fallback.primaryId,
                    primaryName: typeof metadata?.PrimaryNameAttribute === 'string' ? metadata.PrimaryNameAttribute : '',
                };
            } catch {
                return fallback;
            }
        },

        manyToMany: (table) =>
            rows(
                table,
                'ManyToManyRelationships',
                'SchemaName,Entity1LogicalName,Entity2LogicalName,Entity1NavigationPropertyName,Entity2NavigationPropertyName',
            ),

        manyToOne: (table) =>
            rows(table, 'ManyToOneRelationships', 'SchemaName,ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName'),

        reference: async (method, path, body) => {
            if (clientUrl === null) {
                throw new Error('This host does not publish its organisation URL.');
            }

            await request(clientUrl, method, path, body);
        },

        linkedIds: async (path, idColumn) => {
            if (clientUrl === null) {
                return null;
            }

            const ids = new Set<string>();
            let next: string | null = `${path}?$select=${idColumn}`;

            try {
                for (let page = 0; next !== null && page < LINKED_PAGES; page += 1) {
                    const answer: any = await request(clientUrl, 'GET', next);

                    for (const row of Array.isArray(answer?.value) ? answer.value : []) {
                        if (row?.[idColumn]) {
                            ids.add(bareId(String(row[idColumn])));
                        }
                    }

                    const link: unknown = answer?.['@odata.nextLink'];

                    // A nextLink is absolute; the helper wants the part after the service root.
                    next = typeof link === 'string' && link.includes('/api/data/v9.2/') ? link.split('/api/data/v9.2/')[1] : null;
                }

                return ids;
            } catch {
                return null;
            }
        },

        pick:
            typeof utils?.lookupObjects === 'function'
                ? async (options) => {
                      const picked = await utils.lookupObjects(options);

                      return (Array.isArray(picked) ? picked : []).map((value: any) => ({
                          id: bareId(value.id),
                          name: String(value.name ?? ''),
                      }));
                  }
                : null,

        confirm:
            typeof navigation?.openConfirmDialog === 'function'
                ? (title, text) =>
                      Promise.resolve()
                          .then(() => navigation.openConfirmDialog({ title, text }))
                          .then(
                              (response: any) => response?.confirmed === true,
                              () => false,
                          )
                : null,
    };
}
