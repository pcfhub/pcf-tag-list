/*
 * Drives the real built bundle outside a browser.
 *
 *     npm run build && npm run smoke
 *
 * A **virtual dataset** control: `updateView` returns the element it wants
 * rendered, so these assertions read the props it handed down and the calls it
 * made on the platform. Both halves matter here — this is the only control in
 * the catalogue that writes to Dataverse, and *what it asked for* is the
 * decision worth pinning.
 *
 * Why it exists alongside `npm start`: that harness reports no second page and
 * has no Web API at all, so none of the interesting paths here can be reached
 * from it. The three that matter:
 *
 *   - **creating a tag linked to the host record**, which needs
 *     `mode.contextInfo` (undocumented, model-driven only) and a metadata round
 *     trip to turn a logical name into the entity *set* name `@odata.bind`
 *     wants;
 *   - **creating one where that is impossible** — canvas, the hub's demo
 *     harness, or an unbound `parentLookupField` — where the control has to
 *     create an unlinked tag rather than throw;
 *   - **removing a tag**, which deletes a record because
 *     `ComponentFramework.WebApi` has no disassociate primitive at all.
 *
 * **What passing here does NOT mean.** Every value is supplied by this file. It
 * cannot tell you that `deleteRecord` on a native M:N relationship does
 * anything useful — it does not, and SPEC.md says so — nor that a real form
 * hands down what these fixtures hand down.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const dom = require('./dom.js');
const host = require('./host.js');
const fixture = require('./fixture.js');
const clock = require('./clock.js');

const BUNDLE = path.join(root, 'out', 'controls', 'TagList', 'bundle.js');

if (!fs.existsSync(BUNDLE)) {
    console.error('\n  No bundle at out/controls/TagList. Run npm run build first.\n');
    process.exit(1);
}

/* ----------------------------------------------------------- the platform */

dom.install(global);

const time = clock.install(Date.UTC(2026, 0, 1, 12, 0, 0), global);

const registration = host.captureRegistration(global);

const source = fs.readFileSync(BUNDLE, 'utf8');

const reactGlobals = [...new Set(source.match(/\bReactv[\w]*\b/g) || [])];
const fluentGlobals = [...new Set(source.match(/\bFluentUIReact[\w]*\b/g) || [])];

if (reactGlobals.length > 0) {
    const React = require(path.join(root, 'node_modules', 'react'));

    reactGlobals.forEach((name) => {
        global[name] = React;
    });
}

const fluent = new Proxy({}, { get: (_t, name) => (typeof name === 'string' ? name : undefined) });

fluentGlobals.forEach((name) => {
    global[name] = fluent;
});

vm.runInThisContext(source, { filename: 'bundle.js' });

/* ---------------------------------------------------------------- harness */

const results = [];

function check(label, ok, detail) {
    results.push({ ok, label, detail });
}

const marked = (key) => `resx:${key}`;

const live = [];

function disposeAll() {
    while (live.length > 0) {
        live.pop().destroy();
    }
}

/**
 * Bind a fresh control to a fresh view and render until it settles.
 *
 * `host.drive` renders repeatedly while the control owes another pass, which is
 * how a control that refreshes from inside `updateView` shows up as a count
 * rather than a stack overflow.
 */
function bind(options) {
    const handle = host.createHost(fixture, { getString: marked, ...options });
    const container = dom.createElement('div');
    const instance = new registration.ctor();

    let notifications = 0;

    instance.init(
        handle.context,
        () => {
            notifications += 1;
        },
        {},
        container,
    );

    let driven = host.drive(instance, handle, 10);

    const view = {
        instance,
        handle,
        get driven() {
            return driven;
        },
        props: () => (driven.element && driven.element.props) || {},
        outputs: () => instance.getOutputs(),
        notifications: () => notifications,
        calls: () => handle.state.calls,
        settle: () => {
            driven = host.drive(instance, handle, 10);

            return driven;
        },
        destroy: () => {
            instance.destroy();

            const at = live.indexOf(view);

            if (at !== -1) {
                live.splice(at, 1);
            }
        },
    };

    live.push(view);

    return view;
}

/** Let the promise chains in create/remove settle before reading the log. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

check('bundle registered a control', typeof registration.ctor === 'function');

if (typeof registration.ctor !== 'function') {
    report();
}

/* ------------------------------------------------------- what it hands down */

const plain = bind({});

check('settles instead of refreshing forever', plain.driven.looping === false, `${plain.driven.passes} passes`);

check('returns an element rather than writing into a container', plain.driven.element !== undefined);

check(
    'hands the dataset down rather than a copy of it',
    plain.props().dataset !== undefined && typeof plain.props().dataset.getTargetEntityType === 'function',
);

check('passes the maker inputs through', plain.props().allowCreate === true && plain.props().maxVisible === 12);

check('and the form read-only state', bind({ disabled: true }).props().disabled === true);

/* --------------------------------------------------- roles, not column names */

/*
 * **The trap this fixture is built around.**
 *
 * `column.alias` is the property-set's role name from the manifest —
 * `labelField`, `colorField` — and it is fixed. `column.name` is the column the
 * maker pointed that role at, and it is what `getFormattedValue()` takes.
 *
 * A fixture that sets both to the same string passes whichever the control
 * reads, so it certifies a control calling `getFormattedValue('labelField')` —
 * which matches nothing on a real form and renders every chip blank, silently.
 * Here they always differ, so the assertion means something.
 */
const labelColumn = fixture.columns.find((column) => column.alias === 'labelField');

check(
    'the fixture keeps alias and name different, or nothing below proves anything',
    labelColumn.alias !== labelColumn.name,
    `alias: ${labelColumn.alias}, name: ${labelColumn.name}`,
);

const dataset = plain.props().dataset;
const firstId = dataset.sortedRecordIds[0];

check(
    'a record reads its label through the column name behind the role',
    dataset.records[firstId].getFormattedValue(labelColumn.name) !== '',
    dataset.records[firstId].getFormattedValue(labelColumn.name),
);

check(
    'and reads nothing through the role name itself, which is what a real form does',
    dataset.records[firstId].getFormattedValue('labelField') === '',
    JSON.stringify(dataset.records[firstId].getFormattedValue('labelField')),
);

/* ------------------------------------------------------------- opening */

/*
 * Opening a tag does two things, and both are the control's decision: it
 * reports the record through its output property, and it asks the *platform* to
 * navigate rather than building a URL itself.
 */
const opened = bind({});
const openId = opened.props().dataset.sortedRecordIds[0];

opened.props().onOpenTag(openId);

check('opening a tag reports it through the output property', opened.outputs().selectedTagId === openId, opened.outputs().selectedTagId);

check('and notifies the platform once', opened.notifications() === 1, String(opened.notifications()));

check(
    'and asks the platform to navigate rather than routing itself',
    opened.calls().some((call) => call.startsWith('openDatasetItem')),
    opened.calls().join(' '),
);

/* ------------------------------------------------------------- removing */

(async () => {
    /*
     * `ComponentFramework.WebApi` has no `execute` and no relationship-level
     * disassociate — only create/read/update/delete Record against an entity
     * set. So removing a tag deletes a record, which only does the right thing
     * when `tags` is bound to the join entity's own view. That is a real
     * platform limitation rather than a shortcut, recorded in SPEC.md, and what
     * is asserted here is the half the control controls: the right entity, the
     * right id, and a refresh afterwards.
     */
    const removed = bind({});
    const removeId = removed.props().dataset.sortedRecordIds[0];

    removed.props().onRemoveTag(removeId);
    await flush();

    check(
        'removing a tag deletes against the dataset’s own target entity',
        removed.calls().some((call) => call === `deleteRecord("${fixture.targetEntityType} ${removeId}")`),
        removed.calls().filter((c) => c.startsWith('deleteRecord')).join(' ') || 'no deleteRecord',
    );

    check(
        'and refreshes the view afterwards rather than leaving it stale',
        removed.calls().some((call) => call === 'refresh'),
        removed.calls().join(' '),
    );

    /*
     * ⚠️ **There is no assertion here for a delete that fails, and the reason
     * is a finding rather than an omission.**
     *
     * `onRemoveTag` chains `.finally(() => dataset.refresh())` and no `.catch`,
     * so a rejected `deleteRecord` becomes an unhandled promise rejection. In
     * Node that ends the process, which is how this was found — the first run
     * of this suite died rather than failing an assertion. In a browser it is a
     * console error the user never sees: the list refreshes, the tag is still
     * there, and nothing says why.
     *
     * `createTag` has the same shape. Writing an assertion for the current
     * behaviour would pin a defect in place, and fixing it is not a one-line
     * change — the props carry no error surface, so somebody has to decide what
     * the user is told. Recorded in SPEC.md under "Still open" instead. Restore
     * `webApiFails: true` here once there is a decision to assert.
     */

    /* ------------------------------------------------------------ creating */

    /*
     * **The subtle one.** `@odata.bind` needs the parent's entity *set* name,
     * which is plural and is not the logical name — there is no static mapping
     * available to a control, so it costs a metadata round trip. A control that
     * used `entityTypeName` directly builds `/account(id)` where the platform
     * wants `/accounts(id)`, and the create fails at the server.
     */
    const created = bind({});

    created.props().onCreateTag('Renewal risk');
    await flush();

    check(
        'creating a linked tag resolves the entity set name first',
        created.calls().some((call) => call === 'getEntityMetadata("account")'),
        created.calls().join(' '),
    );

    const createCall = created.calls().find((call) => call.startsWith('createRecord'));

    check(
        'and binds through the plural set name, not the logical name',
        Boolean(createCall) && createCall.includes('/accounts(acc-1)'),
        createCall || 'no createRecord',
    );

    check(
        'writing the label to the column the maker named',
        Boolean(createCall) && createCall.includes('new_tagname'),
        createCall || 'no createRecord',
    );

    check('and refreshes afterwards', created.calls().some((call) => call === 'refresh'));

    /*
     * Where linking is impossible the tag is still created, unlinked, rather
     * than the interaction failing. `contextInfo` is absent on canvas and in the
     * hub's own demo harness, so this is the path the published demo takes.
     */
    const unlinked = bind({ host: 'canvas' });

    unlinked.props().onCreateTag('Floating');
    await flush();

    const unlinkedCall = unlinked.calls().find((call) => call.startsWith('createRecord'));

    check(
        'a host with no contextInfo still creates the tag, unlinked',
        Boolean(unlinkedCall) && !unlinkedCall.includes('@odata.bind'),
        unlinkedCall || 'no createRecord',
    );

    check(
        'and does not go looking for metadata it cannot use',
        !unlinked.calls().some((call) => call.startsWith('getEntityMetadata')),
        unlinked.calls().join(' '),
    );

    const noLookup = bind({ parentLookupField: null });

    noLookup.props().onCreateTag('Unbound');
    await flush();

    check(
        'an unbound parentLookupField is the same story',
        Boolean(noLookup.calls().find((call) => call.startsWith('createRecord')))
            && !noLookup.calls().find((call) => call.startsWith('createRecord')).includes('@odata.bind'),
    );

    /*
     * `getEntityMetadata` is typed as always present and is not. The control
     * guards it with a `typeof` check, which is only meaningful if a host
     * without it exists — so here is one.
     */
    const noMetadata = bind({ hasEntityMetadata: false });

    noMetadata.props().onCreateTag('No metadata here');
    await flush();

    check(
        'a host without getEntityMetadata creates unlinked rather than throwing',
        Boolean(noMetadata.calls().find((call) => call.startsWith('createRecord'))),
        noMetadata.calls().join(' '),
    );

    /* --------------------------------------------------- what destroy owes */

    /*
     * **Keep this when the rest of the file changes.** Both numbers are zero
     * today — the control's own `destroy` says so in a comment, and this turns
     * that comment into something that fails if it stops being true.
     */
    disposeAll();

    const timersBefore = time.pending();
    const listeners = () => Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0);
    const listenersBefore = listeners();

    bind({}).destroy();

    check('destroy() releases every timer the control took', time.pending() === timersBefore, `${timersBefore} → ${time.pending()}`);

    check('and every document-level listener', listeners() === listenersBefore, `${listenersBefore} → ${listeners()}`);

    disposeAll();

    report();
})();

function report() {
    const failed = results.filter((result) => !result.ok);

    for (const result of results) {
        const detail = result.detail ? `  — ${result.detail}` : '';

        console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.label}${detail}`);
    }

    console.log(
        failed.length > 0
            ? `\n  ${failed.length} of ${results.length} failed\n`
            : `\n  ${results.length} passed — the control's own decisions only; see SPEC.md for what a real view still has to confirm\n`,
    );

    process.exit(failed.length > 0 ? 1 : 0);
}
