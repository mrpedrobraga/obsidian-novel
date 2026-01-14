import { View } from "obsidian";

export const QUERY_VIEW_TYPE = "novel-query-view";

export class QueryView extends View {
    getViewType(): string {
        return QUERY_VIEW_TYPE;
    }
    getDisplayText(): string {
        return "Script Query";
    }
}