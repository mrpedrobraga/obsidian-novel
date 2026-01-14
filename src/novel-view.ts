import { TextFileView, TFile, WorkspaceLeaf } from "obsidian";
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
import { novelDecorationsPluginFactory, novelFoldService, propertyFoldService } from "novel-editor";

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

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
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
    }

    private createEditor(wrapper: HTMLDivElement) {
        this.editor = new EditorView({
            state: EditorState.create({
                doc: "",
                extensions: this.getExtensions()
            }),
            parent: wrapper
        });

        this.editor.dom.classList.add("cm-s-obsidian");
        this.editor.dom.setAttribute("spellcheck", "true");
        this.editor.dom.setAttribute("autocorrect", "on");
        this.editor.dom.setAttribute("autocomplete", "on");
        this.editor.dom.setAttribute("autocapitalize", "sentences");
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
                    this.requestSave()
                };
            }),

            /* Language */
            foldService.of(novelFoldService),
            foldService.of(propertyFoldService),
            ViewPlugin.fromClass(novelDecorationsPluginFactory(this.app), {
                decorations: v => v.decorations
            }),
        ];
    }

    getViewData(): string {
        return this.data;
    }

    async setViewData(data: string, clear: boolean) {
        this.data = data;

        if (!this.editor) return;

        const changes = clear
            ? { from: 0, to: this.editor.state.doc.length, insert: "" }
            : { from: 0, to: this.editor.state.doc.length, insert: data };

        this.editor.dispatch({ changes });
    }

    clear(): void {
        if (!this.editor) return;

        this.editor.setState(EditorState.create({
            doc: "",
            extensions: this.getExtensions()
        }));
    }

    async onLoadFile(file: TFile): Promise<void> {
        this.file = file;
        const data = await this.app.vault.read(file);
        await this.setViewData(data, false);
    }

    async onUnloadFile(file: TFile): Promise<void> {
        this.file = null;
        const data = "";
        await this.setViewData(data, true);
    }

    async save(clear?: boolean) {
        if (!this.file) return;
        return await this.app.vault.modify(this.file, this.getViewData())
    }

    protected async onClose(): Promise<void> {
        super.onClose();
        this.save();
        this.editor?.destroy();
        this.editor = null;
    }

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

    getHeadings(): HeadingInfo[] {
        if (!this.editor) return [];

        const headings: HeadingInfo[] = [];
        const sceneRegex = /^==\s*(.+?)\s*==$/;
        const metaRegex = /^([\w-]+)\s*:\s*(.+)$/;

        const doc = this.editor.state.doc;
        const totalLines = doc.lines;

        for (let i = 1; i <= totalLines; i++) {
            const line = doc.line(i);
            const match = sceneRegex.exec(line.text);

            if (!match) continue;

            const metadata: Record<string, string> = {};

            // look ahead for adjacent metadata lines
            let j = i + 1;
            while (j <= totalLines) {
                const nextLine = doc.line(j);
                const text = nextLine.text.trim();

                // stop conditions
                if (!text) break; // blank line
                if (sceneRegex.test(text)) break; // next scene

                const metaMatch = metaRegex.exec(text);
                if (!metaMatch) break; // not metadata

                metadata[metaMatch[1]!] = metaMatch[2]!;
                j++;
            }

            headings.push({
                level: 2,
                text: match[1]?.trim() ?? "[Scene]",
                position: line.from,
                metadata,
            });
        }


        return headings;
    }

    getItems(): ItemInfo[] {
        if (!this.editor) return [];

        const ITEM_REGEX = /^@(\w+) (.+?)$/;
        const items = [];

        const doc = this.editor.state.doc;
        const totalLines = doc.lines;

        for (let i = 1; i <= totalLines; i++) {
            const line = doc.line(i);
            const match = ITEM_REGEX.exec(line.text);

            if (!match) continue;

            items.push({
                tag: match[1]!.trim(),
                text: match[2]!.trim(),
                position: line.from,
            });
        }

        return items;
    }

}

