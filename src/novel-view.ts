import { debounce, Debouncer, Notice, TextFileView, WorkspaceLeaf } from "obsidian";
import {
    EditorView,
} from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import {
    openSearchPanel
} from "@codemirror/search";
import { QUERY_VIEW_TYPE } from "query-view";
import { DocumentTextRange, Metadata, NovelDocument, NovelScene } from "parser/novel-types";
import { parseDocument } from "parser/novel-parser";
import moment from "moment";
import { createEditor } from "novel-editor";

export const NOVEL_VIEW_TYPE = "novel";

interface NovelViewOptions {
    infoEl: HTMLElement
}

export class NovelView extends TextFileView {
    editor: EditorView | null = null;
    playback: HTMLDivElement;
    audio: HTMLAudioElement;
    structure: NovelDocument | null = null;
    requestUpdate: Debouncer<[], void>;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);

        this.requestUpdate = debounce(this.update, 2000);
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
        const wrapper = this.contentEl.createDiv("markdown-source-view mod-cm6 novel-wrapper");

        // Editor
        this.editor = createEditor(this, wrapper);

        // Playback
        this.playback = wrapper.createEl('div', { cls: "novel-playback" });
        this.audio = this.playback.createEl("audio");
        this.audio.setAttribute('controls', 'true');

        this.playback.style.display = "none";

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

    getViewData(): string {
        return this.data;
    }

    async setViewData(data: string, clear: boolean) {
        this.data = data;
        this.editor && this.editor.dispatch({ changes: { from: 0, to: this.editor.state.doc.length, insert: this.data } });
        this.update();
    }

    private update() {

        this.rebuildStructure();
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

    playMedia(media: string) {
        this.playback.style.display = "unset";

        const file = this.app.metadataCache.getFirstLinkpathDest(media, this.file?.path ?? '');
        if (file) {
            const AUDIO_FILES = ["mp3", "ogg", "opus"];

            if (AUDIO_FILES.contains(file.extension)) {
                const url = this.app.vault.getResourcePath(file);
                this.audio.setAttribute('src', url);
                this.audio.play();
                return;
            }

            new Notice(`The file format '${file.extension}' is not supported.`)

        } else {
            new Notice(`No media found with path '${media}'.`)
        }
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

    getEstimates() {
        const lineCount = this.editor?.state.doc.lines ?? 0;
        const duration = moment.duration(lineCount * 1 / 50, 'minutes');

        return {
            lineCount,
            duration,
        }
    }

    getMetadata(): Metadata {
        return this.structure?.metadata ?? {};
    }

    getScenes(): NovelScene[] {
        if (!this.structure) return [];
        return this.structure.scenes();
    }

    sceneRangeAt(position: number): DocumentTextRange | null {
        const scene = this.sceneAt(position);
        if (!scene) return null;
        return scene as DocumentTextRange;
    }

    sceneAt(position: number): NovelScene | undefined {
        return this.structure?.scenes().find(scene => scene.from < position && position < scene.to);
    }

    sceneAtExact(state: EditorState, position: number): NovelScene | undefined {
        return this.structure?.scenes().find(scene => scene.from == state.doc.lineAt(position).from);
    }
}

