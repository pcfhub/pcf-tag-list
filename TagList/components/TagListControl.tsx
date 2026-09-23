import * as React from 'react';
import { Binding, canAttach, canChange } from '../binding';
import { Found } from '../platform';
import { Resolved, TagService } from '../service';
import { copyTheme, liftToBody, Placement, placeFixed } from './placement';

export interface IProps {
    dataset: ComponentFramework.PropertyTypes.DataSet;
    service: TagService;
    /** Whether the add box is offered at all — 0.2.x meaning, so `false` stays a read-only list. */
    allowCreate: boolean;
    /** Whether a tag that does not exist yet can be created from the add box. */
    allowNewTags: boolean;
    maxVisible: number;
    disabled: boolean;
    /** Whether the platform's lookup dialog exists on this host. */
    canBrowse: boolean;
    /** `true`, `false`, or `undefined` for a host that publishes no theme — which keeps the light fallbacks. */
    dark: boolean | undefined;
    getString: (id: string) => string;
    onOpenTag: (recordId: string) => void;
}

interface Chip {
    id: string;
    label: string;
    color: string | null;
}

type Option = { kind: 'tag'; tag: Found } | { kind: 'create'; name: string };

/** How long typing has to pause before a search is sent. */
export const SEARCH_DELAY_MS = 250;

/**
 * `property-set` roles, not fixed column names. `column.alias` is the role
 * (`labelField`/`colorField`, from the manifest) and `column.name` is the real
 * column the maker bound — `getFormattedValue()` takes the latter. 0.1.x had
 * these backwards and rendered no chips on any real form (SPEC.md).
 */
export function resolveChips(dataset: ComponentFramework.PropertyTypes.DataSet): Chip[] {
    const labelColumn = dataset.columns.find((column) => column.alias === 'labelField');
    const colorColumn = dataset.columns.find((column) => column.alias === 'colorField');

    if (!labelColumn) {
        return [];
    }

    return dataset.sortedRecordIds.map((id) => {
        const record = dataset.records[id];

        return {
            id,
            label: record.getFormattedValue(labelColumn.name),
            color: colorColumn ? record.getFormattedValue(colorColumn.name) || null : null,
        };
    });
}

/**
 * What to say about a binding the control cannot act on, or `null` when there
 * is nothing to say. A form the maker has not finished configuring should say
 * what to configure, not show an add box that fails on every press.
 */
export function notice(binding: Binding | null, getString: (id: string) => string): string | null {
    if (binding === null) {
        return null;
    }

    switch (binding.kind) {
        case 'ambiguous':
            return getString('TagList_NoticeAmbiguous').replace('{0}', binding.candidates.join(', '));
        case 'unknown':
            return {
                noParent: getString('TagList_NoticeNoParent'),
                noMetadata: getString('TagList_NoticeNoMetadata'),
                noRelationship: getString('TagList_NoticeNoRelationship'),
                unmatchedName: getString('TagList_NoticeUnmatched'),
                selfReferential: getString('TagList_NoticeSelf'),
            }[binding.reason];
        default:
            return null;
    }
}

let instances = 0;

export function TagListControl(props: IProps): React.ReactElement {
    const { dataset, service, allowCreate, allowNewTags, maxVisible, disabled, getString } = props;

    const [resolved, setResolved] = React.useState<Resolved | null>(() => service.peek());
    const [text, setText] = React.useState('');
    const [results, setResults] = React.useState<Found[]>([]);
    const [searching, setSearching] = React.useState(false);
    const [open, setOpen] = React.useState(false);
    const [active, setActive] = React.useState(-1);
    const [adding, setAdding] = React.useState(false);
    const [busy, setBusy] = React.useState<string[]>([]);
    const [error, setError] = React.useState<string | null>(null);
    const [expanded, setExpanded] = React.useState(false);

    const idBase = React.useRef(`TagList-${(instances += 1)}`).current;
    const mounted = React.useRef(true);
    const searchSeq = React.useRef(0);
    const fieldRef = React.useRef<HTMLDivElement>(null);
    const rootRef = React.useRef<HTMLDivElement>(null);
    const listRef = React.useRef<HTMLUListElement>(null);
    const lowered = React.useRef<(() => void) | null>(null);
    const [placement, setPlacement] = React.useState<Placement>({ kind: 'pending' });
    const wantsList = open && text.trim() !== '';

    React.useEffect(
        () => () => {
            mounted.current = false;
        },
        [],
    );

    // The service caches the promise, so this is one resolution per binding
    // key; setting the same object again is a no-op for React.
    React.useEffect(() => {
        service.resolve().then(
            (next) => mounted.current && setResolved(next),
            () => undefined,
        );
    });

    /*
     * The type-ahead. Debounced, and sequenced: a slow answer to an earlier
     * term must not replace a fast answer to a later one.
     */
    React.useEffect(() => {
        const term = text.trim();

        if (term === '') {
            searchSeq.current += 1;
            setResults([]);
            setSearching(false);

            return undefined;
        }

        setSearching(true);

        const timer = setTimeout(() => {
            const seq = (searchSeq.current += 1);

            service.search(term).then(
                (found) => {
                    if (mounted.current && seq === searchSeq.current) {
                        setResults(found);
                        setSearching(false);
                        setActive(found.length > 0 ? 0 : -1);
                    }
                },
                (reason: Error) => {
                    if (mounted.current && seq === searchSeq.current) {
                        setSearching(false);
                        setError(getString('TagList_ErrorSearch').replace('{0}', reason.message));
                    }
                },
            );
        }, SEARCH_DELAY_MS);

        return () => clearTimeout(timer);
    }, [text, service]);

    /*
     * The list lives in a layer at the end of <body>, like the platform's
     * lookup flyout: nothing inside the form's tree can be both unclipped and
     * overlaid (placement.ts has the two measurements). Lifted once it exists —
     * the add box arrives after the binding resolves — and the layer removed
     * when the list goes away with it, or with the control.
     */
    React.useEffect(() => {
        const list = listRef.current;

        if (list && lowered.current === null) {
            lowered.current = liftToBody(list);
        } else if (!list && lowered.current !== null) {
            lowered.current();
            lowered.current = null;
        }
    });

    React.useEffect(
        () => () => {
            lowered.current?.();
            lowered.current = null;
        },
        [],
    );

    /*
     * Place the list against the field while it is open, and keep it there: a
     * fixed list does not move with the form when it scrolls, so it follows
     * the field instead.
     */
    React.useEffect(() => {
        const field = fieldRef.current;
        const list = listRef.current;

        if (!wantsList || !field || !list) {
            setPlacement({ kind: 'pending' });

            return undefined;
        }

        if (rootRef.current && list.parentElement) {
            copyTheme(rootRef.current, list.parentElement);
        }

        const place = (): void => setPlacement(placeFixed(field.getBoundingClientRect(), window.innerHeight));

        place();
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);

        return () => {
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
        // The chip count moves the field: a chip added above it pushes it down.
    }, [wantsList, dataset.sortedRecordIds.length]);

    if (dataset.loading && dataset.sortedRecordIds.length === 0) {
        return <div className="TagList TagList-loading">{getString('TagList_Loading')}</div>;
    }

    const binding = resolved?.binding ?? null;
    const chips = resolveChips(dataset);
    const labels = new Set(chips.map((chip) => chip.label.toLowerCase()));
    const removable = !disabled && binding !== null && canChange(binding);
    const attachable = allowCreate && !disabled && binding !== null && canAttach(binding);

    const total = dataset.paging.totalResultCount;
    const visible = expanded ? chips : chips.slice(0, Math.max(0, maxVisible));
    const hiddenLoaded = chips.length - visible.length;
    const unloaded = total > chips.length ? total - chips.length : 0;

    const term = text.trim();
    const options: Option[] = results.map((tag) => ({ kind: 'tag' as const, tag }));

    if (
        allowNewTags &&
        term !== '' &&
        !searching &&
        !results.some((tag) => tag.name.toLowerCase() === term.toLowerCase()) &&
        !labels.has(term.toLowerCase())
    ) {
        options.push({ kind: 'create', name: term });
    }

    const listOpen = wantsList;

    const report = (key: string, name: string) => (reason: Error) => {
        if (mounted.current) {
            setError(getString(key).replace('{0}', name).replace('{1}', reason.message));
        }
    };

    const choose = (option: Option): void => {
        if (adding) {
            return;
        }

        const name = option.kind === 'tag' ? option.tag.name : option.name;

        setOpen(false);
        setText('');
        setResults([]);
        setError(null);
        setAdding(true);

        (option.kind === 'tag' ? service.attach(option.tag) : service.create(option.name))
            .catch(report('TagList_ErrorAdd', name))
            .then(() => mounted.current && setAdding(false));
    };

    const browse = (): void => {
        if (adding) {
            return;
        }

        setError(null);
        setAdding(true);
        service
            .browse()
            .catch(report('TagList_ErrorAdd', getString('TagList_Browse')))
            .then(() => mounted.current && setAdding(false));
    };

    const remove = (chip: Chip): void => {
        if (busy.includes(chip.id)) {
            return;
        }

        setError(null);
        setBusy((ids) => [...ids, chip.id]);
        service
            .remove(chip.id, chip.label, {
                title: getString('TagList_ConfirmTitle'),
                text: getString('TagList_ConfirmText').replace('{0}', chip.label),
            })
            .catch(report('TagList_ErrorRemove', chip.label))
            .then(() => mounted.current && setBusy((ids) => ids.filter((id) => id !== chip.id)));
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
        if (event.key === 'ArrowDown' && options.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActive((index) => (index + 1) % options.length);
        } else if (event.key === 'ArrowUp' && options.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActive((index) => (index <= 0 ? options.length - 1 : index - 1));
        } else if (event.key === 'Enter') {
            event.preventDefault();

            const option = options[active] ?? (options.length === 1 ? options[0] : undefined);

            if (option && !searching) {
                choose(option);
            }
        } else if (event.key === 'Escape') {
            setOpen(false);
        }
    };

    const message = disabled ? null : notice(binding, getString);
    const classes = ['TagList', props.dark === true ? 'TagList--dark' : '', disabled ? 'TagList--disabled' : '']
        .filter(Boolean)
        .join(' ');
    const listId = `${idBase}-list`;
    const optionId = (index: number): string => `${idBase}-option-${index}`;

    return (
        <div ref={rootRef} className={classes}>
            <ul className="TagList-chips" aria-label={getString('Tags_DataSet_Name')}>
                {chips.length === 0 && <li className="TagList-empty">{getString('TagList_Empty')}</li>}
                {visible.map((chip) => (
                    <li
                        key={chip.id}
                        className={`TagList-chip${busy.includes(chip.id) ? ' TagList-chip--busy' : ''}`}
                        // Lower-case on purpose: React 16.8's server renderer hyphenates the
                        // capitals of a custom property, turning --TagList-… into ---tag-list-….
                        style={chip.color ? ({ '--taglist-chip-accent': chip.color } as React.CSSProperties) : undefined}
                    >
                        <button type="button" className="TagList-chip-label" onClick={() => props.onOpenTag(chip.id)}>
                            {chip.label}
                        </button>
                        {removable && (
                            <button
                                type="button"
                                className="TagList-chip-remove"
                                aria-label={getString('TagList_RemoveLabel').replace('{0}', chip.label)}
                                disabled={busy.includes(chip.id)}
                                onClick={() => remove(chip)}
                            >
                                <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
                                    <path d="M2.4 2.4a.5.5 0 0 1 .7 0L6 5.3l2.9-2.9a.5.5 0 1 1 .7.7L6.7 6l2.9 2.9a.5.5 0 0 1-.7.7L6 6.7 3.1 9.6a.5.5 0 0 1-.7-.7L5.3 6 2.4 3.1a.5.5 0 0 1 0-.7Z" />
                                </svg>
                            </button>
                        )}
                    </li>
                ))}
                {!expanded && (hiddenLoaded + unloaded > 0 || (total < 0 && dataset.paging.hasNextPage)) && (
                    <li className="TagList-more-item">
                        <button type="button" className="TagList-more" onClick={() => setExpanded(true)}>
                            {total < 0
                                ? getString('TagList_MoreUnknown')
                                : getString('TagList_MoreButton').replace('{0}', String(hiddenLoaded + unloaded))}
                        </button>
                    </li>
                )}
                {expanded && dataset.paging.hasNextPage && (
                    <li className="TagList-more-item">
                        <button
                            type="button"
                            className="TagList-more"
                            disabled={dataset.loading}
                            // Bare loadNextPage() accumulates: sortedRecordIds comes back
                            // holding every page so far (pcf-compact-list).
                            onClick={() => dataset.paging.loadNextPage()}
                        >
                            {getString('TagList_LoadMore')}
                        </button>
                    </li>
                )}
                {expanded && chips.length > maxVisible && (
                    <li className="TagList-more-item">
                        <button type="button" className="TagList-more" onClick={() => setExpanded(false)}>
                            {getString('TagList_ShowFewer')}
                        </button>
                    </li>
                )}
            </ul>

            {attachable && (
                <div className="TagList-add">
                    <div ref={fieldRef} className={`TagList-field${adding ? ' TagList-field--busy' : ''}`}>
                        <input
                            type="text"
                            className="TagList-input"
                            role="combobox"
                            aria-autocomplete="list"
                            aria-expanded={listOpen}
                            aria-controls={listId}
                            aria-activedescendant={listOpen && active >= 0 ? optionId(active) : undefined}
                            aria-label={getString('TagList_AddPlaceholder')}
                            placeholder={getString('TagList_AddPlaceholder')}
                            value={text}
                            disabled={adding}
                            onChange={(event) => {
                                setText(event.target.value);
                                setOpen(true);
                            }}
                            onKeyDown={onKeyDown}
                            onFocus={() => setOpen(true)}
                            onBlur={() => setOpen(false)}
                        />
                        {props.canBrowse && (
                            <button
                                type="button"
                                className="TagList-browse"
                                aria-label={getString('TagList_BrowseLabel')}
                                title={getString('TagList_BrowseLabel')}
                                disabled={adding}
                                onClick={browse}
                            >
                                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                                    <path d="M6.5 2a4.5 4.5 0 0 1 3.6 7.2l3.8 3.9a.5.5 0 0 1-.7.7l-3.9-3.8A4.5 4.5 0 1 1 6.5 2Zm0 1a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
                                </svg>
                            </button>
                        )}
                    </div>
                    {/* Always rendered, never conditionally unmounted: it is lifted into a
                        body-level layer, and React must only ever edit its children. */}
                    <ul
                        ref={listRef}
                        hidden={!listOpen}
                        className={`TagList-options TagList-options--${placement.kind}`}
                        style={placement.kind === 'fixed' ? placement.style : undefined}
                        id={listId}
                        role="listbox"
                        aria-label={getString('TagList_AddPlaceholder')}
                    >
                            {listOpen && searching && <li className="TagList-hint">{getString('TagList_Searching')}</li>}
                            {listOpen && !searching && options.length === 0 && <li className="TagList-hint">{getString('TagList_NoMatches')}</li>}
                            {listOpen && options.map((option, index) => (
                                <li
                                    key={option.kind === 'tag' ? option.tag.id : `create:${option.name}`}
                                    id={optionId(index)}
                                    role="option"
                                    aria-selected={index === active}
                                    className={`TagList-option${index === active ? ' TagList-option--active' : ''}${
                                        option.kind === 'create' ? ' TagList-option--create' : ''
                                    }`}
                                    // mousedown, not click: click lands after the input's blur has closed the list.
                                    onMouseDown={(event) => {
                                        event.preventDefault();
                                        choose(option);
                                    }}
                                    onMouseEnter={() => setActive(index)}
                                >
                                    {option.kind === 'tag'
                                        ? option.tag.name
                                        : getString('TagList_CreateOption').replace('{0}', option.name)}
                                </li>
                            ))}
                    </ul>
                </div>
            )}

            {message && <p className="TagList-notice">{message}</p>}

            {error && (
                <div className="TagList-error" role="alert">
                    <span>{error}</span>
                    <button type="button" className="TagList-dismiss" onClick={() => setError(null)}>
                        {getString('TagList_Dismiss')}
                    </button>
                </div>
            )}
        </div>
    );
}
