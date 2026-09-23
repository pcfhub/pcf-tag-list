/*
 * The tables the dev rig answers from, shaped after the probe's environment
 * (SPEC.md, 2026-09-23): an account, a `cll_tag` table, a native many-to-many
 * between them, **and** a `cll_account` lookup from tag to account — the pair
 * of relationships that makes the binding ambiguous until a maker names one.
 *
 * **This is not `demo/tags.json`.** That one is the hub's demo fixture and
 * exists to look like a working control on a public page. This one exists to
 * break things. Kept on purpose:
 *
 *   - **`name` and `alias` differ on every column.** `alias` is the manifest's
 *     role name (`labelField`), `name` the column the maker bound; a fixture
 *     where they agree certifies a control reading the wrong one (0.1.x did).
 *   - **a tag with no colour**, and an empty string, the two values that catch
 *     a renderer treating falsy as absent;
 *   - **a label long enough to overflow**;
 *   - **fourteen linked tags at the rig's page size of five**, so `maxVisible`
 *     has something to hide and there are three pages to load;
 *   - **tags linked to nothing**, for a search to find and a pick to attach;
 *   - **a quote in a name**, which a search has to escape as `''`.
 *
 * Every tag appears twice from one list: as a dataset row (what a subgrid can
 * show once linked) and as a `tables` row (what a search reads), so a tag found
 * by a search is a tag the subgrid can show after the link.
 *
 * Loaded by `harness.html` in a browser and by `smoke.js` in Node, so it
 * assigns both ways and depends on neither.
 */

(function (root, factory) {
    'use strict';

    var fixture = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = fixture;
    }

    if (root) {
        root.__pcfFixture = fixture;
    }
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    var PARENT = 'a0c0ffee-0000-4000-8000-000000000001';
    var OTHER = 'a0c0ffee-0000-4000-8000-000000000002';
    var N2N = 'cll_Account_cll_Tag_cll_Tag';

    function guid(n) {
        return 'bada55ed-0000-4000-8000-' + String(n).padStart(12, '0');
    }

    /*
     * [label, colour, linked over the N:N?, owner through the lookup]
     */
    var TAGS = [
        ['Feature', '#7C3AED', true, PARENT],
        ['Bug', '#DC2626', true, PARENT],
        ['Enhancement', '#2563EB', true, null],
        ['Documentation', '#059669', true, null],
        ['Needs triage', '#D97706', true, null],
        ["Won't fix", '', true, null],
        ['Security', null, true, null],
        ['Performance', '#0891B2', true, null],
        ['Accessibility', '#9333EA', true, null],
        ['A label long enough to overflow any chip that forgot to truncate it', '#6B7280', true, null],
        ['Regression', '#BE123C', true, null],
        ['Customer', '#15803D', true, null],
        ['Backlog', '#64748B', true, null],
        ['Design', '#DB2777', true, null],
        // Linked to nothing: what a search finds and a pick attaches.
        ['Power Apps', '#742774', false, null],
        ['Dataverse', '#088142', false, null],
        ["O'Brien", '#1D4ED8', false, null],
        ['Black', '#111827', false, null],
        // Owned by another account: a one-to-many search must not offer it.
        ['Taken elsewhere', '#A16207', false, OTHER],
    ];

    function owner(id) {
        return id === null
            ? null
            : { id: { guid: id }, etn: 'account', name: id === PARENT ? 'Adventure Works (sample)' : 'Contoso' };
    }

    var records = TAGS.map(function (tag, index) {
        return {
            id: guid(index + 1),
            values: {
                cll_tagname: tag[0],
                cll_tagcolour: tag[1],
                cll_account: owner(tag[3]),
            },
        };
    });

    return {
        PARENT: PARENT,
        OTHER: OTHER,
        N2N: N2N,
        guid: guid,

        targetEntityType: 'cll_tag',
        entitySetName: 'cll_tags',
        title: 'Tags',
        primaryNames: { cll_tag: 'cll_tagname' },

        columns: [
            { name: 'cll_tagcolour', displayName: 'Colour', dataType: 'SingleLine.Text', alias: 'colorField', order: 1, visualSizeFactor: 60 },
            { name: 'cll_tagname', displayName: 'Name', dataType: 'SingleLine.Text', alias: 'labelField', order: 0, visualSizeFactor: 150 },
        ],

        records: records,

        /* Measured shape, SPEC.md P2: the navigation property is the SchemaName on both sides. */
        manyToMany: [
            { schemaName: N2N, entity1: 'cll_tag', entity2: 'account', nav1: N2N, nav2: N2N, intersect: 'cll_account_cll_tag' },
        ],

        links: TAGS.map(function (tag, index) {
            return tag[2] ? { relationship: N2N, ids: [PARENT, guid(index + 1)] } : null;
        }).filter(Boolean),

        /* The competing one-to-many, measured on the same table (P2). */
        relationships: [
            { schemaName: 'cll_Account_Account_cll_Tag', column: 'cll_account', target: 'account', navigationProperty: 'cll_Account' },
        ],

        related: {
            account: {
                entitySet: 'accounts',
                rows: [
                    { id: PARENT, name: 'Adventure Works (sample)' },
                    { id: OTHER, name: 'Contoso' },
                ],
            },
        },

        tables: {
            cll_tag: TAGS.map(function (tag, index) {
                return { cll_tagid: guid(index + 1), cll_tagname: tag[0], _cll_account_value: tag[3] };
            }),
        },
    };
});
