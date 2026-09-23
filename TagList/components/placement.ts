/**
 * Where the suggestion list goes: a layer at the end of `document.body`, like
 * the platform's own lookup flyout, placed against the field.
 *
 * **Measured twice on a real Account form, 2026-09-23, and each measurement
 * killed a design:**
 *
 *   - 0.3.0: `position: absolute` under the field. The searches answered 200
 *     and no list appeared — the section ends at the field and an ancestor
 *     clipped it. The dev harness had no such ancestor.
 *   - 0.3.1: `position: fixed`, falling back to in-flow when an ancestor would
 *     trap a fixed element. The form has one (a `transform`, `filter` or
 *     `contain` somewhere above the subgrid), so the list went in-flow and
 *     pushed the section open. It worked, and it was not a dropdown.
 *
 * Nothing inside the form's tree can be both unclipped and overlaid, so the
 * list leaves it. A portal would do that, but ReactDOM is a platform external
 * only behind a pcf-scripts feature flag, and bundling a second copy is what
 * the platform library exists to avoid. So React still renders the list, in
 * place, and the component **moves that one element** into a body-level layer:
 *
 *   - safe with React 16 because the list is never conditionally unmounted —
 *     it is always rendered and toggled with `hidden` — so React only ever
 *     edits its children, which it does wherever the node lives; unmounting
 *     removes the list's *ancestor* in the form, and the layer is removed
 *     alongside it;
 *   - clickable because React 16 delegates events at `document`, which a node
 *     in `<body>` still bubbles to;
 *   - themed because the layer is outside the FluentProvider that publishes
 *     the tokens, so the control copies its own resolved `--TagList-*`
 *     properties onto it on every open.
 */

export interface FixedPlacement {
    kind: 'fixed';
    style: {
        position: 'fixed';
        left: number;
        width: number;
        top?: number;
        bottom?: number;
        maxHeight: number;
    };
}

export type Placement = { kind: 'pending' } | FixedPlacement;

/** The list's own ceiling, as in the stylesheet. */
const MAX_HEIGHT = 264;

/** Below this much room under the field, and with more above it, the list opens upward. */
const FLIP_BELOW = 160;

/** The control's custom properties the list reads, copied onto the layer so it keeps the host's theme. */
const THEMED = [
    '--TagList-foreground',
    '--TagList-foreground-hint',
    '--TagList-background',
    '--TagList-subtle-hover',
    '--TagList-stroke-focus',
    '--TagList-shadow',
    '--TagList-radius',
    '--TagList-font-size',
    '--TagList-line-height',
];

/** The fixed placement for a field's box in a viewport of the given height. */
export function placeFixed(field: { left: number; top: number; bottom: number; width: number }, viewportHeight: number): FixedPlacement {
    const below = viewportHeight - field.bottom;
    const above = field.top;
    const upward = below < FLIP_BELOW && above > below;
    const room = Math.max(96, Math.min(MAX_HEIGHT, (upward ? above : below) - 8));

    return {
        kind: 'fixed',
        style: upward
            ? { position: 'fixed', left: field.left, width: field.width, bottom: viewportHeight - field.top + 2, maxHeight: room }
            : { position: 'fixed', left: field.left, width: field.width, top: field.bottom + 2, maxHeight: room },
    };
}

/**
 * Move `list` into a new layer at the end of `<body>`, and return the function
 * that removes the layer. The layer carries the control's root class so the
 * stylesheet's `.TagList .TagList-options` rules still match.
 */
export function liftToBody(list: HTMLElement): () => void {
    const layer = document.createElement('div');

    layer.className = 'TagList TagList-layer';
    document.body.appendChild(layer);
    layer.appendChild(list);

    return () => {
        if (layer.parentNode) {
            layer.parentNode.removeChild(layer);
        }
    };
}

/** Copy the control's resolved theme onto the layer, which sits outside the provider that publishes it. */
export function copyTheme(root: Element, layer: HTMLElement): void {
    const computed = getComputedStyle(root);

    for (const name of THEMED) {
        const value = computed.getPropertyValue(name).trim();

        if (value !== '') {
            layer.style.setProperty(name, value);
        }
    }

    layer.style.fontFamily = computed.fontFamily;
}
