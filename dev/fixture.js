/*
 * The view the dev harness binds: columns and records, chosen for the edges.
 *
 * **This is not `demo/tags.json`.** That one is the hub's demo fixture and
 * exists to look like a working control on a public page. This one exists to
 * break things.
 *
 * The single most important thing in this file is that **`name` and `alias` are
 * different strings on every column.**
 *
 * `alias` is the property-set's role name from the manifest — `labelField`,
 * `colorField` — and it is fixed. `name` is the column the maker actually
 * pointed that role at, and it is what `getFormattedValue()` takes. A fixture
 * that sets both to the same string passes whichever of the two the control
 * reads, so it certifies a control that looks up `getFormattedValue('labelField')`
 * — which finds nothing on a real form and renders every chip blank, silently.
 * The control's own components carry a comment about this; the fixture is where
 * it is enforced.
 *
 * Also here on purpose:
 *
 *   - **a record with no colour**, since `colorField` is an optional role and
 *     a view that omits it is the common case;
 *   - **an empty string and a null in the colour column**, the two values that
 *     catch a renderer treating falsy as absent;
 *   - **a label long enough to overflow**, because nobody finds out until a
 *     customer types one;
 *   - **fourteen records**, so `maxVisible: 12` has something to hide and the
 *     overflow affordance has a number to show.
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

    function tag(id, label, colour) {
        return {
            id: id,
            values: {
                // The real column names, which is what getFormattedValue takes.
                new_tagname: label,
                new_tagcolour: colour,
                name: label,
            },
        };
    }

    return {
        targetEntityType: 'new_tag',
        title: 'Related tags',

        /*
         * `order` is not the array order, on purpose: a view hands its columns
         * over in whatever order it likes and carries the intended position in
         * `order`.
         *
         * `alias` is the manifest's role name. `name` is the column behind it.
         * They differ here because on a real form they differ, and a control
         * that confuses them renders blank chips against a fixture where they
         * agree.
         */
        columns: [
            {
                name: 'new_tagcolour',
                displayName: 'Colour',
                dataType: 'SingleLine.Text',
                alias: 'colorField',
                order: 1,
                visualSizeFactor: 80,
            },
            {
                name: 'new_tagname',
                displayName: 'Tag',
                dataType: 'SingleLine.Text',
                alias: 'labelField',
                order: 0,
                visualSizeFactor: 160,
                isPrimary: true,
            },
        ],

        records: [
            tag('t1', 'Priority', '#D13438'),
            tag('t2', 'Follow up', '#0F6CBD'),
            tag('t3', 'Renewal', '#0E700E'),
            // No colour at all: the role is optional and plenty of views omit it.
            tag('t4', 'Escalated', null),
            // Empty rather than absent — the other value a falsy check swallows.
            tag('t5', 'Onboarding', ''),
            tag('t6', 'Contract review pending legal sign-off and countersignature', '#7A7574'),
            tag('t7', 'Upsell', '#8764B8'),
            tag('t8', 'Churn risk', '#C50F1F'),
            tag('t9', 'Reference', '#0F6CBD'),
            tag('t10', 'Partner', '#0E700E'),
            tag('t11', 'Beta', '#7A7574'),
            tag('t12', 'Enterprise', '#8764B8'),
            // Thirteen and fourteen exist so maxVisible: 12 has to hide something.
            tag('t13', 'Support plan', '#D13438'),
            tag('t14', 'Dormant', null),
        ],
    };
});
