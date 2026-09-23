/**
 * THROWAWAY — the 0.2.2 probe build. Nothing here ships in 0.3.0.
 *
 * 0.3.0 rests on four things this repository has never watched, so they are
 * asked of a real form before a line of the feature exists. Call from the
 * browser console on a form carrying the subgrid, and paste each answer into
 * SPEC.md verbatim, with the date:
 *
 *   p = window.__pcfTagListProbe
 *   await p.describe()                  // P1  what the host hands the control
 *   await p.relationships()             // P2  N:N and 1:N candidates, from metadata
 *   await p.associate('<tag guid>')     // P3a POST   <parentSet>(id)/<nav>/$ref
 *   await p.disassociate('<tag guid>')  // P3b DELETE <parentSet>(id)/<nav>(tag)/$ref
 *   await p.search('a')                 // P4  the type-ahead query
 *
 * `associate` / `disassociate` take an optional relationship SchemaName as a
 * second argument when `relationships()` reports more than one candidate.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ProbeAnswer {
    status: number | string;
    body: unknown;
}

let current: ComponentFramework.Context<any> | null = null;

function clientUrl(context: any): string | null {
    try {
        const fromPage = context?.page?.getClientUrl?.();

        if (typeof fromPage === 'string' && fromPage !== '') {
            return fromPage.replace(/\/$/, '');
        }
    } catch {
        // `page.getClientUrl` throws `Method not implemented.` on canvas; fall through.
    }

    const xrm = (window as any).Xrm;
    const fromGlobal = xrm?.Utility?.getGlobalContext?.()?.getClientUrl?.();

    return typeof fromGlobal === 'string' ? fromGlobal.replace(/\/$/, '') : null;
}

/** One same-origin request, the headers `pcf-audit-history`'s `fetchJson` sends, plus a method and a body. */
async function call(path: string, method = 'GET', body?: unknown): Promise<ProbeAnswer> {
    const base = clientUrl(current);

    if (base === null) {
        return { status: 'no client url', body: null };
    }

    const headers: Record<string, string> = {
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
    };

    if (body !== undefined) {
        headers['Content-Type'] = 'application/json; charset=utf-8';
    }

    try {
        const response = await fetch(`${base}/api/data/v9.2/${path}`, {
            method,
            headers,
            credentials: 'same-origin',
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await response.text();
        let parsed: unknown = text;

        try {
            parsed = text === '' ? '' : JSON.parse(text);
        } catch {
            // Not JSON; keep the text.
        }

        return { status: response.status, body: parsed };
    } catch (error) {
        return { status: 'threw', body: String(error) };
    }
}

function parent(): { table: string; id: string } | null {
    const info = (current?.mode as any)?.contextInfo;

    if (!info?.entityTypeName || !info?.entityId) {
        return null;
    }

    return { table: String(info.entityTypeName), id: String(info.entityId).replace(/[{}]/g, '').toLowerCase() };
}

function target(): string {
    return (current?.parameters as any)?.tags?.getTargetEntityType?.() ?? '';
}

async function entitySet(table: string): Promise<string | null> {
    const answer = await call(`EntityDefinitions(LogicalName='${table}')?$select=EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute`);

    return (answer.body as any)?.EntitySetName ?? null;
}

async function manyToMany(): Promise<any[]> {
    const host = parent();

    if (host === null) {
        return [];
    }

    const answer = await call(
        `EntityDefinitions(LogicalName='${host.table}')/ManyToManyRelationships` +
            '?$select=SchemaName,IntersectEntityName,Entity1LogicalName,Entity2LogicalName,' +
            'Entity1NavigationPropertyName,Entity2NavigationPropertyName',
    );
    const rows: any[] = (answer.body as any)?.value ?? [];
    const other = target();

    return rows.filter((row) => row.Entity1LogicalName === other || row.Entity2LogicalName === other);
}

/** The collection-valued navigation property on the parent's side of the relationship. */
function parentSideNav(row: any, table: string): string {
    return row.Entity1LogicalName === table ? row.Entity1NavigationPropertyName : row.Entity2NavigationPropertyName;
}

async function refPath(schemaName?: string): Promise<{ set: string; id: string; nav: string; targetSet: string } | string> {
    const host = parent();

    if (host === null) {
        return 'no contextInfo';
    }

    const candidates = await manyToMany();
    const chosen = schemaName ? candidates.find((row) => row.SchemaName === schemaName) : candidates[0];

    if (!chosen || (!schemaName && candidates.length > 1)) {
        return `pick one of: ${candidates.map((row) => row.SchemaName).join(', ') || '(none)'}`;
    }

    const set = await entitySet(host.table);
    const targetSet = await entitySet(target());

    if (!set || !targetSet) {
        return `entity set unreadable: ${set} / ${targetSet}`;
    }

    return { set, id: host.id, nav: parentSideNav(chosen, host.table), targetSet };
}

async function refresh(): Promise<number | null> {
    const dataset = (current?.parameters as any)?.tags;

    dataset?.refresh?.();
    await new Promise((resolve) => setTimeout(resolve, 2500));

    return ((current?.parameters as any)?.tags?.sortedRecordIds ?? []).length ?? null;
}

const probe = {
    describe(): unknown {
        const dataset: any = (current?.parameters as any)?.tags;

        return {
            contextInfo: (current?.mode as any)?.contextInfo ?? null,
            targetEntityType: target(),
            viewId: dataset?.getViewId?.() ?? '(no getViewId)',
            linkedEntities: dataset?.getLinkedEntities?.() ?? '(no getLinkedEntities)',
            filter: dataset?.filtering?.getFilter?.() ?? null,
            columns: (dataset?.columns ?? []).map((column: any) => ({
                name: column.name,
                alias: column.alias,
                dataType: column.dataType,
            })),
            rows: (dataset?.sortedRecordIds ?? []).length,
            totalResultCount: dataset?.paging?.totalResultCount,
            hasNextPage: dataset?.paging?.hasNextPage,
            clientUrl: clientUrl(current),
            hasLookupObjects: typeof (current as any)?.utils?.lookupObjects === 'function',
            hasConfirmDialog: typeof (current as any)?.navigation?.openConfirmDialog === 'function',
        };
    },

    async relationships(): Promise<unknown> {
        const host = parent();
        const other = target();
        const manyToOne = await call(
            `EntityDefinitions(LogicalName='${other}')/ManyToOneRelationships` +
                '?$select=SchemaName,ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName',
        );

        return {
            parent: host,
            target: other,
            manyToMany: await manyToMany(),
            manyToOneToParent: ((manyToOne.body as any)?.value ?? []).filter(
                (row: any) => host !== null && row.ReferencedEntity === host.table,
            ),
            manyToOneStatus: manyToOne.status,
        };
    },

    async associate(tagId: string, schemaName?: string): Promise<unknown> {
        const path = await refPath(schemaName);

        if (typeof path === 'string') {
            return path;
        }

        const base = clientUrl(current);
        const answer = await call(`${path.set}(${path.id})/${path.nav}/$ref`, 'POST', {
            '@odata.id': `${base}/api/data/v9.2/${path.targetSet}(${tagId.replace(/[{}]/g, '')})`,
        });

        return { request: path, answer, rowsAfterRefresh: await refresh() };
    },

    async disassociate(tagId: string, schemaName?: string): Promise<unknown> {
        const path = await refPath(schemaName);

        if (typeof path === 'string') {
            return path;
        }

        const answer = await call(`${path.set}(${path.id})/${path.nav}(${tagId.replace(/[{}]/g, '')})/$ref`, 'DELETE');

        return { request: path, answer, rowsAfterRefresh: await refresh() };
    },

    async search(text: string): Promise<unknown> {
        const other = target();
        const definition = await call(`EntityDefinitions(LogicalName='${other}')?$select=PrimaryIdAttribute,PrimaryNameAttribute`);
        const name = (definition.body as any)?.PrimaryNameAttribute ?? 'name';
        const id = (definition.body as any)?.PrimaryIdAttribute ?? `${other}id`;
        const query = `?$select=${id},${name}&$filter=contains(${name},'${text.replace(/'/g, "''")}')&$orderby=${name}&$top=8`;

        try {
            const result = await (current as any).webAPI.retrieveMultipleRecords(other, query);

            return { query, count: result.entities.length, first: result.entities.slice(0, 3), nextLink: result.nextLink };
        } catch (error) {
            return { query, rejected: error };
        }
    },
};

/** Parks the probe on `window` and keeps it pointed at the latest context. */
export function installProbe(context: ComponentFramework.Context<any>): void {
    current = context;
    (window as any).__pcfTagListProbe = probe;
}
