import * as React from 'react';
import { IInputs, IOutputs } from './generated/ManifestTypes';
import { TagListControl, IProps } from './components/TagListControl';
import { readPlatform } from './platform';
import { TagService } from './service';

/**
 * A virtual (React) dataset control: the tags a record has, as chips, with a
 * type-ahead to attach existing ones and the platform's lookup dialog to
 * browse for more.
 *
 * What adding and removing mean depends on the relationship behind the
 * subgrid, which the subgrid does not report — `binding.ts` reads it from
 * metadata and `service.ts` acts on it. This file only wires the platform to
 * the component.
 */
export class TagList implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private notifyOutputChanged!: () => void;
    private selectedTagId = '';
    private context!: ComponentFramework.Context<IInputs>;
    private service!: TagService;

    public init(context: ComponentFramework.Context<IInputs>, notifyOutputChanged: () => void): void {
        this.context = context;
        this.notifyOutputChanged = notifyOutputChanged;

        // One service for the control's life, reading the *latest* context on
        // every call: `context.parameters.tags` is a new object each pass, and
        // a dataset kept from an earlier one refreshes nothing.
        this.service = new TagService(() => ({
            platform: readPlatform(this.context),
            dataset: this.context.parameters.tags,
            relationshipName: (this.context.parameters.relationshipName?.raw ?? '').trim(),
            primaryNameField: (this.context.parameters.primaryNameField.raw ?? '').trim(),
        }));
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        this.context = context;

        const dataset = context.parameters.tags;
        const platform = readPlatform(context);

        const props: IProps = {
            dataset,
            service: this.service,
            allowCreate: context.parameters.allowCreate.raw !== false,
            allowNewTags: context.parameters.allowNewTags?.raw !== false,
            maxVisible: context.parameters.maxVisible.raw ?? 12,
            disabled: context.mode.isControlDisabled,
            canBrowse: platform.pick !== null,
            dark: (context as { fluentDesignLanguage?: { isDarkTheme?: boolean } }).fluentDesignLanguage?.isDarkTheme,
            getString: (id: string): string => context.resources.getString(id),
            onOpenTag: (recordId: string): void => {
                this.selectedTagId = recordId;
                this.notifyOutputChanged();
                dataset.openDatasetItem(dataset.records[recordId].getNamedReference());
            },
        };

        return React.createElement(TagListControl, props);
    }

    public getOutputs(): IOutputs {
        return { selectedTagId: this.selectedTagId };
    }

    public destroy(): void {
        // React unmounts the tree itself for a virtual control, and the
        // component's own effects clear the search timer on the way out.
    }
}
