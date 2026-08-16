import * as React from 'react';

export interface IProps {
    dataset: ComponentFramework.PropertyTypes.DataSet;
    allowCreate: boolean;
    maxVisible: number;
    disabled: boolean;
    getString: (id: string) => string;
    onOpenTag: (recordId: string) => void;
    onRemoveTag: (recordId: string) => void;
    onCreateTag: (label: string) => void;
}

interface Chip {
    id: string;
    label: string;
    color: string | null;
}

/**
 * `property-set` roles, not fixed column names — the manifest declares
 * `labelField`/`colorField` so a maker can point this at whichever columns
 * their view actually has. At runtime it's the other way round from what it
 * looks like: `column.alias` is the property-set's own role name
 * (`labelField`/`colorField`, fixed, from the manifest), and `column.name`
 * is the *real* schema name of whichever column the maker actually bound —
 * `getFormattedValue()` takes that. Confirmed against the platform type
 * comments (`name`: "unique name of the column"; `getFormattedValue`'s
 * `columnName` param) and two independent write-ups of this exact
 * property-set pattern, not assumed. Get it backwards, as this did, and it
 * still renders in the demo harness — its `DataSet.ts` mock is a dumb
 * `record.values[columnName]` passthrough with no view-resolution rules of
 * its own, so a self-consistent bug (`demo/tags.json` used to set `name`
 * and `alias` to the same string) never showed up there. It fails silently
 * everywhere else, though: `dataset.columns.find` never matches, `resolveChips`
 * hits its `!labelColumn` guard, and the control renders zero chips no
 * matter what data is actually bound.
 */
function resolveChips(dataset: ComponentFramework.PropertyTypes.DataSet): Chip[] {
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
            color: colorColumn ? record.getFormattedValue(colorColumn.name) : null,
        };
    });
}

export function TagListControl(props: IProps): React.ReactElement {
    const { dataset, allowCreate, maxVisible, disabled, getString } = props;
    const [expanded, setExpanded] = React.useState(false);
    const [draft, setDraft] = React.useState('');

    if (dataset.loading) {
        return React.createElement('div', { className: 'TagList TagList-loading' }, getString('TagList_Loading'));
    }

    const chips = resolveChips(dataset);
    const visible = expanded ? chips : chips.slice(0, maxVisible);
    const hidden = chips.length - visible.length;

    const submitDraft = (): void => {
        const label = draft.trim();

        if (label.length > 0) {
            props.onCreateTag(label);
            setDraft('');
        }
    };

    return React.createElement(
        'div',
        { className: 'TagList' },
        React.createElement(
            'div',
            { className: 'TagList-chips' },
            visible.length === 0 && chips.length === 0
                ? React.createElement('span', { className: 'TagList-empty' }, getString('TagList_Empty'))
                : visible.map((chip) =>
                      React.createElement(
                          'span',
                          { key: chip.id, className: 'TagList-chip', style: chip.color ? { borderColor: chip.color } : undefined },
                          React.createElement(
                              'button',
                              {
                                  type: 'button',
                                  className: 'TagList-chip-label',
                                  onClick: () => props.onOpenTag(chip.id),
                              },
                              chip.label,
                          ),
                          !disabled &&
                              React.createElement(
                                  'button',
                                  {
                                      type: 'button',
                                      className: 'TagList-chip-remove',
                                      'aria-label': getString('TagList_RemoveLabel').replace('{0}', chip.label),
                                      onClick: () => props.onRemoveTag(chip.id),
                                  },
                                  '×',
                              ),
                      ),
                  ),
            hidden > 0 &&
                React.createElement(
                    'button',
                    { type: 'button', className: 'TagList-more', onClick: () => setExpanded(true) },
                    getString('TagList_MoreButton').replace('{0}', String(hidden)),
                ),
        ),
        allowCreate &&
            !disabled &&
            React.createElement(
                'div',
                { className: 'TagList-add' },
                React.createElement('input', {
                    type: 'text',
                    className: 'TagList-add-input',
                    placeholder: getString('TagList_AddPlaceholder'),
                    value: draft,
                    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
                    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
                        if (event.key === 'Enter') {
                            submitDraft();
                        }
                    },
                }),
                React.createElement(
                    'button',
                    { type: 'button', className: 'TagList-add-button', onClick: submitDraft },
                    getString('TagList_AddButton'),
                ),
            ),
    );
}
