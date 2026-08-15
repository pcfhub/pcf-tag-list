import * as React from 'react';

export interface IProps {
    dataset: ComponentFramework.PropertyTypes.DataSet;
    allowCreate: boolean;
    maxVisible: number;
    disabled: boolean;
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
 * their view actually has, and the resolved column's `alias` is what a
 * record's values are keyed by (DataSet.ts, and the real platform, agree on
 * that convention).
 */
function resolveChips(dataset: ComponentFramework.PropertyTypes.DataSet): Chip[] {
    const labelColumn = dataset.columns.find((column) => column.name === 'labelField');
    const colorColumn = dataset.columns.find((column) => column.name === 'colorField');

    if (!labelColumn) {
        return [];
    }

    return dataset.sortedRecordIds.map((id) => {
        const record = dataset.records[id];

        return {
            id,
            label: record.getFormattedValue(labelColumn.alias),
            color: colorColumn ? record.getFormattedValue(colorColumn.alias) : null,
        };
    });
}

export function TagListControl(props: IProps): React.ReactElement {
    const { dataset, allowCreate, maxVisible, disabled } = props;
    const [expanded, setExpanded] = React.useState(false);
    const [draft, setDraft] = React.useState('');

    if (dataset.loading) {
        return React.createElement('div', { className: 'TagList TagList-loading' }, 'Loading…');
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
                ? React.createElement('span', { className: 'TagList-empty' }, 'No tags yet')
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
                                      'aria-label': `Remove ${chip.label}`,
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
                    `+${hidden} more`,
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
                    placeholder: 'Add a tag…',
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
                    'Add',
                ),
            ),
    );
}
