import { NOVEL_VIEW_TYPE, NovelView } from "novel-view";
import { IconName, Notice, View } from "obsidian";

export const QUERY_VIEW_TYPE = "novel-query-view";

export class QueryView extends View {
    resultsContainer: HTMLDivElement;

    getViewType(): string {
        return QUERY_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "Script Query";
    }

    getIcon(): IconName {
        return "search"
    }

    protected async onOpen() {
        const containerEl = this.containerEl;
        containerEl.empty();

        const searchContainer = containerEl.createDiv({ cls: "query-view-search" });
        const input = searchContainer.createEl("input", {
            type: "text",
            placeholder: "Enter your query...",
        });

        this.resultsContainer = containerEl.createDiv({ cls: "query-view-results" });
        this.resultsContainer.setText("Results will appear here.");

        containerEl.addClass("query-view-container");

        this.registerEvent(
            this.app.workspace.on("active-leaf-change", () => this.updateResults())
        );
        this.updateResults();
    }

    async updateResults() {
        const leaf = this.app.workspace.getMostRecentLeaf();
        const view = leaf?.view;

        if (view instanceof NovelView) {
            this.resultsContainer.empty();
            this.updateWithItems(view);
        } else {
            this.resultsContainer.empty();
            this.resultsContainer.setText("No information for the open view.");
        }
    }

    private updateWithHeadings(view: NovelView) {
        let headings = view.getHeadings();
        for (const heading of headings) {
            const element = this.resultsContainer.createEl("a", { cls: "query-result-entry heading", href: "#" });
            element.createDiv({ cls: 'title', text: `${heading.text}` });
            element.createDiv({ cls: 'summary', text: heading.metadata["Summary"] ?? 'No summary.' });

            for (const tag of heading.metadata["Tags"]?.split(/,\s*/) ?? []) {
                element.classList.add(`scene-tagged-${tag.trim().toLowerCase()}`);
            }

            element.addEventListener('mousedown', (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                view.scrollTo(heading.position);
            });
        }
    }

    private updateWithItems(view: NovelView) {
        let items = view.getItems();
        for (const item of items.filter(x => x.tag == "BGM")) {
            const element = this.resultsContainer.createEl("a", { cls: "query-result-entry item selected", href: "#" });
            element.createDiv({ cls: 'novel-tagged-action-tag', text: item.tag });
            element.createDiv({ cls: 'novel-tagged-action-text', text: item.text });
            element.classList.add(`tag-${item.tag.trim().toLowerCase()}`)

            element.addEventListener('mousedown', (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                view.scrollTo(item.position);
            });
        }
    }
}