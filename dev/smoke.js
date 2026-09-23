/*
 * Drives the real built bundle outside a browser.
 *
 *     npm run lint && npm run build && npm run smoke
 *
 * A **virtual dataset** control that writes to Dataverse, so both halves are
 * asserted: what it renders (through `react-dom/server`, against the English
 * strings from the shipped `.resx`) and what it asked the platform to do
 * (the rig's call log, and the rig's own link table).
 *
 * The questions worth pinning, in the order a regression would hurt:
 *
 *   - **Removing a tag never deletes one.** 0.2.x called `deleteRecord` on a
 *     native many-to-many subgrid and deleted the tag from every record that
 *     had it. Asserted by the absence of the call, not just the presence of
 *     the right one.
 *   - **The binding is read, not guessed.** The fixture is the probe's
 *     environment — an N:N *and* a 1:N between the same two tables — so a
 *     control that picked one silently fails here.
 *   - **A failed request becomes a sentence, never an unhandled rejection.**
 *     0.2.x's first run of this suite ended the Node process; this one fails
 *     an assertion instead, from a listener installed below.
 *
 * **What passing here does NOT mean.** Every answer comes from `dev/host.js`
 * and `dev/fixture.js`. The `$ref` shapes it models were measured on one real
 * form (SPEC.md P1–P4); a one-to-many subgrid, a junction table's view, Browse
 * and the rendered stylesheet were not. Those are in SPEC.md under
 * "Not verified", and `npm run harness` is where the UI is looked at.
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
const React = require(path.join(root, 'node_modules', 'react'));
const ReactDOMServer = require(path.join(root, 'node_modules', 'react-dom', 'server'));

[...new Set(source.match(/\bReactv[\w]*\b/g) || [])].forEach((name) => {
    global[name] = React;
});

vm.runInThisContext(source, { filename: 'bundle.js' });

/*
 * **An unhandled rejection is a failure, not a crash.** 0.2.x chained
 * `.finally()` with no `.catch()`, and the first run of the old suite simply
 * died. Counted here and asserted at the end, so the suite says which test
 * leaked one instead of stopping.
 */
const leaked = [];

process.on('unhandledRejection', (reason) => {
    leaked.push(String(reason && reason.message ? reason.message : reason));
});

/* ---------------------------------------------------------------- strings */

/** The shipped English strings, so a rendered sentence is the one a user reads. */
const ENGLISH = (() => {
    const xml = fs.readFileSync(path.join(root, 'TagList', 'strings', 'TagList.1033.resx'), 'utf8');
    const strings = {};

    for (const match of xml.matchAll(/<data name="([^"]+)"[^>]*>\s*<value>([^<]*)<\/value>/g)) {
        strings[match[1]] = match[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    }

    return strings;
})();

const english = (key) => (ENGLISH[key] !== undefined ? ENGLISH[key] : `resx:${key}`);

/* ---------------------------------------------------------------- harness */

const results = [];

function check(label, ok, detail) {
    results.push({ ok: Boolean(ok), label, detail });
}

const live = [];

function disposeAll() {
    while (live.length > 0) {
        live.pop().destroy();
    }
}

/** A native many-to-many subgrid on the probe's account — the case 0.3.0 exists for. */
const N2N_SUBGRID = {
    contextInfo: { entityTypeName: 'account', entityId: `{${fixture.PARENT.toUpperCase()}}`, entityRecordName: 'Adventure Works (sample)' },
    manyToManyFilter: { relationship: fixture.N2N, id: fixture.PARENT },
};

/** A one-to-many subgrid on the same account: tags whose `cll_account` points at it. */
const LOOKUP_SUBGRID = {
    contextInfo: N2N_SUBGRID.contextInfo,
    relationshipFilter: { column: 'cll_account', id: fixture.PARENT },
};

const INPUTS = { allowCreate: true, allowNewTags: true, maxVisible: 12, primaryNameField: null, parentLookupField: null, relationshipName: null, sampleData: null };

/*
 * The hub's demo, as far as this control can tell: no record, no organisation
 * URL, a Web API that rejects every call and a lookup dialog that resolves
 * `[]` (read from the hub's harness source, 2026-09-23). The presets are the
 * ones pcfhub.json ships, so what is asserted below is what a visitor gets.
 */
const HUB = { page: false, webApiFails: true, lookupPick: null };
const HUB_PRESETS = JSON.parse(fs.readFileSync(path.join(root, 'pcfhub.json'), 'utf8')).demo.presets;
const preset = (slug) => HUB_PRESETS.find((entry) => entry.slug === slug);
const bindPreset = (slug) => bind({ ...HUB, inputs: preset(slug).props });

/**
 * Bind a fresh control to a fresh view and render until it settles.
 * `inputs` merge over the maker defaults above.
 */
function bind(options = {}) {
    const handle = host.createHost(fixture, {
        datasetName: 'tags',
        getString: english,
        ...options,
        inputs: { ...INPUTS, ...(options.inputs || {}) },
    });
    const container = dom.createElement('div');
    const instance = new registration.ctor();

    let notifications = 0;

    instance.init(handle.context, () => (notifications += 1), {}, container);

    let driven = host.drive(instance, handle, 10);

    const view = {
        instance,
        handle,
        get driven() {
            return driven;
        },
        props: () => (driven.element && driven.element.props) || {},
        service: () => view.props().service,
        dataset: () => view.props().dataset,
        ids: () => view.props().dataset.sortedRecordIds.slice(),
        outputs: () => instance.getOutputs(),
        notifications: () => notifications,
        calls: () => handle.state.calls,
        callsSince: (mark) => handle.state.calls.slice(mark),
        html: () => ReactDOMServer.renderToStaticMarkup(driven.element),
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

/** Resolve the binding, then render once more so the component starts from it. */
async function ready(view) {
    const resolved = await view.service().resolve();

    view.settle();

    return resolved;
}

const linked = (handle, a, b) =>
    handle.links().some((link) => link.relationship === fixture.N2N && link.ids.includes(a) && link.ids.includes(b));

const count = (html, needle) => html.split(needle).length - 1;

check('bundle registered a control', typeof registration.ctor === 'function');

if (typeof registration.ctor !== 'function') {
    report();
}

(async () => {
    /* ------------------------------------------------ what it hands down */

    const plain = bind(N2N_SUBGRID);

    check('settles instead of refreshing forever', plain.driven.looping === false, `${plain.driven.passes} passes`);
    check('returns an element rather than writing into a container', plain.driven.element !== undefined);
    check(
        'passes the maker inputs through',
        plain.props().allowCreate === true && plain.props().allowNewTags === true && plain.props().maxVisible === 12,
    );
    check('and reads an unset allowNewTags as on, the way its default says', bind({ ...N2N_SUBGRID, inputs: { allowNewTags: null } }).props().allowNewTags === true);
    check('and the form read-only state', bind({ ...N2N_SUBGRID, disabled: true }).props().disabled === true);
    check('Browse is offered where the platform has lookupObjects', plain.props().canBrowse === true);
    check('and not where it has not', bind({ ...N2N_SUBGRID, lookupObjects: false }).props().canBrowse === false);

    /* --------------------------------------------- roles, not column names */

    const labelColumn = fixture.columns.find((column) => column.alias === 'labelField');

    check(
        'the fixture keeps alias and name different, or nothing below proves anything',
        labelColumn.alias !== labelColumn.name,
        `alias: ${labelColumn.alias}, name: ${labelColumn.name}`,
    );

    const firstId = plain.ids()[0];

    check(
        'a record reads its label through the column name behind the role',
        plain.dataset().records[firstId].getFormattedValue(labelColumn.name) === 'Feature',
        plain.dataset().records[firstId].getFormattedValue(labelColumn.name),
    );

    /* ----------------------------------------------------------- opening */

    plain.props().onOpenTag(firstId);

    check('opening a tag reports it through the output property', plain.outputs().selectedTagId === firstId);
    check('and asks the platform to navigate', plain.calls().some((call) => call.startsWith('openDatasetItem')), plain.calls().join(' '));

    /* ------------------------------------------ the binding, from metadata */

    /*
     * The probe's environment: one N:N and one lookup between account and
     * cll_tag. Nothing a subgrid hands over says which one it is showing.
     */
    const unnamed = bind(N2N_SUBGRID);
    const ambiguous = await ready(unnamed);

    check(
        'two relationships between the tables resolve as ambiguous, not as a guess',
        ambiguous.binding.kind === 'ambiguous'
            && ambiguous.binding.candidates.includes(fixture.N2N)
            && ambiguous.binding.candidates.includes('cll_Account_Account_cll_Tag'),
        JSON.stringify(ambiguous.binding),
    );

    const ambiguousHtml = unnamed.html();

    check(
        'and the maker is told which names to choose from',
        ambiguousHtml.includes(fixture.N2N) && ambiguousHtml.includes('Set Relationship name'),
        ambiguousHtml.slice(0, 300),
    );
    check('with no add box offered', !ambiguousHtml.includes('role="combobox"'));
    check('and no remove button, since removing would act on a guess', count(ambiguousHtml, 'TagList-chip-remove') === 0);

    const named = bind({ ...N2N_SUBGRID, inputs: { relationshipName: fixture.N2N } });
    const n2n = await ready(named);

    check(
        'a named N:N links from the parent side, with the navigation property the metadata gives',
        n2n.binding.kind === 'manyToMany' && n2n.binding.navigation === fixture.N2N && n2n.parentSet === 'accounts',
        JSON.stringify(n2n),
    );
    check('matching the name case-insensitively', (await ready(bind({ ...N2N_SUBGRID, inputs: { relationshipName: fixture.N2N.toLowerCase() } }))).binding.kind === 'manyToMany');
    check(
        'and reading the relationships through one same-origin fetch each',
        named.calls().filter((call) => call.includes('ManyToManyRelationships')).length === 1
            && named.calls().filter((call) => call.includes('ManyToOneRelationships')).length === 1,
        named.calls().filter((call) => call.startsWith('fetch')).join(' '),
    );

    const byColumn = await ready(bind({ ...LOOKUP_SUBGRID, inputs: { relationshipName: 'cll_account' } }));

    check(
        'a lookup can be named by its column, and binds through its navigation property',
        byColumn.binding.kind === 'oneToMany' && byColumn.binding.column === 'cll_account' && byColumn.binding.navigation === 'cll_Account',
        JSON.stringify(byColumn.binding),
    );

    const onlyLookup = await ready(bind(LOOKUP_SUBGRID));

    check('the probe tables stay ambiguous from a lookup subgrid too', onlyLookup.binding.kind === 'ambiguous', onlyLookup.binding.kind);

    const soleLookup = bindWith({ ...fixture, manyToMany: [] }, LOOKUP_SUBGRID);
    const sole = await ready(soleLookup);

    check('with only one relationship there is nothing to name', sole.binding.kind === 'oneToMany', JSON.stringify(sole.binding));

    const noParent = bind({ inputs: { relationshipName: fixture.N2N } });
    const unsaved = await ready(noParent);

    check('no contextInfo is an unsaved record or not a form', unsaved.binding.kind === 'unknown' && unsaved.binding.reason === 'noParent');
    check('and says to save, rather than offering an add box that cannot work', noParent.html().includes(english('TagList_NoticeNoParent')) && !noParent.html().includes('role="combobox"'));

    const refused = await ready(bind({ ...N2N_SUBGRID, inputs: { relationshipName: fixture.N2N }, quirks: { relationshipsStatus: 403 } }));

    check('refused metadata leaves the tags readable and unchangeable', refused.binding.kind === 'unknown' && refused.binding.reason === 'noMetadata', JSON.stringify(refused.binding));

    const typo = await ready(bind({ ...N2N_SUBGRID, inputs: { relationshipName: 'cll_nothing' } }));

    check('a relationship name that matches nothing is said, not ignored', typo.binding.kind === 'unknown' && typo.binding.reason === 'unmatchedName');

    const selfRelated = await ready(
        bindWith(
            { ...fixture, manyToMany: [{ schemaName: 'cll_tag_tag', entity1: 'cll_tag', entity2: 'cll_tag', nav1: 'a', nav2: 'b' }], relationships: [] },
            { contextInfo: { entityTypeName: 'cll_tag', entityId: fixture.guid(1) } },
        ),
    );

    check('a table related to itself is refused rather than linked the wrong way round', selfRelated.binding.kind === 'unknown' && selfRelated.binding.reason === 'selfReferential');

    const junction = await ready(
        bindWith(
            { ...fixture, columns: fixture.columns.map((column) => (column.alias === 'labelField' ? { ...column, name: 'tag.cll_tagname' } : column)) },
            N2N_SUBGRID,
        ),
    );

    check('a label read through a linked table marks a view of link rows', junction.binding.kind === 'linkRows');

    /* ------------------------------------------------------- rendering */

    const html = named.html();

    check('renders the loaded chips, up to maxVisible', count(html, 'class="TagList-chip"') === named.ids().length, `${count(html, 'class="TagList-chip"')} chips, ${named.ids().length} loaded`);
    check('each with a remove button named for its tag', html.includes('aria-label="Remove Feature"') && count(html, 'TagList-chip-remove') === named.ids().length);
    check('and a combobox to add with', html.includes('role="combobox"') && html.includes('aria-expanded="false"'));
    check('with Browse inside the same field surface', /TagList-field[^>]*>.*TagList-browse/.test(html));

    const unloaded = fixture.links.length - named.ids().length;

    check(
        'counts the tags on pages not loaded yet, from totalResultCount',
        html.includes(english('TagList_MoreButton').replace('{0}', String(unloaded))),
        `expected "${english('TagList_MoreButton').replace('{0}', String(unloaded))}"`,
    );
    check('a colour tints the chip edge through a custom property', html.includes('--taglist-chip-accent:#7C3AED'));
    check('an empty colour is no colour, not an empty declaration', !html.includes('chip-accent:;') && count(html, 'chip-accent:') === count(html, 'chip-accent:#'));

    const lockedHtml = bindReady({ ...N2N_SUBGRID, inputs: { relationshipName: fixture.N2N }, disabled: true });
    const offHtml = bindReady({ ...N2N_SUBGRID, inputs: { relationshipName: fixture.N2N, allowCreate: false } });

    const [locked, off] = await Promise.all([lockedHtml, offHtml]);

    check('a read-only form shows chips with no remove and no add box', count(locked, 'TagList-chip-remove') === 0 && !locked.includes('role="combobox"'));
    check('and says nothing about relationships, since there is nothing to configure', !locked.includes('TagList-notice'));
    check('allowCreate off hides the add box, as it did in 0.2.x', !off.includes('role="combobox"'));
    check('but keeps removal, as it did in 0.2.x', count(off, 'TagList-chip-remove') > 0);

    const darkHtml = await bindReady({ ...N2N_SUBGRID, inputs: { relationshipName: fixture.N2N }, dark: true });
    const noThemeHtml = await bindReady({ ...N2N_SUBGRID, inputs: { relationshipName: fixture.N2N } });

    check('a dark host theme adds the dark class', darkHtml.includes('class="TagList TagList--dark'));
    check('and a host that publishes no theme gets the light fallbacks, not a guess', !noThemeHtml.includes('TagList--dark'));

    /* ----------------------------------------------------- many-to-many */

    /*
     * **The assertion 0.3.0 exists for.** Removing sends a `$ref` DELETE from
     * the parent's side, and never `deleteRecord` — which on this subgrid
     * deleted the tag itself in 0.2.x.
     */
    const removing = bind({ ...N2N_SUBGRID, inputs: { relationshipName: fixture.N2N } });

    await ready(removing);

    const victim = removing.ids()[1];
    const mark = removing.calls().length;
    const removed = await removing.service().remove(victim, 'Bug', { title: 't', text: 't' });
    const removeCalls = removing.callsSince(mark);

    check(
        'removing sends DELETE $ref from the parent, through the relationship',
        removeCalls.some((call) => call.includes(`DELETE /api/data/v9.2/accounts(${fixture.PARENT})/${fixture.N2N}(${victim})/$ref`)),
        removeCalls.join(' '),
    );
    check('and never deletes a record', !removing.calls().some((call) => call.startsWith('webAPI.deleteRecord')), removing.calls().filter((c) => c.includes('delete')).join(' '));
    check(
        'the link is gone and the tag is not',
        removed === true && !linked(removing.handle, fixture.PARENT, victim) && removing.handle.stored(victim, 'cll_tagname') === 'Bug',
        `stored: ${removing.handle.stored(victim, 'cll_tagname')}`,
    );
    check('and the view refreshes to show it', removeCalls.includes('refresh') && !removing.ids().includes(victim));

    const searching = bind({ ...N2N_SUBGRID, inputs: { relationshipName: fixture.N2N } });

    await ready(searching);

    const beforeSearch = searching.calls().length;
    const found = await searching.service().search('a');
    const query = searching.callsSince(beforeSearch).find((call) => call.startsWith('webAPI.retrieveMultipleRecords')) || '';

    check('a search asks the server, not the loaded rows', query.includes('cll_tag') && decodeURIComponent(query).includes("contains(cll_tagname,'a')"), query);
    check('sorted by name and capped', query.includes('$orderby=cll_tagname') && /\$top=\d+/.test(query));
    check(
        'finds tags on no record yet',
        ['Power Apps', 'Dataverse', 'Black'].every((name) => found.some((tag) => tag.name === name)),
        found.map((tag) => tag.name).join(', '),
    );
    check(
        'and leaves out the ones already showing as chips',
        !found.some((tag) => searching.ids().includes(tag.id)),
        found.map((tag) => tag.name).join(', '),
    );

    /*
     * Found in the harness, not by this suite: with five chips loaded of
     * fourteen, a search offered "Accessibility" — linked, on page two. The
     * record's whole link set is read through the parent's navigation
     * property, once, and kept out of the suggestions.
     */
    check(
        'and leaves out tags linked on pages not loaded yet',
        !found.some((tag) => ['Accessibility', 'Backlog', 'Performance'].includes(tag.name)),
        found.map((tag) => tag.name).join(', '),
    );

    await searching.service().search('e');

    check(
        'reading the link set once, not once per search',
        searching.calls().filter((call) => call.includes(`GET /api/data/v9.2/accounts(${fixture.PARENT})/${fixture.N2N}?`)).length === 1,
        searching.calls().filter((call) => call.startsWith('fetch("GET')).join(' '),
    );

    const quoted = await searching.service().search("o'b").catch((error) => [{ name: `rejected: ${error.message}` }]);

    check("escapes a quote as '' so the filter parses", quoted.length === 1 && quoted[0].name === "O'Brien", JSON.stringify(quoted));
    check('an empty term asks nothing', (await searching.service().search('   ')).length === 0);

    const dataverse = found.find((tag) => tag.name === 'Dataverse');
    const beforeAttach = searching.calls().length;

    await searching.service().attach(dataverse);

    const attachCall = searching.callsSince(beforeAttach).find((call) => call.includes('POST')) || '';

    check('attaching POSTs $ref from the parent side', attachCall.includes(`POST /api/data/v9.2/accounts(${fixture.PARENT})/${fixture.N2N}/$ref`), attachCall);
    check('and the link lands in the relationship', linked(searching.handle, fixture.PARENT, dataverse.id));

    const beforeCreate = searching.calls().length;

    await searching.service().create('Renewal risk');

    const createCalls = searching.callsSince(beforeCreate);
    const createRecord = createCalls.find((call) => call.startsWith('webAPI.createRecord')) || '';
    const createdRow = searching.handle.state.created[searching.handle.state.created.length - 1];

    check('creating writes the name to the primary name column from metadata', createRecord.includes('"cll_tagname":"Renewal risk"'), createRecord);
    check('with no lookup bind under a many-to-many', !createRecord.includes('@odata.bind'), createRecord);
    check('and refreshes, so the new chip arrives with the next fetch', createCalls.lastIndexOf('refresh') > createCalls.findIndex((call) => call.startsWith('webAPI.createRecord')), createCalls.join(' '));
    check(
        'then links the new tag',
        createdRow && linked(searching.handle, fixture.PARENT, String(createdRow.id).toLowerCase()),
        createCalls.join(' '),
    );

    const picking = bind({ ...N2N_SUBGRID, inputs: { relationshipName: fixture.N2N }, lookupPick: { id: fixture.guid(15), entityType: 'cll_tag', name: 'Power Apps' } });

    await ready(picking);

    const picked = await picking.service().browse();
    const pickCall = picking.calls().find((call) => call.startsWith('utils.lookupObjects')) || '';

    check('Browse opens the platform lookup, multi-select, on the tag table', pickCall.includes('"allowMultiSelect":true') && pickCall.includes('cll_tag'), pickCall);
    check('and links what was picked, braced and upper-cased as the platform hands it', picked === 1 && linked(picking.handle, fixture.PARENT, fixture.guid(15)));
    check('with no typed term, the dialog opens on no search term at all', !pickCall.includes('searchText'), pickCall);

    /*
     * Found testing on the form, 2026-09-23: type "pow", press Browse, and the
     * dialog opened blank. lookupObjects takes searchText (Unified Interface
     * only, per its reference), so what is in the box carries into the dialog.
     */
    const carrying = bind({ ...N2N_SUBGRID, inputs: { relationshipName: fixture.N2N } });

    await ready(carrying);
    await carrying.service().browse('  pow ');

    const carried = carrying.calls().find((call) => call.startsWith('utils.lookupObjects')) || '';

    check('Browse opens the dialog on what was typed, trimmed', carried.includes('"searchText":"pow"'), carried);

    const cancelling = bind({ ...N2N_SUBGRID, inputs: { relationshipName: fixture.N2N } });

    await ready(cancelling);

    const cancelMark = cancelling.calls().length;

    check('a cancelled Browse is a resolve with nothing, and asks nothing more', (await cancelling.service().browse()) === 0 && !cancelling.callsSince(cancelMark).some((call) => call.includes('$ref')));

    /* ------------------------------------------------------- one-to-many */

    const lookup = bind({ ...LOOKUP_SUBGRID, inputs: { relationshipName: 'cll_account' } });

    await ready(lookup);

    check('a lookup subgrid shows the tags that point at the record', lookup.ids().length === 2, lookup.ids().join(','));

    const lookupVictim = lookup.ids()[1];

    await lookup.service().remove(lookupVictim, 'Bug', { title: 't', text: 't' });

    const clear = lookup.calls().find((call) => call.startsWith('webAPI.updateRecord')) || '';

    check('removing clears the lookup with a null bind', clear.includes('"cll_Account@odata.bind":null'), clear);
    check('and still never deletes', !lookup.calls().some((call) => call.startsWith('webAPI.deleteRecord')));

    lookup.handle.reread();
    lookup.dataset().refresh();

    check('the tag leaves the subgrid once the write is read back', !lookup.ids().includes(lookupVictim), lookup.ids().join(','));

    const lookupFound = await lookup.service().search('e');
    const lookupQuery = decodeURIComponent(lookup.calls().filter((call) => call.startsWith('webAPI.retrieveMultipleRecords')).pop() || '');

    check('a lookup search asks only for tags nobody owns', lookupQuery.includes('_cll_account_value eq null'), lookupQuery);
    check('so a tag owned by another record is never offered', !lookupFound.some((tag) => tag.name === 'Taken elsewhere'), lookupFound.map((t) => t.name).join(', '));

    await lookup.service().attach({ id: fixture.guid(16), name: 'Dataverse' });

    const bindCall = lookup.calls().filter((call) => call.startsWith('webAPI.updateRecord')).pop() || '';

    check('attaching binds the lookup to the record through its entity set', bindCall.includes(`"cll_Account@odata.bind":"/accounts(${fixture.PARENT})"`), bindCall);

    await lookup.service().create('Owned from birth');

    const lookupCreate = lookup.calls().filter((call) => call.startsWith('webAPI.createRecord')).pop() || '';

    check('creating binds in the same request', lookupCreate.includes(`"cll_Account@odata.bind":"/accounts(${fixture.PARENT})"`) && lookupCreate.includes('Owned from birth'), lookupCreate);

    /* --------------------------------------------------------- link rows */

    const junctionFixture = { ...fixture, columns: fixture.columns.map((column) => (column.alias === 'labelField' ? { ...column, name: 'tag.cll_tagname' } : column)) };
    const rows = bindWith(junctionFixture, { ...N2N_SUBGRID, dialogs: 'cancelled' });

    await ready(rows);

    const kept = await rows.service().remove(rows.ids()[0], 'Feature', { title: english('TagList_ConfirmTitle'), text: 'Remove Feature?' });

    check('a link row is deleted only after the platform confirm', rows.calls().some((call) => call.startsWith('navigation.openConfirmDialog')));
    check('and a cancel — which resolves — deletes nothing', kept === false && !rows.calls().some((call) => call.startsWith('webAPI.deleteRecord')));

    const confirmed = bindWith(junctionFixture, { ...N2N_SUBGRID, dialogs: 'confirmed' });

    await ready(confirmed);

    const doomed = confirmed.ids()[0];

    await confirmed.service().remove(doomed, 'Feature', { title: 't', text: 't' });

    check('a confirmed removal deletes that row', confirmed.calls().some((call) => call.startsWith('webAPI.deleteRecord') && call.includes(doomed)), confirmed.calls().filter((c) => c.includes('delete')).join(' '));

    /* --------------------------------------------------------- refusals */

    const forbidden = bind({ ...N2N_SUBGRID, inputs: { relationshipName: fixture.N2N }, quirks: { refStatus: 403 } });

    await ready(forbidden);

    const refusal = await forbidden.service().remove(forbidden.ids()[0], 'Feature', { title: 't', text: 't' }).then(() => null, (error) => error);

    check('a refused unlink rejects with an Error', refusal instanceof Error, String(refusal));
    check("carrying the server's own sentence", refusal && /privilege/i.test(refusal.message), refusal && refusal.message);
    check('and leaves the link in place', linked(forbidden.handle, fixture.PARENT, forbidden.ids()[0]));

    const offline = bind({ ...N2N_SUBGRID, inputs: { relationshipName: fixture.N2N }, quirks: { refStatus: 0 } });

    await ready(offline);

    const lost = await offline.service().attach({ id: fixture.guid(17), name: "O'Brien" }).then(() => null, (error) => error);

    check('an offline host rejects too, as a sentence', lost instanceof Error && lost.message !== '', lost && lost.message);

    const failing = bind({ ...N2N_SUBGRID, inputs: { relationshipName: fixture.N2N }, webApiFails: true });

    await ready(failing);

    const searchFault = await failing.service().search('a').then(() => null, (error) => error);

    check('a refused search turns the platform\'s plain-object rejection into an Error', searchFault instanceof Error && searchFault.message === 'The records could not be retrieved.', searchFault && searchFault.message);

    /* ------------------------------------------- the sample route (the demo) */

    // One block, so the names below cannot collide with the live route's.
    {
        {
            const inputs = [...fs.readFileSync(path.join(root, 'TagList', 'ControlManifest.Input.xml'), 'utf8').matchAll(/<property name="(\w+)"[^>]*usage="input"/g)].map(
                (match) => match[1],
            );
            const missing = HUB_PRESETS.map((entry) => [entry.slug, inputs.filter((name) => !Object.hasOwn(entry.props, name))]).filter(([, names]) => names.length > 0);

            // The harness hands a default-value over as its XML string, so an unset TwoOptions "false" arrives true.
            check('every hub preset sets every input', inputs.length > 0 && missing.length === 0, JSON.stringify(missing));
        }

        for (const entry of HUB_PRESETS) {
            const view = bindPreset(entry.slug);
            const resolved = await ready(view);

            check(`preset "${entry.slug}" is a document the parser reads`, !(resolved.binding.kind === 'unknown' && resolved.binding.reason === 'badSample'), resolved.binding.kind);
        }

        const demo = bindPreset('default');

        await ready(demo);

        const sampleDoc = JSON.parse(preset('default').props.sampleData);
        const nameOf = (id) => sampleDoc.tags.find((tag) => tag.id === id).name;
        const shown = () => demo.service().listing(demo.dataset()).chips.map((chip) => chip.label);

        check("the demo draws the sample's chips, not the view's rows", shown().join('|') === sampleDoc.linked.map(nameOf).join('|'), shown().join('|'));
        check('in the markup, with their colours', demo.html().includes('>Priority<') && demo.html().includes('--taglist-chip-accent:#DC2626'), demo.html().slice(0, 300));
        check('offers the add box and a remove per chip', demo.html().includes('role="combobox"') && count(demo.html(), 'TagList-chip-remove"') === sampleDoc.linked.length);
        check('and no Browse, whose dialog the demo answers with []', demo.props().canBrowse === false);
        check('says nothing about a missing record', !demo.html().includes(english('TagList_NoticeNoParent')));

        const sampleFound = await demo.service().search('re');

        check(
            "a search follows the live rules: contains, any case, by name, the record's own left out",
            sampleFound.map((tag) => tag.name).join('|') === 'Healthcare|Referral|Retail',
            sampleFound.map((tag) => tag.name).join('|'),
        );

        await demo.service().attach(sampleFound.find((tag) => tag.name === 'Referral'));
        demo.settle();

        check('linking a found tag adds its chip', shown().includes('Referral') && demo.html().includes('>Referral<'), shown().join('|'));
        check('and takes it out of the next search', !(await demo.service().search('refer')).some((tag) => tag.name === 'Referral'));

        await demo.service().create('Trade show 2026');
        demo.settle();

        check('creating adds a tag and links it', shown().includes('Trade show 2026'));

        const removed = await demo.service().remove('t1', 'Priority', { title: 't', text: 't' });

        demo.settle();

        check('unlinking removes the chip', removed === true && !shown().includes('Priority'), shown().join('|'));
        check('and keeps the tag, so a search finds it again', (await demo.service().search('prio')).some((tag) => tag.name === 'Priority'));

        demo.settle();
        check('the links survive a re-render with the same document', shown().includes('Referral') && shown().includes('Trade show 2026'));

        demo.props().onOpenTag('t2');

        check('opening a sample chip reports it through the output', demo.outputs().selectedTagId === 't2');
        check(
            'and the whole sample route asks the platform for nothing — no Web API, no fetch, no refresh, no navigation',
            !demo.calls().some((call) => /^(webAPI\.|fetch|refresh|openDatasetItem|utils\.lookupObjects)/.test(call)),
            demo.calls().join(' '),
        );

        demo.handle.setInput('sampleData', preset('many-tags').props.sampleData);
        demo.settle();
        await ready(demo);

        check(
            'a new document — a preset switch — starts from its own links',
            !shown().includes('Trade show 2026') && shown().includes('Priority') && shown().length === JSON.parse(preset('many-tags').props.sampleData).linked.length,
            shown().join('|'),
        );

        // The hub keeps the control mounted across a preset switch; a new key is what drops the last preset's error line.
        check('and remounts the component, so no error or typed text carries over', demo.driven.element.key === preset('many-tags').props.sampleData.trim());

        const crowded = bindPreset('many-tags');

        await ready(crowded);
        check('more tags than Max visible collapse into +N more', crowded.html().includes(english('TagList_MoreButton').replace('{0}', '9')), crowded.html().slice(-400));

        const owned = bindPreset('one-to-many');

        await ready(owned);

        const ownedFound = (await owned.service().search('a')).map((tag) => tag.name);

        check('one-to-many leaves out tags another record owns', ownedFound.length > 0 && !ownedFound.some((name) => ['EMEA', 'APAC', 'Americas'].includes(name)), ownedFound.join('|'));

        const refused = bindPreset('refused');

        await ready(refused);

        const refusedWith = await refused.service().remove('t1', 'Priority', { title: 't', text: 't' }).then(() => null, (error) => error);

        check("a refused unlink rejects with the sample's sentence", refusedWith instanceof Error && /prvAppendTo/.test(refusedWith.message), String(refusedWith));
        check('and the chip stays', refused.service().listing(refused.dataset()).chips.some((chip) => chip.label === 'Priority'));

        const torn = bindPreset('ambiguous');

        await ready(torn);
        check(
            "an ambiguous sample shows the maker's notice with the names, and no add box or removes",
            torn.html().includes('cll_Account_cll_Tag_cll_Tag, cll_account_cll_tag') && !torn.html().includes('role="combobox"') && !torn.html().includes('TagList-chip-remove"'),
            torn.html(),
        );

        for (const [label, text] of [
            ['text that is not JSON', '{ tags: nope'],
            ['JSON without a tag table', '{"linked":["t1"]}'],
            ['a binding the control does not know', '{"binding":"sideways","tags":[]}'],
        ]) {
            const broken = bind({ ...HUB, inputs: { sampleData: text } });
            const result = await ready(broken);

            check(
                `${label} is the named state, not a blank control or a throw`,
                result.binding.kind === 'unknown' && result.binding.reason === 'badSample' && broken.html().includes(english('TagList_NoticeSample')),
                result.binding.kind,
            );
        }

        const blank = bind({ ...N2N_SUBGRID, inputs: { relationshipName: fixture.N2N, sampleData: '   ' } });

        await ready(blank);
        check(
            'a blank sampleData on a form is the live route, untouched — and the component key never moves',
            blank.service().isSample() === false && blank.props().canBrowse === true && blank.ids().length > 0 && blank.driven.element.key === '',
        );
    }

    /* --------------------------------------------------- what destroy owes */

    disposeAll();

    const timersBefore = time.pending();
    const listeners = () => Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0);
    const listenersBefore = listeners();

    bind(N2N_SUBGRID).destroy();

    check('destroy() releases every timer the control took', time.pending() === timersBefore, `${timersBefore} → ${time.pending()}`);
    check('and every document-level listener', listeners() === listenersBefore, `${listenersBefore} → ${listeners()}`);

    disposeAll();

    await new Promise((resolve) => setImmediate(resolve));

    check('no request anywhere above ended as an unhandled rejection', leaked.length === 0, leaked.join(' | '));

    report();
})().catch((error) => {
    check('the suite itself ran to the end', false, error && error.stack);
    report();
});

/** A host over a variant of the fixture — the binding cases need tables the default does not have. */
function bindWith(variant, options) {
    const handle = host.createHost(variant, { datasetName: 'tags', getString: english, ...options, inputs: { ...INPUTS, ...((options && options.inputs) || {}) } });
    const container = dom.createElement('div');
    const instance = new registration.ctor();

    instance.init(handle.context, () => undefined, {}, container);

    let driven = host.drive(instance, handle, 10);

    const view = {
        handle,
        props: () => (driven.element && driven.element.props) || {},
        service: () => view.props().service,
        dataset: () => view.props().dataset,
        ids: () => view.props().dataset.sortedRecordIds.slice(),
        calls: () => handle.state.calls,
        html: () => ReactDOMServer.renderToStaticMarkup(driven.element),
        settle: () => {
            driven = host.drive(instance, handle, 10);
        },
        destroy: () => instance.destroy(),
    };

    live.push(view);

    return view;
}

/** Bind, resolve, and hand back the markup it then renders. */
async function bindReady(options) {
    const view = bind(options);

    await ready(view);

    return view.html();
}

function report() {
    const failed = results.filter((result) => !result.ok);

    for (const result of results) {
        const detail = result.detail && !result.ok ? `  — ${result.detail}` : '';

        console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.label}${detail}`);
    }

    console.log(
        failed.length > 0
            ? `\n  ${failed.length} of ${results.length} failed\n`
            : `\n  ${results.length} passed — the control's own decisions only; see SPEC.md for what a real view still has to confirm\n`,
    );

    process.exit(failed.length > 0 ? 1 : 0);
}
