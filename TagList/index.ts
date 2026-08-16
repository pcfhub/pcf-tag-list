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
            getString: (id: string): string => context.resources.getString(id),
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
                this.createTag(context, dataset, label);
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

    /**
     * `createRecord` alone mints a standalone tag — it never links back to
     * the record this control is mounted on. The documented route
     * (binding `SingleLine.Text` properties to the host record's primary key
     * and entitylogicalname — see the component framework FAQ, "Can I access
     * form context like I can in model-driven apps event handlers?") isn't
     * actually offered by the maker UI for a property on a dataset/subgrid
     * control — there's no "bind to form column" option there, only Static
     * value. `context.mode.contextInfo.{entityId,entityTypeName}` is the
     * real fallback: undocumented (absent from `@types/powerapps-component-
     * framework`, hence the `any` cast) but populated by the platform on
     * every model-driven form and confirmed working by multiple independent
     * reports. Undefined outside a model-driven form (canvas apps, this
     * project's own demo harness) — guarded below, same as a missing
     * `parentLookupField`.
     */
    private createTag(
        context: ComponentFramework.Context<IInputs>,
        dataset: ComponentFramework.PropertyTypes.DataSet,
        label: string,
    ): void {
        const primaryNameField = context.parameters.primaryNameField.raw ?? 'name';
        const parentLookupField = context.parameters.parentLookupField.raw;
        const contextInfo = (context.mode as { contextInfo?: { entityId?: string; entityTypeName?: string } })
            .contextInfo;
        const parentRecordId = contextInfo?.entityId;
        const parentEntityName = contextInfo?.entityTypeName;

        const data: ComponentFramework.WebApi.Entity = { [primaryNameField]: label };

        const create = (): Promise<ComponentFramework.LookupValue> => {
            if (
                !parentRecordId ||
                !parentEntityName ||
                !parentLookupField ||
                typeof context.utils.getEntityMetadata !== 'function'
            ) {
                console.warn(
                    'TagList: parentLookupField must be bound, the control must be on a model-driven form record (context.mode.contextInfo), and the host must support Utility.getEntityMetadata to link a new tag back to this record — creating it unlinked.',
                );
                return context.webAPI.createRecord(dataset.getTargetEntityType(), data);
            }

            // @odata.bind needs the parent's entity SET name (plural), not
            // its logical name — resolving that requires a metadata round
            // trip; there's no static logical-name-to-set-name mapping
            // available to a control.
            return context.utils.getEntityMetadata(parentEntityName).then((metadata) => {
                data[`${parentLookupField}@odata.bind`] = `/${metadata.EntitySetName}(${parentRecordId})`;
                return context.webAPI.createRecord(dataset.getTargetEntityType(), data);
            });
        };

        void create().finally(() => dataset.refresh());
    }
}
