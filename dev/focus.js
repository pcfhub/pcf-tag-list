/*
 * Where focus goes after each button that works — pressed with real keys in
 * headless Chrome, on the harness.
 *
 *     npm run harness -- --no-open --port 8106     # in another terminal
 *     npm run focus                                # this; --port N for another
 *
 * **Why this exists.** A focused element that becomes `disabled` is blurred,
 * and one that leaves the document takes focus with it; either way a keyboard
 * user lands on the page body and starts again from the top. Through 0.5.3
 * three of this control's presses did that: a chip's remove, the add box after
 * Enter, and *Load more*. `npm run smoke` cannot see it — `dev/dom.js` does not
 * blur and the server renderer never runs a click — so this asks a browser.
 *
 * Each case puts focus where a user would, presses Enter through the DevTools
 * protocol (`dev/keys.js`), waits for the work to land, and reads
 * `document.activeElement`. The harness's dialogs answer *confirmed* by
 * default, so a remove goes through.
 *
 * What passing does not mean: the form's own dialog returns focus to the
 * button it opened from — the harness's resolves without moving focus at all.
 * That half is the walkthrough on the form.
 */

'use strict';

const { launch, sleep } = require('./cdp');
const { press, type, focused } = require('./keys');

const at = process.argv.indexOf('--port');
const port = Number(at !== -1 ? process.argv[at + 1] : process.env.PORT) || 8106;
const page = `http://localhost:${port}/dev/harness.html`;

const root = '#harness-root';
const results = [];

function report(name, ok, detail) {
    results.push(ok);
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const where = (f) => (f ? `${f.tag}${f.role ? `[role=${f.role}]` : ''}${f.label ? ` "${f.label}"` : ''}${f.className ? ` .${f.className}` : ''}` : 'nothing');

/*
 * Every write a fifth of a second slower — `fetch` (the `$ref` a native N:N
 * links and unlinks through) and the context's `webAPI` — then the harness
 * rebuilt so the slowed host is the one rendered.
 *
 * The harness answers within a frame, and Chrome blurs a focused element that
 * became `disabled` only at the next rendering update (measured in Chrome 152,
 * 2026-10-29: still focused straight after `disabled = true`, gone two frames
 * later, and re-enabling it gives nothing back). A write that lands inside one
 * frame therefore hides the bug entirely; one that takes as long as a form's
 * does not.
 */
async function slowTheWrites(chrome, ms = 400) {
    await chrome.evaluate(`(() => {
        const wait = (value) => new Promise((resolve) => setTimeout(() => resolve(value), ${ms}));
        const original = window.fetch;
        window.fetch = (...args) => original.apply(window, args).then(wait);

        const host = window.__pcfHost;
        const create = host.createHost;
        host.createHost = (...args) => {
            const handle = create.apply(host, args);
            const api = handle.context && handle.context.webAPI;
            if (api) {
                Object.keys(api).forEach((name) => {
                    const call = api[name];
                    api[name] = (...callArgs) => Promise.resolve(call.apply(api, callArgs)).then(wait);
                });
            }
            return handle;
        };

        const size = document.getElementById('harness-pagesize');
        size.dispatchEvent(new Event('change', { bubbles: true }));
        size.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(1500);
}

async function focusedWithClass(chrome) {
    const f = await focused(chrome);
    const className = await chrome.evaluate('document.activeElement && document.activeElement.className || ""');

    return f ? { ...f, className: String(className).split(' ')[0] } : f;
}

(async () => {
    const chrome = await launch({ width: 1100, height: 900 });

    try {
        /*
         * A chip's remove. The chip leaves with its button, so the button
         * cannot keep focus; the next chip's remove should take it.
         */
        await chrome.navigate(page, 2500);
        await slowTheWrites(chrome);

        const labels = await chrome.evaluate(`(() => {
            const buttons = [...document.querySelectorAll('${root} .TagList-chip-remove')];
            if (buttons.length < 2) return null;
            buttons[0].focus();
            return buttons.map((b) => b.getAttribute('aria-label'));
        })()`);

        if (labels === null) {
            report('remove: the harness shows two chips with a remove', false, 'fewer than two');
        } else {
            await press(chrome, 'Enter');
            await sleep(1500);

            const now = await focusedWithClass(chrome);

            report(
                'remove: focus moves to the next chip\'s remove, not the page body',
                now !== null && now.tag === 'button' && now.label === labels[1],
                `pressed "${labels[0]}", focus on ${where(now)}`,
            );
        }

        /*
         * The add box. Enter on an option attaches it while the box waits; the
         * box must keep focus through that, so the next tag can be typed.
         */
        await chrome.navigate(page, 2500);
        await slowTheWrites(chrome);

        const hasBox = await chrome.evaluate(`(() => {
            const input = document.querySelector('${root} .TagList-input');
            if (!input) return false;
            input.focus();
            return true;
        })()`);

        if (!hasBox) {
            report('add: the harness shows the add box', false, 'no box');
        } else {
            await type(chrome, 'Focus check');
            await sleep(1200);
            await press(chrome, 'Enter');
            await sleep(1500);

            const now = await focusedWithClass(chrome);

            report(
                'add: the box keeps focus while the tag attaches',
                now !== null && now.tag === 'input' && now.role === 'combobox',
                `focus on ${where(now)}`,
            );
        }

        /*
         * Load more. Expanded, with a next page: Enter loads it, and focus stays
         * on the button while there is more, or moves to the first new chip
         * when that was the last page and the button goes.
         */
        await chrome.navigate(page, 2500);
        await slowTheWrites(chrome);

        const loadMore = await chrome.evaluate(`(async () => {
            const more = document.querySelector('${root} .TagList-more');
            if (!more) return null;
            more.click();
            await new Promise((r) => setTimeout(r, 600));
            const buttons = [...document.querySelectorAll('${root} .TagList-more')];
            const load = buttons.find((b) => /load/i.test(b.textContent));
            if (!load) return { chips: document.querySelectorAll('${root} .TagList-chip').length, buttons: buttons.map((b) => b.textContent) };
            load.focus();
            return { chips: document.querySelectorAll('${root} .TagList-chip').length, label: load.textContent };
        })()`);

        if (!loadMore || !loadMore.label) {
            report('load more: the harness offers Load more once expanded', false, JSON.stringify(loadMore));
        } else {
            await press(chrome, 'Enter');
            await sleep(1500);

            const now = await focusedWithClass(chrome);
            const chips = await chrome.evaluate(`document.querySelectorAll('${root} .TagList-chip').length`);

            report(
                'load more: focus stays on Load more, or lands on the first new chip',
                now !== null && now.tag === 'button' && (now.className === 'TagList-more' || now.className === 'TagList-chip-label'),
                `${loadMore.chips} → ${chips} chips, focus on ${where(now)}`,
            );
        }

        const problems = chrome.takeProblems();

        if (problems.length > 0) {
            console.log(`\n  page problems:\n    ${problems.join('\n    ')}`);
        }
    } finally {
        await chrome.close();
    }

    const failed = results.filter((ok) => !ok).length;

    console.log(`\n  ${failed === 0 ? `${results.length} passed` : `${failed} of ${results.length} failed`} — focus after each press, in headless Chrome on the harness\n`);
    process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
