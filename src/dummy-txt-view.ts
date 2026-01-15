import { EditorState, EditorView } from "@codemirror/basic-setup";
import { lineNumbers, scrollPastEnd } from "@codemirror/view";
import { TextFileView, WorkspaceLeaf, TFile } from "obsidian";

export const TXT_VIEW_TYPE = "plain-text-editor";

export class DummyView extends TextFileView {
    editor: EditorView;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    canAcceptExtension(extension: string): boolean {
        return extension === "txt";
    }

    getViewType(): string {
        return TXT_VIEW_TYPE;
    }

    getViewData(): string {
        return this.data;
    }

    async setViewData(data: string, clear: boolean) {
        this.data = data;
        this.editor.dispatch({
            changes: { from: 0, to: this.editor.state.doc.length, insert: data }
        });
    }

    clear(): void { }

    /** Called when opening the view */
    async onOpen() {
        this.contentEl.empty();
        const wrapper = this.contentEl.createDiv("novel-view markdown-source-view mod-cm6");

        this.editor = new EditorView({
            parent: wrapper,
            state: EditorState.create({
                doc: "",
                extensions: [
                    scrollPastEnd(),
                    lineNumbers(),
                    EditorView.lineWrapping,
                    EditorView.updateListener.of(update => {
                        if (update.docChanged) {
                            this.data = this.editor.state.doc.toString();
                            this.requestSave()
                        };
                    }),
                ]
            })
        });

        await super.onOpen();
    }
}