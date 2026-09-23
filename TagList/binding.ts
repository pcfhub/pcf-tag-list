/**
 * Which relationship the subgrid shows, decided from metadata — never guessed.
 *
 * **The subgrid does not say.** Measured 2026-09-23 (SPEC.md P1): a subgrid
 * over a native many-to-many hands the control its target table and the
 * parent's identity (`mode.contextInfo`) and nothing about the relationship —
 * `filtering.getFilter()` is `null`. So the relationship is read from the
 * parent's `ManyToManyRelationships` and the target's `ManyToOneRelationships`
 * and matched to the pair of tables.
 *
 * **One pair of tables can have both kinds.** The probe's table did: an N:N
 * `cll_Account_cll_Tag_cll_Tag` *and* a `cll_account` lookup from tag to
 * account (P2). Nothing the control can read tells the two subgrids apart, so
 * with more than one candidate the answer is `ambiguous` and the maker names
 * one in `relationshipName`. Guessing is not dangerous here — an unlink on the
 * wrong relationship answers 204 and changes nothing (P3) — but a chip that
 * stays put with no explanation is its own kind of wrong.
 *
 * Pure, so the suite can assert every branch without a host.
 */

export interface ManyToManyRow {
    SchemaName: string;
    Entity1LogicalName: string;
    Entity2LogicalName: string;
    Entity1NavigationPropertyName: string;
    Entity2NavigationPropertyName: string;
}

export interface ManyToOneRow {
    SchemaName?: string;
    ReferencingAttribute: string;
    ReferencedEntity: string;
    ReferencingEntityNavigationPropertyName: string;
}

export type Binding =
    /** A native N:N: link with `$ref` from the parent's side, `navigation` naming that side's collection. */
    | { kind: 'manyToMany'; schemaName: string; navigation: string }
    /** A lookup on the tag to the parent: attach binds it, remove clears it. */
    | { kind: 'oneToMany'; schemaName: string; column: string; navigation: string }
    /**
     * Each row is itself the link — a junction table's own view, the label
     * read through a linked table. Removing deletes the row, which *is* the
     * unlink. Recognised by the label column being a linked table's (its name
     * carries a `.`), which is unmeasured; see SPEC.md "Not verified".
     */
    | { kind: 'linkRows' }
    /** More than one relationship could be this subgrid's; `candidates` are their SchemaNames. */
    | { kind: 'ambiguous'; candidates: string[] }
    /** Tags can be shown but not changed, and `reason` says why. */
    | { kind: 'unknown'; reason: 'noParent' | 'noMetadata' | 'noRelationship' | 'unmatchedName' | 'selfReferential' };

export interface BindingInput {
    /** The form's table, from `contextInfo`; `null` off a form record (canvas, the demo, an unsaved record). */
    parentTable: string | null;
    target: string;
    /** The parent's N:N rows, or `null` when the metadata could not be read. */
    manyToMany: ManyToManyRow[] | null;
    /** The target's N:1 rows, or `null` when the metadata could not be read. */
    manyToOne: ManyToOneRow[] | null;
    /** The maker's `relationshipName` input, `''` when unset. */
    relationshipName: string;
    /** The logical name of the column the label is read from. */
    labelColumn: string;
}

export function resolveBinding(input: BindingInput): Binding {
    if (input.labelColumn.includes('.')) {
        return { kind: 'linkRows' };
    }

    if (input.parentTable === null) {
        return { kind: 'unknown', reason: 'noParent' };
    }

    if (input.manyToMany === null && input.manyToOne === null) {
        return { kind: 'unknown', reason: 'noMetadata' };
    }

    const parent = input.parentTable;
    const named = input.relationshipName.trim().toLowerCase();

    const pairs = (input.manyToMany ?? []).filter(
        (row) =>
            (row.Entity1LogicalName === parent && row.Entity2LogicalName === input.target) ||
            (row.Entity2LogicalName === parent && row.Entity1LogicalName === input.target),
    );
    const lookups = (input.manyToOne ?? []).filter((row) => row.ReferencedEntity === parent);

    const asManyToMany = (row: ManyToManyRow): Binding =>
        // A table related to itself has the same name on both sides, so the
        // side the parent is on cannot be chosen by name. Refused rather than
        // guessed: half the time the guess links the tags the wrong way round.
        row.Entity1LogicalName === row.Entity2LogicalName
            ? { kind: 'unknown', reason: 'selfReferential' }
            : {
                  kind: 'manyToMany',
                  schemaName: row.SchemaName,
                  navigation:
                      row.Entity1LogicalName === parent ? row.Entity1NavigationPropertyName : row.Entity2NavigationPropertyName,
              };

    const asOneToMany = (row: ManyToOneRow): Binding => ({
        kind: 'oneToMany',
        schemaName: row.SchemaName ?? row.ReferencingAttribute,
        column: row.ReferencingAttribute,
        navigation: row.ReferencingEntityNavigationPropertyName,
    });

    if (named !== '') {
        const pair = pairs.find((row) => row.SchemaName.toLowerCase() === named);

        if (pair) {
            return asManyToMany(pair);
        }

        // A lookup can be named by its relationship or by its column: the
        // column is what a maker sees on the form, the SchemaName is what the
        // relationship list shows.
        const lookup = lookups.find(
            (row) => (row.SchemaName ?? '').toLowerCase() === named || row.ReferencingAttribute.toLowerCase() === named,
        );

        return lookup ? asOneToMany(lookup) : { kind: 'unknown', reason: 'unmatchedName' };
    }

    const candidates = pairs.length + lookups.length;

    if (candidates === 0) {
        return { kind: 'unknown', reason: 'noRelationship' };
    }

    if (candidates > 1) {
        return {
            kind: 'ambiguous',
            candidates: [...pairs.map((row) => row.SchemaName), ...lookups.map((row) => row.SchemaName ?? row.ReferencingAttribute)],
        };
    }

    return pairs.length === 1 ? asManyToMany(pairs[0]) : asOneToMany(lookups[0]);
}

/** Whether chips can be added or removed at all under this binding. */
export function canChange(binding: Binding): boolean {
    return binding.kind === 'manyToMany' || binding.kind === 'oneToMany' || binding.kind === 'linkRows';
}

/** Whether existing tags can be searched for and attached — not for link rows, whose rows are links rather than tags. */
export function canAttach(binding: Binding): boolean {
    return binding.kind === 'manyToMany' || binding.kind === 'oneToMany';
}
