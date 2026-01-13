import { App, debounce, Debouncer, FileView, TFile, WorkspaceLeaf } from "obsidian";
import {
    EditorView,
    Decoration,
    DecorationSet,
    ViewPlugin,
    ViewUpdate,
    WidgetType,
    PluginValue,
    scrollPastEnd,
    gutter,
    GutterMarker,
    highlightActiveLine,
    highlightActiveLineGutter,
} from "@codemirror/view";
import { RangeSetBuilder, EditorState, Line } from "@codemirror/state";
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

export class NovelView extends FileView {
    editor: EditorView | null;
    saveDebounced: Debouncer<[], void>;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);

        this.saveDebounced = debounce(this.save, 300);
    }

    getViewType(): string {
        return NOVEL_VIEW_TYPE;
    }

    getDisplayText(): string {
        return this.file?.name ?? "Novel Editor"
    }

    protected async onOpen(): Promise<void> {
        this.app.vault.on('modify', (file) => {
            if (file.path === this.file?.path) {
                this.reloadFile(file as any);
            }
        });

        this.contentEl.empty();
        this.contentEl.classList.add("novel-view");

        const wrapper = this.contentEl.createDiv("markdown-source-view mod-cm6");

        this.editor = new EditorView({
            state: EditorState.create({
                doc: "",
                extensions: [
                    /* Layout */
                    EditorView.lineWrapping,
                    scrollPastEnd(),
                    /* Search */
                    search({
                        top: true
                    }),
                    keymap.of(searchKeymap),
                    highlightSelectionMatches(),
                    /* Folding */
                    foldService.of(novelFoldService),
                    foldService.of(propertyFoldService),
                    keymap.of(foldKeymap),
                    foldGutter({
                        openText: "▼",
                        closedText: "▶"
                    }),
                    /* Novel Decorations */
                    ViewPlugin.fromClass(novelDecorationsPluginFactory(this.app), {
                        decorations: v => v.decorations
                    }),
                    /* Save */
                    EditorView.updateListener.of((update) => {
                        if (!update.docChanged) return;
                        this.saveDebounced();
                    }),
                    /* Bells and whistles */
                    gutter({
                        widgetMarker(view, widget, block): GutterMarker | null {
                            if (widget instanceof SpeakerWidget) {
                                return new class extends GutterMarker {
                                    toDOM(view: EditorView): Node {
                                        let node = document.createElement('span');
                                        node.innerText = '💬';
                                        return node;
                                    }
                                }();
                            }

                            return null;
                        },
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
        this.editor.focus();
    }

    async onLoadFile(file: TFile): Promise<void> {
        await this.reloadFile(file);
    }

    async reloadFile(file: TFile) {
        if (!this.editor) return;

        const currentText = this.editor.state.doc.toString();
        const diskText = await this.app.vault.read(file);

        if (currentText === diskText) return;

        this.editor.dispatch({
            changes: { from: 0, to: this.editor.state.doc.length, insert: diskText }
        });
    }

    openSearch() {
        this.editor && openSearchPanel(this.editor);
    }

    async save() {
        if (!this.file || !this.editor) return;

        await this.app.vault.modify(
            this.file,
            this.editor.state.doc.toString()
        )
    }

    protected async onClose(): Promise<void> {
        await this.save();
        this.editor?.destroy();
        this.editor = null;
    }

    getHeadings(): HeadingInfo[] {
        if (!this.editor) return [];

        const headings: HeadingInfo[] = [];
        const doc = this.editor.state.doc;

        const sceneRegex = /^==\s*(.+?)\s*==$/;

        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i);
            const match = sceneRegex.exec(line.text);
            if (match) {
                headings.push({
                    level: 2,
                    text: match[1]?.trim() ?? "[Scene]",
                    position: line.from
                });
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
                    const lineHasCursor = selectionRanges.some(
                        range => !(range.to < line.from || range.from > line.to)
                    );
                    if (line.text.trim() == "") {
                        inDialogue = false;
                        pos = line.to + 1;
                        continue;
                    };

                    {
                        const HEADER_REGEX = /^(==\s*)(.+?)(\s*==)$/;
                        const headerMatch = HEADER_REGEX.exec(line.text);

                        if (headerMatch) {
                            builder.add(line.from, line.to, Decoration.mark({ class: `novel-scene-header ${lineHasCursor ? 'selected' : ''}` }))
                            builder.add(line.from, line.from + (headerMatch[1]?.length ?? 0), Decoration.mark({ class: 'hide' }));
                            builder.add(line.from + (headerMatch[1]?.length ?? 0) + (headerMatch[2]?.length ?? 0), line.to, Decoration.mark({ class: 'hide' }));
                            pos = line.to + 1;
                            continue;
                        }
                    }

                    {
                        const COMMENT_REGEX = /^(\/\/\s*)(.+)$/;
                        const commentMatch = COMMENT_REGEX.exec(line.text);

                        if (commentMatch) {
                            builder.add(
                                line.from,
                                line.from + (commentMatch[1]?.length ?? 0),
                                Decoration.mark({ class: "hide" })
                            )
                            builder.add(
                                line.from,
                                line.to,
                                Decoration.mark({ class: lineHasCursor ? 'novel-comment selected' : 'novel-comment' })
                            );
                            pos = line.to + 1;
                            continue;
                        }
                    }

                    {
                        const PROPERTY_REGEX = /^(\w+):\s*(.+?)$/;
                        const propertyMatch = PROPERTY_REGEX.exec(line.text);

                        if (propertyMatch) {
                            let propertyKeyOffset = 1 + (propertyMatch[1]?.length ?? 0);
                            builder.add(line.from, line.from + propertyKeyOffset, Decoration.mark({ class: 'novel-property-key' }));

                            builder.add(
                                line.from,
                                line.to,
                                Decoration.mark({
                                    class: 'novel-property'
                                })
                            );

                            pos = line.to + 1;
                            continue;
                        }
                    }

                    {
                        const TAGGED_ACTION_REGEX = /^@(\w+) (.+?)$/;
                        const taggedActionMatch = TAGGED_ACTION_REGEX.exec(line.text);

                        if (taggedActionMatch) {
                            const tagLength = taggedActionMatch[1]?.length ?? 0;
                            builder.add(
                                line.from,
                                line.from + 1 + tagLength,
                                Decoration.mark({ class: `novel-tagged-action-tag` })
                            );
                            builder.add(
                                line.from,
                                line.to,
                                Decoration.mark({ class: `novel-tagged-action tag-${taggedActionMatch[1]?.toLowerCase() ?? 'unknown'} ${lineHasCursor ? 'selected' : ''}` })
                            );
                            builder.add(
                                line.from + 1 + tagLength + 1,
                                line.to,
                                Decoration.mark({ class: `novel-tagged-action-text` })
                            );

                            pos = line.to + 1;
                            continue;
                        }
                    }

                    {
                        const PROMPT_TAG = '%PROMPT ';
                        if (line.text.startsWith(PROMPT_TAG)) {
                            const optionsMatch =
                                line.text
                                    .slice(PROMPT_TAG.length)
                                    .split(/,\s*/)
                                    .map(option => option.trim().replace(/(^")|("$)/g, ""))
                                ;

                            if (lineHasCursor) { } else {
                                builder.add(
                                    line.from,
                                    line.to,
                                    Decoration.replace({
                                        widget: new PromptWidget(line.text, optionsMatch ?? [])
                                    })
                                );
                            }

                            pos = line.to + 1;
                            continue;
                        }
                    }

                    {
                        const SPEAKER_REGEX = /^\[\s*(.+?)(?:\s*\|\s*(.+?)\s*)?\s*\]$/;
                        const speakerMatch = SPEAKER_REGEX.exec(line.text);

                        if (speakerMatch) {
                            inDialogue = true;
                            if (lineHasCursor) {
                                builder.add(
                                    line.from,
                                    line.to,
                                    Decoration.mark({
                                        class: 'novel-speaker'
                                    })
                                )
                                lastSpeaker = { reference: speakerMatch[1] ?? null, alias: speakerMatch[2] ?? null };
                            } else {
                                if (speakerMatch[1] == '&') {
                                    builder.add(
                                        line.from,
                                        line.to,
                                        Decoration.replace({
                                            widget: new SpeakerWidget(app, speakerMatch, lastSpeaker.reference ?? "???", lastSpeaker.alias ?? undefined, { contd: true })
                                        })
                                    )
                                } else {
                                    builder.add(
                                        line.from,
                                        line.to,
                                        Decoration.replace({
                                            widget: new SpeakerWidget(app, speakerMatch, speakerMatch[1] ?? "???", speakerMatch[2])
                                        })
                                    )
                                    lastSpeaker = { reference: speakerMatch[1] ?? null, alias: speakerMatch[2] ?? null };
                                }
                            }

                            pos = line.to + 1;
                            continue;
                        }
                    }

                    {
                        if (inDialogue) {
                            if (line.text.match(/^\s*\(.*?\)\s*/)) {
                                builder.add(
                                    line.from,
                                    line.to,
                                    Decoration.mark({
                                        class: 'novel-dialogue parenthetical'
                                    })
                                )
                            } else {
                                builder.add(
                                    line.from,
                                    line.to,
                                    Decoration.mark({
                                        class: 'novel-dialogue'
                                    })
                                );
                            }
                        } else {
                            builder.add(
                                line.from,
                                line.to,
                                Decoration.mark({
                                    class: 'novel-action-line'
                                })
                            )
                        }

                        function decorateLineRange(line: { from: number; to: number; text: string }, builder: RangeSetBuilder<Decoration>, lineHasCursor: boolean) {
                            const wikilinkRegex = /\[\[(.+?)(?:\|(.+?))?\]\]/g;
                            let match: RegExpExecArray | null;

                            // Iterate over all matches
                            while ((match = wikilinkRegex.exec(line.text)) !== null) {
                                const start = line.from + match.index;
                                const end = start + match[0].length;

                                /*builder.add(
                                    start,
                                    end,
                                    Decoration.mark({
                                        tagName: "a",
                                        class: "novel-wikilink"
                                    })
                                );*/

                                if (lineHasCursor) {
                                    builder.add(
                                        start, end, Decoration.mark({ class: 'novel-wikilink' })
                                    )
                                } else {
                                    builder.add(
                                        start,
                                        end,
                                        Decoration.replace({
                                            widget: new ReferenceWidget(app, match, match[1] ?? '[Broken Reference]', match[2])
                                        })
                                    );
                                }
                            }
                        }

                        decorateLineRange(line, builder, lineHasCursor);

                        pos = line.to + 1;
                        continue;
                    }
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
        if (this.options?.contd) {
            el.textContent = `${el.textContent} (CONT'D)`;
        }
        el.classList.add("novel-speaker");
        el.classList.add("uppercase");

        infuseWikilink(this.app, el, this.reference);

        return el;
    }
}

class ReferenceWidget extends WidgetType {
    constructor(
        private app: App,
        private raw: RegExpExecArray,
        private reference: string,
        private alias?: string
    ) { super(); }

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
        const div = document.createElement("ol");
        div.classList.add("novel-prompt");

        for (const prompt of this.prompts) {
            div.createEl('li', { cls: 'novel-prompt-option', text: `${prompt}` });
        }

        return div;
    }
}

function infuseWikilink(app: App, el: HTMLElement, path: string) {
    el.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const targetFile = app.vault.getAbstractFileByPath(path);
        if (targetFile) {
            app.workspace.getLeaf(true).openFile(targetFile as TFile);
        } else {
            app.vault.create(`${path}.md`, "").then(f => {
                app.workspace.getLeaf(true).openFile(f);
            });
        }
    });

    el.addEventListener("mouseover", async (event) => {
        app.workspace.trigger('hover-link', {
            event,
            source: 'novel',
            hoverParent: el,
            targetEl: el,
            linktext: path
        })
    });
}

function novelFoldService(state: EditorState, lineStart: number) {
    const line = state.doc.lineAt(lineStart);

    const headerMatch = line.text.match(/^==\s*(.+?)\s*==$/);
    if (!headerMatch) return null;

    let from = line.to;
    let to = state.doc.length;

    for (let i = line.number + 1; i <= state.doc.lines; i++) {
        const next = state.doc.line(i);
        if (/^==\s*.+?\s*==$/.test(next.text)) {
            to = next.from - 1;
            break;
        }
    }

    if (from >= to) return null;

    return { from, to };
}

function propertyFoldService(state: EditorState, lineStart: number) {
    const line = state.doc.lineAt(lineStart);

    if (!/^[A-Za-z][A-Za-z0-9_-]*:\s+/.test(line.text)) {
        return null;
    }

    if (line.number > 1) {
        const prev = state.doc.line(line.number - 1);
        if (/^[A-Z][A-Za-z0-9_-]*:\s+/.test(prev.text)) {
            return null; // not the first line of the group
        }
    }

    let from = line.from;

    let to = line.to;
    for (let i = line.number + 1; i <= state.doc.lines; i++) {
        const next = state.doc.line(i);

        if (!/^[A-Z][A-Za-z0-9_-]*:\s+/.test(next.text)) {
            break;
        }

        to = next.to;
    }

    // Don’t fold a single line
    if (from === to) return null;

    return {
        from, // keep the first property visible
        to
    };
}