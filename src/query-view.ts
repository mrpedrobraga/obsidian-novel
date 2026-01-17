import { ActionLine, DialogueLine, NovelScene, RichText, Speaker, TaggedAction } from "parser/novel-types";
import { NovelView } from "novel-view";
import { debounce, Debouncer, IconName, View, WorkspaceLeaf } from "obsidian";
import { createREPLEditor, runTS, mapAsText, mapAsDOM, Tree } from "./repl";
import { EditorView } from "@codemirror/basic-setup";

export const QUERY_VIEW_TYPE = "novel-query-view";

export class QueryView extends View {
    selectedQuerySource = "Scenes";
    resultsContainer: HTMLDivElement;
    currentView: NovelView | null;
    replEditor: EditorView;

    updateDebounced: Debouncer<[], void>;

    getViewType(): string {
        return QUERY_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "Script Query";
    }

    getIcon(): IconName {
        return "search"
    }

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.updateDebounced = debounce(this.update, 500);
    }

    protected async onOpen() {
        const containerEl = this.containerEl;
        containerEl.empty();
        containerEl.addClass("query-view-container");

        const searchContainer = containerEl.createDiv({ cls: "query-view-search" });
        this.replEditor = createREPLEditor(this, searchContainer);

        // const typeContainer = containerEl.createEl('select', { cls: 'query-view-type-filter' });
        // typeContainer.createEl('option', { text: "Scenes" });
        // typeContainer.createEl('option', { text: "BGM" });
        // typeContainer.createEl('option', { text: "VS" });
        // typeContainer.createEl('option', { text: "TRANS" });
        // typeContainer.createEl('option', { text: "SAVE" });
        // typeContainer.createEl('option', { text: "SFX" });
        // typeContainer.createEl('option', { text: "CHYRON" });
        // typeContainer.addEventListener('change', (e) => {
        //     this.selectedQuerySource = (e.target as HTMLSelectElement).value;
        //     this.updateResults();
        // })

        this.resultsContainer = containerEl.createDiv({ cls: "query-view-results" });
        this.resultsContainer.setText("Type a query...");

        this.registerEvent(
            this.app.workspace.on("active-leaf-change", () => this.update())
        );
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (this.currentView) {
                    if (file.path == this.currentView.file?.path) {
                        this.updateDebounced()
                    }
                }
            })
        )
    }

    async update() {
        const leaf = this.app.workspace.getMostRecentLeaf();
        const view = leaf?.view;

        if (view instanceof NovelView) {
            this.currentView = view;
            this.resultsContainer.empty();

            const currentQuery = this.replEditor.state.doc.toString();

            const doc = view.getDocument();
            if (!doc) {
                this.currentView = null;
                this.resultsContainer.empty();
                this.resultsContainer.setText("No document for the open view.");
            }

            const cx = {
                doc,
                toItems(scene: NovelScene) {
                    return scene.items;
                },

                is: (type: any): ((what: any) => boolean) => (what: any) => what instanceof type,

                alphabetically: ((a: string, b: string) => a.localeCompare(b)),

                Speaker,
                DialogueLine,
                TaggedAction,
                ActionLine,
                RichText,
            };
            const result = runTS(currentQuery, cx);

            let scrollCallback = (position: number) => (evt: Event) => {
                evt.preventDefault();
                evt.stopPropagation();
                view.scrollTo(position);
            };

            if (result.success) {
                const resultValue = result.value;
                mapAsDOM(resultValue, { scrollCallback, container: this.resultsContainer });
            } else {
                this.resultsContainer.empty();
                this.resultsContainer.innerText = result.value.toString();
            }
        } else {
            this.currentView = null;
            this.resultsContainer.empty();
            this.resultsContainer.setText("No information for the open view.");
        }
    }
}

