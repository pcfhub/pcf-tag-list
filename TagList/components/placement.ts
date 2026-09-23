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

export interface FloatingPlacement {
    kind: 'floating';
    style: {
        position: 'absolute';
        left: number;
        width: number;
        top: number;
        maxHeight: number;
        transform?: string;
    };
}

export type Placement = { kind: 'pending' } | FloatingPlacement;

/** The list's own ceiling, as in the stylesheet. */
const MAX_HEIGHT = 264;

/**
 * The list opens upward only when there is less than this under the field
 * *and* at least this above it. The second half is 0.5.0's: 0.3.2 flipped
 * whenever above beat below, and in the hub's demo — a frame sized to the
 * control, so there is never room below — a one-line list flipped up over
 * the chips (2026-09-23).
 */
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

type Box = { left: number; top: number; bottom: number; width: number };

/**
 * Where the list goes, for the field's box and the layer's, both in viewport
 * coordinates (`getBoundingClientRect`).
 *
 * **Absolute against the layer, not fixed** (0.5.0). On a form the two look
 * the same: the layer is at the end of `<body>`, outside every clipping and
 * trapping ancestor either way, and the list follows the field on scroll. The
 * difference is a host that sizes itself to its content. The hub's demo frame
 * grows to fit an absolutely positioned overlay and deliberately skips a fixed
 * one (its measure-height.ts: a fixed box follows the frame's own height, so
 * measuring it would feed back into the resize), and 0.3.2's fixed list was
 * cut off at the frame's edge.
 */
export function placeFloating(field: Box, layer: { left: number; top: number }, viewportHeight: number): FloatingPlacement {
    const below = viewportHeight - field.bottom;
    const above = field.top;
    const upward = below < FLIP_BELOW && above >= FLIP_BELOW && above > below;
    const left = field.left - layer.left;

    return {
        kind: 'floating',
        style: upward
            ? {
                  position: 'absolute',
                  left,
                  width: field.width,
                  top: field.top - layer.top - 2,
                  transform: 'translateY(-100%)',
                  maxHeight: Math.min(MAX_HEIGHT, above - 8),
              }
            : // Downward the ceiling is the stylesheet's own: where the page
              // can grow, the list makes room for itself.
              { position: 'absolute', left, width: field.width, top: field.bottom - layer.top + 2, maxHeight: MAX_HEIGHT },
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
