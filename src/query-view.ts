import { ActionLine, renderAsString, TaggedAction } from "parser/novel-types";
import { NovelView } from "novel-view";
import { IconName, View } from "obsidian";

export const QUERY_VIEW_TYPE = "novel-query-view";

export class QueryView extends View {
    selectedQuerySource = "Scenes";
    resultsContainer: HTMLDivElement;
    currentView: NovelView | null;

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
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (this.currentView) {
                    if (file.path == this.currentView.file?.path) {
                        this.updateResults()
                    }
                }
            })
        )
    }

    async updateResults() {
        const leaf = this.app.workspace.getMostRecentLeaf();
        const view = leaf?.view;

        if (view instanceof NovelView) {
            this.currentView = view;
            this.resultsContainer.empty();

            if (this.selectedQuerySource == "Scenes") {
                this.updateWithHeadings(view);
            } else {

                this.updateWithItems(view, this.selectedQuerySource);
            }
        } else {
            this.currentView = null;
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
        const grouped = true;

        const deduplicate = false;
        const deduplicationSet = new Set();

        let container: HTMLElement;

        for (const scene of view.getScenes()) {
            if (grouped) {
                container = this.resultsContainer.createEl('fieldset', { cls: 'query-result-group' });
                container.createEl('legend', { text: scene.name });
            } else {
                container = this.resultsContainer;
            }

            const items = scene.items.filter(item => {
                if (type && item.t === "taggedAction" && item.tag !== type) return false;

                if (deduplicate && item.t === "taggedAction") {
                    const key = renderAsString(item.content);
                    if (deduplicationSet.has(key)) return false;
                    deduplicationSet.add(key);
                }

                return true;
            });

            let scroll = (position: number) => (evt: Event) => {
                evt.preventDefault();
                evt.stopPropagation();
                view.scrollTo(position);
            };

            for (const item of items) {
                switch (item.t) {
                    case "taggedAction":
                        this.createTaggedActionEntryDOM(container, item, scroll);
                        break;
                    case "action":
                        //this.createActionEntryDOM(container, item, scroll);
                        break;
                    case "speaker":
                        break;
                    case "dialogue":
                        break;
                }
            }

            if (grouped && container.childElementCount == 1) {
                this.resultsContainer.removeChild(container);
            }
        }
    }

    private createActionEntryDOM(container: HTMLElement, item: ActionLine, scroll: ScrollCallback) {
        const element = container.createEl("a", { cls: "query-result-entry item", href: "#" });
        element.createDiv({ cls: 'novel-action-line', text: renderAsString(item.content) });

        element.addEventListener('mousedown', scroll(item.from));
    }

    private createTaggedActionEntryDOM(container: HTMLElement, item: TaggedAction, scroll: ScrollCallback) {
        const element = container.createEl("a", { cls: "query-result-entry item selected", href: "#" });
        element.createDiv({ cls: 'novel-tagged-action-tag', text: item.tag });
        element.createDiv({ cls: 'novel-tagged-action-text', text: renderAsString(item.content) });
        element.classList.add(`tag-${item.tag.trim().toLowerCase()}`);

        element.addEventListener('mousedown', scroll(item.from));
    }
}

type ScrollCallback = (position: number) => (event: Event) => void;
