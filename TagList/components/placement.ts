/**
 * Where the suggestion list goes, decided against the page the control is on.
 *
 * **An absolutely positioned list is clipped on a real form.** 0.3.0 shipped
 * one — `position: absolute` under the field — and on an Account form the
 * requests went out, returned 200, and nothing appeared: the subgrid's section
 * ends at the field, so an ancestor with `overflow: hidden` clipped the list,
 * or the next section painted over it (reported 2026-09-23). The dev harness
 * had neither, which is why it looked right there. The skill had already said
 * an inline popup is "not a risk worth taking blind" on a form section.
 *
 * A portal is the usual way out and not available here: ReactDOM is an external
 * only behind a pcf-scripts feature flag, and bundling a second copy is what
 * the platform library exists to avoid. So:
 *
 *   - **fixed**, placed against the field's box — escapes every `overflow`
 *     ancestor and paints over later sections, and flips above the field when
 *     there is more room there;
 *   - **inline**, in the flow under the field — when an ancestor would turn
 *     `position: fixed` into "relative to me" (a `transform`, `filter`,
 *     `perspective` or `contain`), which traps a fixed element as surely as
 *     `overflow` clips an absolute one. Taking space in the layout is the one
 *     placement nothing can clip.
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

export type Placement = { kind: 'pending' } | { kind: 'inline' } | FixedPlacement;

/** The list's own ceiling, as in the stylesheet. */
const MAX_HEIGHT = 264;

/** Below this much room under the field, and with more above it, the list opens upward. */
const FLIP_BELOW = 160;

/** Whether any ancestor makes itself the containing block of a fixed element. */
export function trapsFixed(element: Element): boolean {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node);

        if (
            (style.transform && style.transform !== 'none') ||
            (style.filter && style.filter !== 'none') ||
            (style.perspective && style.perspective !== 'none') ||
            /paint|layout|strict|content/.test(style.contain || '') ||
            /transform|filter|perspective/.test(style.willChange || '')
        ) {
            return true;
        }
    }

    return false;
}

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
