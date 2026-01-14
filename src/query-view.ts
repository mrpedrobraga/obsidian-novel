import { renderAsString } from "novel-types";
import { NOVEL_VIEW_TYPE, NovelView } from "novel-view";
import { IconName, Notice, View } from "obsidian";

export const QUERY_VIEW_TYPE = "novel-query-view";

export class QueryView extends View {
    selectedQuerySource = "Scenes";
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

        const typeContainer = containerEl.createEl('select', { cls: 'query-view-type-filter' });
        typeContainer.createEl('option', { text: "Scenes" });
        typeContainer.createEl('option', { text: "BGM" });
        typeContainer.createEl('option', { text: "VS" });
        typeContainer.createEl('option', { text: "TRANS" });
        typeContainer.createEl('option', { text: "SAVE" });
        typeContainer.createEl('option', { text: "SFX" });
        typeContainer.createEl('option', { text: "CHYRON" });
        typeContainer.addEventListener('change', (e) => {
            this.selectedQuerySource = (e.target as HTMLSelectElement).value;
            this.updateResults();
        })

        this.resultsContainer = containerEl.createDiv({ cls: "query-view-results" });
        this.resultsContainer.setText("Results will appear here.");

        containerEl.addClass("query-view-container");

        this.registerEvent(
            this.app.workspace.on("active-leaf-change", () => this.updateResults())
        );
    }

    async updateResults() {
        const leaf = this.app.workspace.getMostRecentLeaf();
        const view = leaf?.view;

        if (view instanceof NovelView) {
            this.resultsContainer.empty();

            if (this.selectedQuerySource == "Scenes") {
                this.updateWithHeadings(view);
            } else {

                this.updateWithItems(view, this.selectedQuerySource);
            }

        } else {
            this.resultsContainer.empty();
            this.resultsContainer.setText("No information for the open view.");
        }
    }

    private updateWithHeadings(view: NovelView) {
        let scenes = view.getScenes();
        for (const scene of scenes) {
            const element = this.resultsContainer.createEl("a", { cls: "query-result-entry scene", href: "#" });
            element.createDiv({ cls: 'title', text: `${scene.name}` });
            element.createDiv({ cls: 'summary', text: scene.metadata["Summary"] ?? 'No summary.' });

            for (const tag of scene.metadata["Tags"]?.split(/,\s*/) ?? []) {
                element.classList.add(`scene-tagged-${tag.trim().toLowerCase()}`);
            }

            element.addEventListener('mousedown', (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                view.scrollTo(scene.from);
            });
        }
    }

    private updateWithItems(view: NovelView, type: string | null) {
        const deduplicate = false;

        let items = view.getScenes().flatMap(scene => scene.items).filter(x => x.t == "taggedAction");

        // Filter by type
        if (type) {
            items = items.filter(item => item.tag == type);
        }

        // Deduplicate
        if (deduplicate) {
            const deduplicationSet = new Set();
            items = items.filter(item => {
                const asString = renderAsString(item.content);
                if (deduplicationSet.has(asString)) return false;
                deduplicationSet.add(asString);
                return true;
            })
        }

        for (const item of items) {
            const element = this.resultsContainer.createEl("a", { cls: "query-result-entry item selected", href: "#" });
            element.createDiv({ cls: 'novel-tagged-action-tag', text: item.tag });
            element.createDiv({ cls: 'novel-tagged-action-text', text: renderAsString(item.content) });
            element.classList.add(`tag-${item.tag.trim().toLowerCase()}`)

            element.addEventListener('mousedown', (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                view.scrollTo(item.from);
            });
        }
    }
}