import type { MultiSelectViewProps } from "./components/multi-select-view";
import type { OptionListViewProps } from "./components/option-list-view";
import type { PreviewPaneProps } from "./components/preview/preview-pane";
import type { StatefulView } from "./stateful-view";

export interface TabBodyHeights {
	current: number;
	max: number;
}

export interface TabComponents {
	optionList: StatefulView<OptionListViewProps>;
	preview: StatefulView<PreviewPaneProps>;
	multiSelect?: StatefulView<MultiSelectViewProps>;
	bodyHeights: (width: number) => TabBodyHeights;
}
