import { ActionLine, DialogueLine, NovelScene, RichText, Speaker, TaggedAction } from "parser/novel-types";
import { NovelView } from "novel-view";
import { debounce, Debouncer, IconName, View, WorkspaceLeaf } from "obsidian";
import { createREPLEditor, runTS, mapAsText, mapAsDOM, Tree, mapAsDOMIterative } from "./repl";
import { EditorView } from "@codemirror/basic-setup";

export const QUERY_VIEW_TYPE = "novel-query-view";

export class QueryView extends View {
    resultsContainer: HTMLDivElement;
    currentView: NovelView | null;
    replEditor: EditorView;

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
    }

    protected async onOpen() {
        const containerEl = this.containerEl;
        containerEl.empty();
        containerEl.addClass("query-view-container");

        const searchContainer = containerEl.createDiv({ cls: "query-view-search" });
        this.replEditor = createREPLEditor(this, searchContainer);

        const typeContainer = containerEl.createEl('select', { cls: 'query-view-type-filter' });
        typeContainer.createEl('option', { text: "Scenes" });
        typeContainer.createEl('option', { text: "BGM" });
        typeContainer.createEl('option', { text: "VS" });
        typeContainer.createEl('option', { text: "TRANS" });
        typeContainer.createEl('option', { text: "SAVE" });
        typeContainer.createEl('option', { text: "SFX" });
        typeContainer.createEl('option', { text: "CHYRON" });
        typeContainer.addEventListener('change', (e) => {
            queueMicrotask(() => {
                const target = e.target as HTMLSelectElement;
                let query = "";

                if (target.value === 'Scenes') {
                    query = `doc.scenes()`;
                } else {
                    query = `doc.cues("${target.value}")`
                }

                this.replEditor.dispatch({ changes: { from: 0, to: this.replEditor.state.doc.length, insert: query } })
            })
        })

        this.resultsContainer = containerEl.createDiv({ cls: "query-view-results" });
        this.resultsContainer.setText("Type a query...");

        this.registerEvent(
            this.app.workspace.on("active-leaf-change", () => this.update())
        );
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (this.currentView) {
                    if (file.path == this.currentView.file?.path) {
                        this.update()
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
                fetch,

                doc,
                toItems(scene: NovelScene) {
                    return scene.items;
                },

                is: (type: any): ((what: any) => boolean) => (what: any) => what instanceof type,
                content: (regex: RegExp) => (what: { content: RichText }) => what.content.asText().matchAll(regex),

                alphabetically: ((a: string, b: string) => a.localeCompare(b)),

                Speaker,
                DialogueLine,
                TaggedAction,
                ActionLine,
                RichText,
            };
            const result = await runTS(currentQuery, cx);

            let scrollCallback = (position: number) => (evt: Event) => {
                evt.preventDefault();
                evt.stopPropagation();
                view.scrollTo(position);
            };

            if (result.success) {
                const resultValue = result.value;
                const start = performance.now();
                const fragment = document.createDocumentFragment();
                await mapAsDOM(resultValue, { scrollCallback, container: fragment });
                this.resultsContainer.appendChild(fragment);
                await new Promise(requestAnimationFrame);
                console.log(currentQuery, performance.now() - start);

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

