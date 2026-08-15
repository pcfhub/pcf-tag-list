import * as React from 'react';
import { IInputs, IOutputs } from './generated/ManifestTypes';
import { TagListControl, IProps } from './components/TagListControl';

/**
 * A virtual (React) dataset control. Unlike StandardControl, `updateView`
 * returns the element to render rather than mutating a container directly —
 * the platform owns reconciliation.
 */
export class TagList implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private notifyOutputChanged!: () => void;
    private selectedTagId = '';

    public init(
        _context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
    ): void {
        this.notifyOutputChanged = notifyOutputChanged;
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        const dataset = context.parameters.tags;

        const props: IProps = {
            dataset,
            allowCreate: context.parameters.allowCreate.raw ?? true,
            maxVisible: context.parameters.maxVisible.raw ?? 12,
            disabled: context.mode.isControlDisabled,
            onOpenTag: (recordId: string): void => {
                this.selectedTagId = recordId;
                this.notifyOutputChanged();
                dataset.openDatasetItem(dataset.records[recordId].getNamedReference());
            },
            onRemoveTag: (recordId: string): void => {
                // ComponentFramework.WebApi has no `execute` and no
                // relationship-level disassociate primitive — only
                // create/read/update/delete Record against an entity set
                // (checked against the real @types/powerapps-component-
                // framework definitions, not assumed). There is no
                // documented way for a PCF control to disassociate a
                // native M:N relationship at all; deleteRecord here only
                // does the right thing if `tags` is bound to the
                // join/intersect entity's own view rather than the
                // relationship's virtual one. Real limitation, not a
                // shortcut — see SPEC.md.
                void context.webAPI
                    .deleteRecord(dataset.getTargetEntityType(), recordId)
                    .finally(() => dataset.refresh());
            },
            onCreateTag: (label: string): void => {
                void context.webAPI
                    .createRecord(dataset.getTargetEntityType(), { name: label })
                    .finally(() => dataset.refresh());
            },
        };

        return React.createElement(TagListControl, props);
    }

    public getOutputs(): IOutputs {
        return { selectedTagId: this.selectedTagId };
    }

    public destroy(): void {
        // React unmounts the tree itself for a virtual control; nothing to
        // release here — no listeners or timers were created in init().
    }
}
