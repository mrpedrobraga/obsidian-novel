import { App, debounce, Debouncer, FileView, Notice, TAbstractFile, TFile, ViewStateResult, WorkspaceLeaf } from "obsidian";
import {
    EditorView,
    Decoration,
    DecorationSet,
    ViewPlugin,
    ViewUpdate,
    WidgetType,
    PluginValue,
    scrollPastEnd,
} from "@codemirror/view";
import { RangeSetBuilder, EditorState } from "@codemirror/state";
import {
    search,
    searchKeymap,
    highlightSelectionMatches,
    openSearchPanel
} from "@codemirror/search";
import { keymap } from "@codemirror/view";
import { foldGutter, foldKeymap, foldService } from "@codemirror/language";

export const NOVEL_VIEW_TYPE = "novel";

interface HeadingInfo {
    level: number;
    text: string;
    position: number;
}

interface NovelViewState {
    filePath: string | undefined
}

export class NovelView extends FileView {
    editor: EditorView | null = null;
    saveDebounced: Debouncer<[], void>;
    file: TFile | null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.saveDebounced = debounce(this.save, 100);
        this.file = null;
    }

    getViewType(): string {
        return NOVEL_VIEW_TYPE;
    }

    getDisplayText(): string {
        return this.file?.name ?? "Novel Editor";
    }

    async setState(state: NovelViewState, result: ViewStateResult) {
        if (state.filePath) {
            const file = this.app.vault.getAbstractFileByPath(state.filePath);
            if (file instanceof TFile) {
                await this.loadFile(file);
            }
        }

        return super.setState(state, result);
    }

    getState() {
        return {
            filePath: this.file?.path
        } satisfies NovelViewState;
    }

    protected async onOpen(): Promise<void> {
        this.app.vault.on('modify', (file) => {
            if (file.path === this.file?.path && !this.editor?.hasFocus) {
                this.loadFile(file as any);
            }
        });

        this.contentEl.empty();
        this.contentEl.classList.add("novel-view");
        const wrapper = this.contentEl.createDiv("markdown-source-view mod-cm6");

        this.editor = new EditorView({
            state: EditorState.create({
                doc: "",
                extensions: [
                    EditorView.lineWrapping,
                    scrollPastEnd(),
                    search({ top: true }),
                    keymap.of(searchKeymap),
                    highlightSelectionMatches(),
                    foldService.of(novelFoldService),
                    foldService.of(propertyFoldService),
                    keymap.of(foldKeymap),
                    foldGutter({ openText: "▼", closedText: "▶" }),
                    ViewPlugin.fromClass(novelDecorationsPluginFactory(this.app), {
                        decorations: v => v.decorations
                    }),
                    EditorView.updateListener.of(update => {
                        if (update.docChanged) this.saveDebounced();
                    }),
                ]
            }),
            parent: wrapper
        });

        this.editor.dom.classList.add("cm-s-obsidian");
        this.editor.dom.spellcheck = true;
        this.editor.dom.setAttribute("autocorrect", "on");
        this.editor.dom.setAttribute("autocomplete", "on");
        this.editor.dom.setAttribute("autocapitalize", "sentences");
    }

    async onLoadFile(file: TFile) {
        await this.loadFile(file);
        this.app.workspace.requestSaveLayout();
    }

    async loadFile(file: TFile) {
        const editor = this.editor;
        this.file = file;

        if (!editor) return;
        const currentText = editor.state.doc.toString();
        const diskText = await this.app.vault.read(file);
        if (currentText === diskText) return;

        const topPos = editor.viewport.from;
        const sel = editor.state.selection;

        editor.dispatch({
            changes: { from: 0, to: editor.state.doc.length, insert: diskText },
            selection: sel
        });

        editor.requestMeasure({
            read() { },
            write() {
                editor.dispatch({
                    effects: EditorView.scrollIntoView(topPos, {
                        y: "start",
                        yMargin: 0
                    })
                });
            }
        });

    }

    openSearch() {
        this.editor && openSearchPanel(this.editor);
    }

    async save() {
        if (!this.file || !this.editor) return;
        await this.app.vault.modify(this.file, this.editor.state.doc.toString());
    }

    protected async onClose(): Promise<void> {
        await this.save();
        this.editor?.destroy();
        this.editor = null;
    }

    getHeadings(): HeadingInfo[] {
        if (!this.editor) return [];
        const headings: HeadingInfo[] = [];
        const sceneRegex = /^==\s*(.+?)\s*==$/;
        for (let i = 1; i <= this.editor.state.doc.lines; i++) {
            const line = this.editor.state.doc.line(i);
            const match = sceneRegex.exec(line.text);
            if (match) {
                headings.push({ level: 2, text: match[1]?.trim() ?? "[Scene]", position: line.from });
            }
        }
        return headings;
    }

}

function novelDecorationsPluginFactory(app: App) {
    return class NovelDecorationsPlugin implements PluginValue {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.build(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged || update.selectionSet) {
                this.decorations = this.build(update.view);
            }
        }

        build(view: EditorView): DecorationSet {
            const builder = new RangeSetBuilder<Decoration>();
            const selectionRanges = view.state.selection.ranges;

            for (const { from, to } of view.visibleRanges) {
                let lastSpeaker: { reference: string | null, alias: string | null } = { reference: null, alias: null };
                let pos = from;
                let inDialogue = false;

                while (pos <= to) {
                    const line = view.state.doc.lineAt(pos);
                    const lineHasCursor = selectionRanges.some(r => !(r.to < line.from || r.from > line.to));
                    const text = line.text.trim();

                    if (!text) {
                        inDialogue = false;
                        pos = line.to + 1;
                        continue;
                    }

                    // Scene Header
                    const headerMatch = /^(==\s*)(.+?)(\s*==)$/.exec(line.text);
                    if (headerMatch) {
                        builder.add(line.from, line.to, Decoration.mark({ class: `novel-scene-header ${lineHasCursor ? 'selected' : ''}` }));
                        builder.add(line.from, line.from + (headerMatch[1]?.length ?? 0), Decoration.mark({ class: 'hide' }));
                        builder.add(line.from + (headerMatch[1]?.length ?? 0) + (headerMatch[2]?.length ?? 0), line.to, Decoration.mark({ class: 'hide' }));
                        pos = line.to + 1;
                        continue;
                    }

                    // Comment
                    const commentMatch = /^(\/\/\s*)(.+)$/.exec(line.text);
                    if (commentMatch) {
                        builder.add(line.from, line.from + (commentMatch[1]?.length ?? 0), Decoration.mark({ class: "hide" }));
                        builder.add(line.from, line.to, Decoration.mark({ class: lineHasCursor ? 'novel-comment selected' : 'novel-comment' }));
                        pos = line.to + 1;
                        continue;
                    }

                    // Property
                    const propertyMatch = /^(\w+):\s*(.+?)$/.exec(line.text);
                    if (propertyMatch) {
                        const keyLen = 1 + (propertyMatch[1]?.length ?? 0);
                        builder.add(line.from, line.from + keyLen, Decoration.mark({ class: 'novel-property-key' }));
                        builder.add(line.from, line.to, Decoration.mark({ class: 'novel-property' }));
                        pos = line.to + 1;
                        continue;
                    }

                    // Tagged Action
                    const tagMatch = /^@(\w+) (.+?)$/.exec(line.text);
                    if (tagMatch) {
                        const tagLen = tagMatch[1]?.length ?? 0;
                        builder.add(line.from, line.from + 1 + tagLen, Decoration.mark({ class: `novel-tagged-action-tag` }));
                        builder.add(line.from, line.to, Decoration.mark({ class: `novel-tagged-action tag-${tagMatch[1]?.toLowerCase()} ${lineHasCursor ? 'selected' : ''}` }));
                        builder.add(line.from + 1 + tagLen + 1, line.to, Decoration.mark({ class: `novel-tagged-action-text` }));
                        pos = line.to + 1;
                        continue;
                    }

                    // Prompt
                    const PROMPT_TAG = '%PROMPT ';
                    if (line.text.startsWith(PROMPT_TAG)) {
                        const options = line.text.slice(PROMPT_TAG.length)
                            .split(/,\s*/)
                            .map(opt => opt.trim().replace(/^"|"$/g, ""));
                        if (!lineHasCursor) {
                            builder.add(line.from, line.to, Decoration.replace({
                                widget: new PromptWidget(line.text, options)
                            }));
                        }
                        pos = line.to + 1;
                        continue;
                    }

                    // Speaker
                    const speakerMatch = /^\[\s*([^\[\]|]+?)\s*(?:\|\s*([^\[\]]+?)\s*)?\]$/.exec(line.text);
                    if (speakerMatch) {
                        inDialogue = true;
                        if (lineHasCursor) {
                            builder.add(line.from, line.to, Decoration.mark({ class: 'novel-speaker' }));
                            lastSpeaker = { reference: speakerMatch[1] ?? null, alias: speakerMatch[2] ?? null };
                        } else {
                            const ref = speakerMatch[1] === '&' ? lastSpeaker.reference ?? "???" : speakerMatch[1] ?? "???";
                            const alias = speakerMatch[1] === '&' ? lastSpeaker.alias : speakerMatch[2];
                            builder.add(line.from, line.to, Decoration.replace({
                                widget: new SpeakerWidget(app, speakerMatch, ref, alias ?? undefined, { contd: speakerMatch[1] === '&' })
                            }));
                            if (speakerMatch[1] !== '&') lastSpeaker = { reference: speakerMatch[1] ?? null, alias: speakerMatch[2] ?? null };
                        }
                        pos = line.to + 1;
                        continue;
                    }

                    // Dialogue / Action fallback

                    const inlineDeco: { from: number, to: number, value: Decoration }[] = [];

                    // Wikilinks
                    const WIKILINK_REGEX = /\[\[(.+?)(?:\|(.+?))?\]\]/g;
                    for (const match of line.text.matchAll(WIKILINK_REGEX)) {
                        const start = line.from + match.index!;
                        const end = start + match[0].length;

                        if (lineHasCursor) {
                            inlineDeco.push({ from: start, to: end, value: Decoration.mark({ class: 'novel-wikilink' }) })
                        } else {
                            inlineDeco.push({
                                from: start, to: end, value: Decoration.replace({
                                    widget: new ReferenceWidget(app, match as RegExpExecArray, match[1] ?? '[Broken Reference]', match[2])
                                })
                            });
                        }
                    }

                    inlineDeco.filter(deco => deco.from <= line.from).forEach(deco => builder.add(deco.from, deco.to, deco.value));

                    if (inDialogue) {
                        builder.add(line.from, line.to, Decoration.mark({
                            class: /^\s*\(.*?\)\s*/.test(line.text) ? 'novel-dialogue parenthetical' : 'novel-dialogue'
                        }));
                    } else {
                        builder.add(line.from, line.to, Decoration.mark({ class: 'novel-action-line' }));
                    }

                    inlineDeco.filter(deco => deco.from > line.from).forEach(deco => builder.add(deco.from, deco.to, deco.value));

                    pos = line.to + 1;
                }
            }

            return builder.finish();
        }
    }
}

type SpeakerOptions = { contd: boolean };

class SpeakerWidget extends WidgetType {
    constructor(private app: App, private raw: RegExpExecArray, private reference: string, private alias?: string, private options?: SpeakerOptions) { super(); }

    toDOM(view: EditorView): HTMLElement {
        const el = document.createElement("a");
        el.textContent = this.alias ?? this.reference;
        if (this.options?.contd) el.textContent += " (CONT'D)";
        el.classList.add("novel-speaker", "uppercase");
        infuseWikilink(this.app, el, this.reference);
        return el;
    }
}

class ReferenceWidget extends WidgetType {
    constructor(private app: App, private raw: RegExpExecArray, private reference: string, private alias?: string) { super(); }

    toDOM(view: EditorView): HTMLElement {
        const el = document.createElement("a");
        el.textContent = this.alias ?? this.reference;
        el.classList.add("novel-wikilink");
        infuseWikilink(this.app, el, this.reference);
        return el;
    }
}

class PromptWidget extends WidgetType {
    constructor(private raw: string, private prompts: string[]) { super(); }

    toDOM(view: EditorView): HTMLElement {
        const ol = document.createElement("ol");
        ol.classList.add("novel-prompt");
        for (const prompt of this.prompts) {
            const li = document.createElement("li");
            li.classList.add("novel-prompt-option");
            li.textContent = prompt;
            ol.appendChild(li);
        }
        return ol;
    }
}

function infuseWikilink(app: App, el: HTMLElement, path: string) {
    el.addEventListener("click", async e => {
        e.preventDefault(); e.stopPropagation();
        const target = app.vault.getAbstractFileByPath(path);
        if (target) app.workspace.getLeaf(false).openFile(target as TFile);
        else app.vault.create(`${path}.md`, "").then(f => app.workspace.getLeaf(true).openFile(f));
    });
    el.addEventListener("mouseover", e => {
        app.workspace.trigger('hover-link', { event: e, source: 'novel', hoverParent: el, targetEl: el, linktext: path });
    });
}

// Folding Services
function novelFoldService(state: EditorState, lineStart: number) {
    const line = state.doc.lineAt(lineStart);
    if (!/^==\s*(.+?)\s*==$/.test(line.text)) return null;

    let from = line.to, to = state.doc.length;
    for (let i = line.number + 1; i <= state.doc.lines; i++) {
        const next = state.doc.line(i);
        if (/^==\s*.+?\s*==$/.test(next.text)) { to = next.from - 1; break; }
    }
    return from >= to ? null : { from, to };
}

function propertyFoldService(state: EditorState, lineStart: number) {
    const line = state.doc.lineAt(lineStart);
    if (!/^[A-Za-z][A-Za-z0-9_-]*:\s+/.test(line.text)) return null;
    if (line.number > 1 && /^[A-Z][A-Za-z0-9_-]*:\s+/.test(state.doc.line(line.number - 1).text)) return null;

    let from = line.from, to = line.to;
    for (let i = line.number + 1; i <= state.doc.lines; i++) {
        const next = state.doc.line(i);
        if (!/^[A-Z][A-Za-z0-9_-]*:\s+/.test(next.text)) break;
        to = next.to;
    }
    return from === to ? null : { from, to };
}
