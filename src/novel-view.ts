import { debounce, Debouncer, Notice, TextFileView, TFile, WorkspaceLeaf } from "obsidian";
import {
    EditorView,
    scrollPastEnd,
    ViewPlugin,
} from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import {
    search,
    searchKeymap,
    highlightSelectionMatches,
    openSearchPanel
} from "@codemirror/search";
import { keymap } from "@codemirror/view";
import { foldGutter, foldKeymap, foldService } from "@codemirror/language";
import { QUERY_VIEW_TYPE } from "query-view";
import { novelDecorationsField, novelDecorationsPluginFromApp, novelFoldService, propertyFoldService } from "novel-editor";
import { DocumentTextRange, Metadata, NovelDocument, NovelScene } from "novel-types";
import { parseDocument } from "novel-parser";

export const NOVEL_VIEW_TYPE = "novel";

interface HeadingInfo {
    level: number;
    text: string;
    position: number;
    metadata: Record<string, string>
}

interface ItemInfo {
    tag: string,
    text: string,
    position: number,
}

export class NovelView extends TextFileView {
    editor: EditorView | null = null;
    structure: NovelDocument | null = null;
    rebuildStructureDb: Debouncer<[], void>;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);

        this.rebuildStructureDb = debounce(this.rebuildStructure, 2000);
    }

    canAcceptExtension(extension: string): boolean {
        return ["nov", "novel"].contains(extension)
    }

    getDisplayText() {
        return this.file?.basename ?? "Script";
    }

    getViewType(): string {
        return NOVEL_VIEW_TYPE;
    }

    protected async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.classList.add("novel-view");
        const wrapper = this.contentEl.createDiv("markdown-source-view mod-cm6");

        this.createEditor(wrapper);

        this.addAction("search", "Query", async (evt) => {
            const leaf = this.app.workspace.getRightLeaf(false);
            if (!leaf) return;
            leaf.setViewState({
                type: QUERY_VIEW_TYPE,
                active: true,
            });
            this.app.workspace.revealLeaf(leaf);
        })

        await super.onOpen();
    }

    private createEditor(wrapper: HTMLDivElement) {
        this.editor = new EditorView({
            state: EditorState.create({
                doc: "",
                extensions: this.getExtensions()
            }),
            parent: wrapper
        });

        this.editor.contentDOM.classList.add("cm-s-obsidian");
        this.editor.contentDOM.setAttribute("spellcheck", "true");
        this.editor.contentDOM.setAttribute("autocorrect", "on");
        this.editor.contentDOM.setAttribute("autocomplete", "on");
        this.editor.contentDOM.setAttribute("autocapitalize", "sentences");
    }

    private getExtensions() {
        return [
            /* Features */
            EditorView.lineWrapping,
            scrollPastEnd(),
            search({ top: true }),
            keymap.of(searchKeymap),
            highlightSelectionMatches(),
            keymap.of(foldKeymap),
            foldGutter({ openText: "▼", closedText: "▶" }),
            /* Editor */
            EditorView.updateListener.of(update => {
                if (update.docChanged) {
                    this.data = this.editor!.state.doc.toString();
                    this.requestSave();
                    this.rebuildStructureDb();
                };
            }),

            /* Language */
            foldService.of((state: EditorState, lineStart: number) => {
                const scene = this.sceneAtExact(state, lineStart);
                if (!scene) return null;

                return { from: state.doc.lineAt(scene.from).to, to: scene.to }
            }
            ),
            foldService.of(propertyFoldService),
            //novelDecorationsField(this),
            ViewPlugin.fromClass(novelDecorationsPluginFromApp(this), {
                decorations: v => v.decorations
            }),
        ];
    }

    getViewData(): string {
        return this.data;
    }

    async setViewData(data: string, clear: boolean) {
        this.data = data;
        this.editor && this.editor.dispatch({ changes: { from: 0, to: this.editor.state.doc.length, insert: this.data } });
        if (this.data != "") this.rebuildStructure();
    }

    private rebuildStructure() {
        if (!this.editor) return;

        // Rebuilding it from scratch every time is non-ideal.

        try {
            const parseResult = parseDocument(this.editor.state.doc);
            if (parseResult.success) {
                this.structure = parseResult.value;
                // console.log(parseResult.value, null, " ");
            }
        } catch (e) {
            console.error(e);
        }
    }

    clear(): void { }

    openSearch() {
        this.editor && openSearchPanel(this.editor);
    }

    scrollTo(position: number) {
        if (!this.editor) return;

        const view = this.editor;
        const line = view.state.doc.lineAt(position);

        // optionally move the cursor too
        view.dispatch({
            selection: { anchor: line.to },
            effects: [
                EditorView.scrollIntoView(line.from, { y: "start" }),
            ]
        });

        this.editor.focus();
    }

    getMetadata(): Metadata {
        return this.structure?.metadata ?? {};
    }

    getScenes(): NovelScene[] {
        if (!this.structure) return [];
        return this.structure.scenes;
    }

    getSceneRangeAt(position: number): DocumentTextRange | null {
        const scene = this.sceneAt(position);
        if (!scene) return null;
        return scene as DocumentTextRange;
    }

    sceneAt(position: number): NovelScene | undefined {
        return this.structure?.scenes.find(scene => scene.from < position && position < scene.to);
    }

    sceneAtExact(state: EditorState, position: number): NovelScene | undefined {
        return this.structure?.scenes.find(scene => scene.from == state.doc.lineAt(position).from);
    }
}

