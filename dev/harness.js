/*
 * The driver: wires the switches on `harness.html` to a real instance of the
 * control, and models the loop a dataset control actually lives in — mutate,
 * refresh, render again.
 *
 * Loaded before the control bundle, because the bundle registers itself the
 * moment it loads and needs somewhere to register. The page calls
 * `window.__harnessStart()` once the bundle has run.
 *
 * Read `harness.html` first — it says what this is for and what it is not.
 */

(function () {
    'use strict';

    var host = window.__pcfHost;
    var fixture = window.__pcfFixture;
    var registration = host.captureRegistration(window);

    /*
     * The page renders this control; on a form the platform would.
     *
     * A virtual control is never handed a container — `init` takes none, and
     * `updateView` returns an element for its caller to render. See
     * dev/virtual-bundle.js for how React gets onto the page at all, and
     * dev/fluent-stub.js for what stands in for Fluent while it is here.
     */
    var ReactDOM = window.__harnessReactDOM;

    var handle = null;
    var instance = null;
    var container = null;
    var lastInputs = {};

    /**
     * The input-property bag, as JSON.
     *
     * It is typed rather than picked from a list because the template cannot
     * know a control's own properties — and it exists at all because the rig
     * does not synthesise them: **a property with a manifest `default-value`
     * arrives here as `undefined` unless somebody puts it in this box.** A
     * control that reads `context.parameters.chartType.raw` therefore works on
     * a form and throws in the harness, which is a bug in the rig rather than a
     * reason to write a defensive `?.` in the control. Seed the manifest's own
     * defaults and the two hosts agree.
     *
     * Unparseable text keeps the last good bag rather than mounting against
     * `{}`, because a half-typed brace should not silently restyle the control.
     */
    function inputs() {
        var box = document.getElementById('harness-inputs');
        var parsed = null;

        try {
            parsed = JSON.parse(box.value || '{}');
        } catch (error) {
            parsed = null;
        }

        var usable = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);

        box.classList.toggle('is-bad', !usable);

        if (usable) {
            lastInputs = parsed;
        }

        return lastInputs;
    }

    /**
     * Tag List's own switches: which subgrid the control sits on, how a `$ref`
     * answers, and what Browse picks. `contextInfo` carries the parent the way
     * a form hands it over — braced and upper-case (measured, SPEC.md P1).
     */
    function subgrid() {
        var kind = document.getElementById('harness-subgrid').value;
        var info = { entityTypeName: 'account', entityId: '{' + fixture.PARENT.toUpperCase() + '}', entityRecordName: 'Adventure Works (sample)' };

        if (kind === 'none') {
            return { contextInfo: null, manyToManyFilter: { relationship: fixture.N2N, id: fixture.PARENT } };
        }

        return kind === 'lookup'
            ? { contextInfo: info, relationshipFilter: { column: 'cll_account', id: fixture.PARENT } }
            : { contextInfo: info, manyToManyFilter: { relationship: fixture.N2N, id: fixture.PARENT } };
    }

    function options() {
        var state = document.getElementById('harness-state').value;
        var where = subgrid();

        return {
            datasetName: 'tags',
            getString: function (key) {
                return strings && strings[key] !== undefined ? strings[key] : key;
            },
            contextInfo: where.contextInfo,
            manyToManyFilter: where.manyToManyFilter || null,
            relationshipFilter: where.relationshipFilter || null,
            lookupPick: document.getElementById('harness-pick').checked
                ? { id: fixture.guid(15), entityType: 'cll_tag', name: 'Power Apps' }
                : null,
            host: document.getElementById('harness-host').value,
            formFactor: document.getElementById('harness-formfactor').value,
            width: Number(document.getElementById('harness-width').value),
            pageSize: Number(document.getElementById('harness-pagesize').value) || 5,
            visible: document.getElementById('harness-visible').checked,
            disabled: document.getElementById('harness-disabled').checked,
            dark: document.getElementById('harness-dark').checked,
            rtl: document.getElementById('harness-rtl').checked,
            loading: state === 'loading',
            error: state === 'error',
            records: state === 'empty' ? [] : null,
            // "No columns chosen" is a real canvas state — the maker picked
            // none in the Items Fields flyout — and an empty table reads as a
            // broken control rather than as an unfinished configuration.
            columns: state === 'nocolumns' ? [] : null,
            inputs: inputs(),
            webAPI: document.getElementById('harness-webapi').checked,
            webApiFails: document.getElementById('harness-webapifails').checked,
            hasNavigation: document.getElementById('harness-navigation').checked,
            openFile: document.getElementById('harness-openfile').checked,
            dialogs: document.getElementById('harness-dialogs').value,
            quirks: {
                accumulatePages: document.getElementById('harness-accumulate').checked,
                previousPageStuck: document.getElementById('harness-stuck').checked,
                uncounted: document.getElementById('harness-uncounted').checked,
                hasLoadExactPage: document.getElementById('harness-exactpage').checked,
                sortingAbsent: document.getElementById('harness-nosorting').checked,
                filteringAbsent: document.getElementById('harness-nofiltering').checked,
                hasAddColumn: document.getElementById('harness-addcolumn').checked,
                hasFullScreen: document.getElementById('harness-fullscreen').checked,
                heightUnmeasured: document.getElementById('harness-noheight').checked,
                refStatus: Number(document.getElementById('harness-refstatus').value),
            },
        };
    }

    /**
     * Build a fresh platform and mount a fresh control on it.
     *
     * A new instance per switch change, because `init` runs once per control on
     * a real form — reusing one across a page-size change would be testing a
     * sequence the platform never produces. Paging and sorting *within* a
     * configuration are driven through the live instance, which is where the
     * sequence does matter — and so, since 2026-09-17, is a change to the
     * inputs box: see `applyInputs`.
     */
    function mount() {
        if (instance && instance.destroy) {
            instance.destroy();
        }

        /*
         * The form section a subgrid sits in, as far as a list below the field
         * is concerned: 0.3.0's absolutely positioned list was clipped out of
         * sight on a real Account form, and this page — no overflow, no
         * transform — showed it fine. Both switches reproduce what the page
         * could not.
         */
        var surface = document.getElementById('harness-surface');
        var clip = document.getElementById('harness-clip').checked;
        var trap = document.getElementById('harness-trap').checked;

        surface.style.overflow = clip ? 'hidden' : '';
        surface.style.maxHeight = clip ? '150px' : '';
        surface.style.transform = trap ? 'translateZ(0)' : '';

        /*
         * This page runs React 16, which hears every event at `document`, so a
         * React handler on a node moved to <body> fires here — and did not on
         * the real form, whose React delegates at the control's own container
         * (0.3.2, 2026-09-23: the options could not be clicked). Stopping
         * pointer events from the lifted layer before they reach `document`
         * is that host, as far as React can tell.
         */
        window.__tagListReact17 = document.getElementById('harness-react17').checked;

        if (!window.__tagListReact17Installed) {
            window.__tagListReact17Installed = true;
            ['mousedown', 'mouseover', 'click'].forEach(function (type) {
                document.body.addEventListener(type, function (event) {
                    if (window.__tagListReact17 && event.target instanceof Element && event.target.closest('.TagList-layer')) {
                        event.stopPropagation();
                    }
                });
            });
        }

        handle = host.createHost(fixture, options());
        container = document.getElementById('harness-root');

        // Not `innerHTML = ''`: React marks its container with an internal root
        // property, so emptying the children by hand leaves the next render
        // reconciling against nodes that are no longer in the document.
        ReactDOM.unmountComponentAtNode(container);

        instance = new registration.ctor();
        instance.init(handle.context, function () {});

        pump();
    }

    /**
     * Render until the control stops asking for more.
     *
     * `drive` reports how many passes that took, and the number is the
     * assertion: a settled control renders twice — once, then once more for the
     * page size it asked for — and one that keeps climbing has an unguarded
     * mutator in `updateView`. That is an infinite loop on a real form, where
     * it looks like a hang rather than like a count.
     */
    function pump() {
        var driven = host.drive(instance, handle, 10);

        // What the last pass returned. `drive` runs the loop; rendering the
        // result is the caller's job on this shape.
        ReactDOM.render(driven.element, container);
        var badge = document.getElementById('harness-passes');

        badge.textContent = driven.looping
            ? 'still refreshing after ' + driven.passes + ' passes — unguarded mutator'
            : driven.passes + ' render pass' + (driven.passes === 1 ? '' : 'es');
        badge.classList.toggle('is-bad', driven.looping);

        var surface = document.getElementById('harness-surface');
        surface.classList.toggle('is-dark', document.getElementById('harness-dark').checked);
        surface.dir = document.getElementById('harness-rtl').checked ? 'rtl' : 'ltr';

        document.getElementById('harness-calls').textContent =
            handle.state.calls.length > 0
                ? handle.state.calls
                    .map(function (call, index) {
                        return String(index + 1).padStart(3, ' ') + '  ' + call;
                    })
                    .join('\n')
                : 'Nothing yet. Sort a column or turn a page.';
    }

    /**
     * Push the inputs box into the live control, one `setInput` per key that
     * changed, then render. A key removed from the box is set to `null`,
     * which is what an input the maker cleared arrives as.
     */
    function applyInputs() {
        if (!handle || !instance) {
            mount();

            return;
        }

        var before = Object.assign({}, lastInputs);
        var after = inputs();
        var names = Object.keys(before).concat(Object.keys(after));
        var changed = false;

        names.forEach(function (name) {
            var was = Object.prototype.hasOwnProperty.call(before, name) ? before[name] : null;
            var now = Object.prototype.hasOwnProperty.call(after, name) ? after[name] : null;

            if (JSON.stringify(was) !== JSON.stringify(now)) {
                handle.setInput(name, now);
                changed = true;
            }
        });

        if (changed) {
            pump();
        }
    }

    /**
     * The shipped English strings, so the page reads the way a form does. The
     * rig only knows the template's keys, and a key name where a sentence
     * belongs hides a string nobody wrote.
     */
    var strings = null;

    function loadStrings() {
        return fetch('../TagList/strings/TagList.1033.resx')
            .then(function (response) {
                return response.text();
            })
            .then(function (xml) {
                strings = {};
                new DOMParser().parseFromString(xml, 'text/xml').querySelectorAll('data').forEach(function (node) {
                    var value = node.querySelector('value');

                    strings[node.getAttribute('name')] = value ? value.textContent : '';
                });
            });
    }

    window.__harnessStart = function () {
        loadStrings().then(start, start);
    };

    function start() {
        var status = document.getElementById('harness-status');

        if (typeof registration.ctor !== 'function') {
            status.textContent = 'No control registered — run npm run build, then reload.';

            return;
        }

        /*
         * One listener on the panel rather than one per switch.
         *
         * `change` bubbles, so every control inside — including ones added
         * later — is wired by existing. The list this replaces had to be edited
         * in two places to add a switch, and a switch added to the markup and
         * forgotten here did nothing at all while looking entirely functional,
         * which is the worst way for a rig to fail.
         */
        document.querySelector('.harness-controls').addEventListener('change', mount);

        /*
         * The inputs box is the one control that is not a switch: it is typed
         * into, and waiting for blur makes it feel broken. And it does not
         * remount — it changes the inputs on the **mounted** control, which
         * is what the hub's demo does when a visitor switches preset and
         * what no form ever does. `pcf-calendar-view` 0.1.3 read a value
         * into React state once at mount and sat on it; a remounting rig
         * could not have shown that, and this one does, because
         * `ReactDOM.render` into the same container keeps the component's
         * state across the pass.
         */
        document.getElementById('harness-inputs').addEventListener('input', applyInputs);

        /*
         * The platform's asynchronous re-render, in one line.
         *
         * The control's own click handlers run first — this listener is on the
         * container, so it fires as the event bubbles past — and the deferral
         * puts the re-render on a later turn, which is where the platform puts
         * it. Rendering synchronously from inside the control's handler would
         * re-enter it mid-update, a shape the platform never produces, so a bug
         * found that way would not be a real one.
         */
        document.getElementById('harness-root').addEventListener('click', function () {
            window.setTimeout(pump, 0);
        });

        /*
         * And the case a click listener alone misses.
         *
         * A control can ask the platform for data from something other than a
         * click — a debounce around a search box, an auto-refresh, any timer.
         * Without this the request is made, the stand-in serves it, and
         * nothing ever renders the answer: the control looks like it ignored
         * what was typed, which is the exact bug the rig exists to rule out.
         *
         * Polling rather than hooking refresh() keeps the stand-in honest.
         * It renders when the platform owes a render and at no other time, so
         * the pass count still means what it means.
         */
        window.setInterval(function () {
            if (handle && handle.renderOwed()) {
                pump();
            }
        }, 50);

        status.textContent = 'Registered ' + registration.name + '.';

        mount();
    }
})();
