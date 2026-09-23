/**
 * The chips a record shows, from whichever source is behind the control —
 * the bound view on a form, the sample document in the hub's demo — in one
 * shape, so the component renders both the same way.
 */

export interface Chip {
    id: string;
    label: string;
    color: string | null;
}

export interface Listing {
    chips: Chip[];
    /** Every tag the record has, loaded or not; `-1` when the host will not count. */
    total: number;
    hasNextPage: boolean;
    loading: boolean;
    loadNextPage: () => void;
}

/**
 * `property-set` roles, not fixed column names. `column.alias` is the role
 * (`labelField`/`colorField`, from the manifest) and `column.name` is the real
 * column the maker bound — `getFormattedValue()` takes the latter. 0.1.x had
 * these backwards and rendered no chips on any real form (SPEC.md).
 */
export function resolveChips(dataset: ComponentFramework.PropertyTypes.DataSet): Chip[] {
    const labelColumn = dataset.columns.find((column) => column.alias === 'labelField');
    const colorColumn = dataset.columns.find((column) => column.alias === 'colorField');

    if (!labelColumn) {
        return [];
    }

    return dataset.sortedRecordIds.map((id) => {
        const record = dataset.records[id];

        return {
            id,
            label: record.getFormattedValue(labelColumn.name),
            color: colorColumn ? record.getFormattedValue(colorColumn.name) || null : null,
        };
    });
}

/** The bound view as a listing — the live route. */
export function listDataset(dataset: ComponentFramework.PropertyTypes.DataSet): Listing {
    return {
        chips: resolveChips(dataset),
        total: dataset.paging.totalResultCount,
        hasNextPage: dataset.paging.hasNextPage,
        loading: dataset.loading,
        // Bare loadNextPage() accumulates: sortedRecordIds comes back
        // holding every page so far (pcf-compact-list).
        loadNextPage: () => dataset.paging.loadNextPage(),
    };
}
