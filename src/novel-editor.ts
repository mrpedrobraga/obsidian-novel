import { App, Notice, TFile } from "obsidian";
import {
    EditorView,
    Decoration,
    DecorationSet,
    ViewUpdate,
    WidgetType,
    PluginValue,
    scrollPastEnd,
    keymap,
    ViewPlugin,
} from "@codemirror/view";
import { RangeSetBuilder, EditorState, StateField, Transaction, Extension, Line } from "@codemirror/state";
import { DocumentTextRange } from "parser/novel-types";
import { NovelView } from "novel-view";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { foldGutter, foldKeymap, foldService } from "@codemirror/language";
import { closeBrackets } from "@codemirror/autocomplete";
import path from "path";

export function createEditor(view: NovelView, wrapper: HTMLDivElement): EditorView {
    const editor = new EditorView({
        state: EditorState.create({
            doc: "",
            extensions: extensions(view)
        }),
        parent: wrapper
    });

    editor.contentDOM.classList.add("cm-s-obsidian");
    editor.contentDOM.setAttribute("spellcheck", "true");
    editor.contentDOM.setAttribute("autocorrect", "on");
    editor.contentDOM.setAttribute("autocomplete", "on");
    editor.contentDOM.setAttribute("autocapitalize", "sentences");
    return editor;
}

export function extensions(view: NovelView) {
    return [
        /* Features */
        EditorView.lineWrapping,
        scrollPastEnd(),
        search({ top: true }),
        keymap.of(searchKeymap),
        highlightSelectionMatches(),
        keymap.of(foldKeymap),
        foldGutter({ openText: "▼", closedText: "▶" }),
        closeBrackets(),

        /* Editor */
        EditorView.updateListener.of(update => {
            if (update.docChanged) {
                view.data = view.editor!.state.doc.toString();
                view.requestSave();
                view.requestUpdate();
            };
        }),

        /* Language */
        foldService.of((state: EditorState, lineStart: number) => {
            const scene = view.sceneAtExact(state, lineStart);
            if (!scene) return null;

            return { from: state.doc.lineAt(scene.from).to, to: scene.to }
        }
        ),
        foldService.of(propertyFoldService),
        //novelDecorationsField(this),
        ViewPlugin.fromClass(novelDecorationsPluginFromApp(view), {
            decorations: v => v.decorations
        }),
    ];
}

export function novelDecorationsField(view: NovelView) {
    return StateField.define<DecorationSet>({
        create(state): DecorationSet {
            return Decoration.none;
        },

        update(oldState: DecorationSet, transaction: Transaction): DecorationSet {
            return buildDecorations(view, transaction.state, [{ from: 0, to: transaction.state.doc.length }]);
        },

        provide(field: StateField<DecorationSet>): Extension {
            return EditorView.decorations.from(field);
        },
    })
};

export function novelDecorationsPluginFromApp(_view: NovelView) {
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
            return buildDecorations(_view, view.state, view.visibleRanges.map(({ from, to }) => ({ from, to })));
        }
    }
}

function buildDecorations(view: NovelView, state: EditorState, visibleRanges: DocumentTextRange[]): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const selectionRanges = state.selection.ranges;

    for (const { from, to } of visibleRanges) {
        let lastSpeaker: { reference: string | null, alias: string | null } = { reference: null, alias: null };
        let pos = from;
        let inDialogue = false;

        while (pos <= to) {
            const line = state.doc.lineAt(pos);
            const lineHasCursor = selectionRanges.some(r => !(r.to < line.from || r.from > line.to));
            const isSelectedClass = lineHasCursor ? 'selected' : '';
            const text = line.text.trim();

            if (!text) {
                inDialogue = false;
                pos = line.to + 1;
                continue;
            }

            // Scene Header
            const headerMatch = /^(==\s*)(.+?)(\s*==)$/.exec(line.text);
            if (headerMatch) {
                let tagClasses: string[] = [];

                const scene = view.sceneAtExact(state, line.from);

                for (const tag of scene?.metadata["Tags"]?.split(/,\s*/) ?? []) {
                    tagClasses.push(`scene-tagged-${tag.trim().toLowerCase()}`);
                }

                builder.add(line.from, line.to, Decoration.mark({ class: `novel-scene-header ${isSelectedClass} ${tagClasses.join(" ")}` }));
                builder.add(line.from, line.from + (headerMatch[1]?.length ?? 0), Decoration.mark({ class: 'hide' }));
                builder.add(line.from + (headerMatch[1]?.length ?? 0) + (headerMatch[2]?.length ?? 0), line.to, Decoration.mark({ class: 'hide' }));
                pos = line.to + 1;
                continue;
            }

            // Comment
            const commentMatch = /^(\/\/\s*)(.+)$/.exec(line.text);
            if (commentMatch) {
                builder.add(line.from, line.from + (commentMatch[1]?.length ?? 0), Decoration.mark({ class: "hide" }));
                builder.add(line.from, line.to, Decoration.mark({ class: `novel-comment ${isSelectedClass}` }));
                pos = line.to + 1;
                continue;
            }

            // Property
            const propertyMatch = /^(\w+):\s*(.+?)$/.exec(line.text);
            if (propertyMatch) {
                let key = propertyMatch[1]!;
                const keyLen = 1 + key.length;
                builder.add(line.from, line.from + keyLen, Decoration.mark({ class: 'novel-property-key' }));
                builder.add(line.from, line.to, Decoration.mark({ class: 'novel-property' }));

                if (key === "Tags") {
                    let start = line.from + "Tags: ".length;
                    const tagMatch = line.text.slice("Tags: ".length).matchAll(/(\w+),?\s*/g);
                    if (tagMatch) {
                        for (const tag of tagMatch) {
                            let from = start + tag.index;
                            let to = from + tag[1]!.length;

                            builder.add(from, to, Decoration.mark({ class: 'novel-tag' }))
                        }
                    }
                }

                pos = line.to + 1;
                continue;
            }

            // Tagged Action
            const tagMatch = /^@(\w+) (.+?)$/.exec(line.text);
            if (tagMatch) {
                const tag = tagMatch[1]!;
                const content = tagMatch[2]!;
                const tagLen = tag.length ?? 0;
                const REFERENCE_REGEX = /\[\[(.+?)(?:\|(.+?))?\]\]$/;
                const referenceMatch = content.match(REFERENCE_REGEX);

                if (!lineHasCursor && (tag === 'BGM' || tag === 'SFX') && referenceMatch) {
                    builder.add(
                        line.from,
                        line.to,
                        Decoration.replace({
                            block: false, widget: new PlaybackWidget(line.text, view.app, tag, referenceMatch[1]!, referenceMatch[2])
                        })
                    )
                } else {
                    builder.add(line.from, line.from + 1 + tagLen, Decoration.mark({ class: `novel-tagged-action-tag` }));
                    builder.add(line.from, line.to, Decoration.mark({ class: `novel-tagged-action tag-${tag.toLowerCase()} ${isSelectedClass}` }));
                    builder.add(line.from + 1 + tagLen + 1, line.to, Decoration.mark({ class: `novel-tagged-action-text` }));
                }

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
                        widget: new SpeakerWidget(view.app, view.file?.path ?? "/", speakerMatch, ref, alias ?? undefined, { contd: speakerMatch[1] === '&' })
                    }));
                    if (speakerMatch[1] !== '&') lastSpeaker = { reference: speakerMatch[1] ?? null, alias: speakerMatch[2] ?? null };
                }
                pos = line.to + 1;
                continue;
            }

            // Dialogue / Action fallback

            pos = parseRichTextRange(line, lineHasCursor, inDialogue, isSelectedClass, pos);
        }
    }

    return builder.finish();

    function parseRichTextRange(line: Line, lineHasCursor: boolean, inDialogue: boolean, isSelectedClass: string, pos: number) {
        const lineDeco: { from: number; to: number; value: Decoration; }[] = [];

        // Wikilinks
        const WIKILINK_REGEX = /\[\[([^\]]+?)(?:\|([^\]]+?))?\]\]/g;
        for (const match of line.text.matchAll(WIKILINK_REGEX)) {
            const start = line.from + match.index!;
            const end = start + match[0].length;

            if (lineHasCursor) {
                lineDeco.push({ from: start, to: end, value: Decoration.mark({ class: 'novel-wikilink' }) });
            } else {
                lineDeco.push({
                    from: start, to: end, value: Decoration.replace({
                        widget: new ReferenceWidget(view.app, view.file?.path ?? "/", match as RegExpExecArray, match[1] ?? '[Broken Reference]', match[2])
                    })
                });
            }
        }

        // Links
        const LINK_REGEX = /\[([^\]]+?)\](?:\(([^\)]+?)\))/g;
        for (const match of line.text.matchAll(LINK_REGEX)) {
            const start = line.from + match.index!;
            const end = start + match[0].length;

            if (lineHasCursor) {
                lineDeco.push({ from: start, to: end, value: Decoration.mark({ class: 'novel-wikilink' }) });
            } else {
                lineDeco.push({
                    from: start, to: end, value: Decoration.replace({
                        widget: new LinkWidget(view.app, match as RegExpExecArray, match[2] ?? '#', match[1])
                    })
                });
            }
        }

        // Formatting
        const BOLD_REGEX = /\*\*([^\*]+?)\*\*/g;
        for (const match of line.text.matchAll(BOLD_REGEX)) {
            const start = line.from + match.index!;
            const end = start + match[0].length;

            lineDeco.push({ from: start, to: end, value: Decoration.mark({ class: 'bold' }) });
            lineDeco.push({ from: start, to: start + 2, value: Decoration.mark({ class: 'hide' }) });
            lineDeco.push({ from: start + match[1]!.length + 2, to: start + match[1]!.length + 4, value: Decoration.mark({ class: 'hide' }) });
        }

        const ITALIC_REGEX = /(?<!\*)\*([^\*]+?)\*/g;
        for (const match of line.text.matchAll(ITALIC_REGEX)) {
            const start = line.from + match.index!;
            const end = start + match[0].length;

            lineDeco.push({ from: start, to: end, value: Decoration.mark({ class: 'italic' }) });
            lineDeco.push({ from: start, to: start + 1, value: Decoration.mark({ class: 'hide' }) });
            lineDeco.push({ from: start + match[1]!.length + 1, to: start + match[1]!.length + 2, value: Decoration.mark({ class: 'hide' }) });
        }

        if (inDialogue) {
            const isParentheticalClass = /^\s*\(.*?\)\s*/.test(line.text) ? 'parenthetical' : '';

            lineDeco.push({
                from: line.from,
                to: line.to,
                value: Decoration.mark({
                    class: `novel-dialogue ${isParentheticalClass} ${isSelectedClass}`
                })
            });
        } else {
            lineDeco.push({
                from: line.from,
                to: line.to,
                value: Decoration.mark({ class: `novel-action-line ${isSelectedClass}` })
            });
        }

        lineDeco.sort((a, b) => {
            if (a.from == b.from) {
                return 0;
            } else {
                return a.from - b.from;
            }
        });
        lineDeco
            .forEach(deco => builder.add(deco.from, deco.to, deco.value));

        pos = line.to + 1;
        return pos;
    }
}

export type SpeakerOptions = { contd: boolean };

export class SpeakerWidget extends WidgetType {
    constructor(private app: App, private sourcePath: string, private raw: RegExpExecArray, private reference: string, private alias?: string, private options?: SpeakerOptions) { super(); }

    toDOM(view: EditorView): HTMLElement {
        const el = document.createElement("a");
        el.textContent = this.alias ?? this.reference;
        if (this.options?.contd) el.textContent += " (CONT'D)";
        el.classList.add("novel-speaker", "uppercase");
        infuseWikilink(this.app, el, this.reference, this.sourcePath);
        return el;
    }
}

export class ReferenceWidget extends WidgetType {
    constructor(private app: App, private sourcePath: string, private raw: RegExpExecArray, private reference: string, private alias?: string) { super(); }

    toDOM(view: EditorView): HTMLElement {
        const el = document.createElement("a");
        el.textContent = this.alias ?? this.reference;
        el.classList.add("novel-wikilink");
        infuseWikilink(this.app, el, this.reference, this.sourcePath);
        return el;
    }
}

export class LinkWidget extends WidgetType {
    constructor(private app: App, private raw: RegExpExecArray, private reference: string, private alias?: string) { super(); }

    toDOM(view: EditorView): HTMLElement {
        const el = document.createElement("a");
        el.href = this.reference;
        el.target = "_blank";
        el.textContent = this.alias ?? this.reference;
        el.classList.add("novel-wikilink");
        infuseLink(this.app, el, this.reference);
        return el;
    }
}

export class PromptWidget extends WidgetType {
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

export class PlaybackWidget extends WidgetType {
    constructor(private raw: string, private app: App, private tag: string, private text: string, private displayText?: string) {
        super()
    }

    toDOM(view: EditorView): HTMLElement {
        const widget = document.createElement('span');
        widget.classList.add('novel-tagged-action');
        widget.classList.add(`tag-${this.tag.toLowerCase()}`);

        widget.createSpan({ cls: 'novel-tagged-action-tag', text: this.tag });

        const mediaPath = this.text;
        const displayText = this.displayText ?? path.parse(mediaPath).name;

        const link = widget.createEl('a', { cls: 'novel-tagged-action-text', text: displayText });

        link.classList.add('novel-tagged-action-link');
        link.addEventListener('click', (e) => {
            const view = this.app.workspace.getActiveViewOfType(NovelView);
            if (!view) {
                new Notice('No Novel view available.');
                return;
            }

            view.playMedia(mediaPath);
        });
        link.addEventListener("mouseover", e => {
            this.app.workspace.trigger('hover-link', { event: e, source: 'novel', hoverParent: widget, targetEl: link, linktext: mediaPath });
        });

        return widget;
    }
}

export function infuseWikilink(app: App, el: HTMLElement, targetPath: string, sourcePath: string) {
    el.addEventListener("click", async e => {
        e.preventDefault(); e.stopPropagation();
        const target = app.metadataCache.getFirstLinkpathDest(targetPath, sourcePath);
        if (target) app.workspace.getLeaf(false).openFile(target as TFile);
        else app.vault.create(`${targetPath}.md`, "").then(f => app.workspace.getLeaf(true).openFile(f));
    });
    el.addEventListener("mouseover", e => {
        app.workspace.trigger('hover-link', { event: e, source: 'novel', hoverParent: el, targetEl: el, linktext: targetPath });
    });
}

export function infuseLink(app: App, el: HTMLElement, path: string) {

}


// Folding Services
export function novelFoldService(state: EditorState, lineStart: number) {
    const line = state.doc.lineAt(lineStart);
    if (!/^==\s*(.+?)\s*==$/.test(line.text)) return null;

    let from = line.to, to = state.doc.length;
    for (let i = line.number + 1; i <= state.doc.lines; i++) {
        const next = state.doc.line(i);
        if (/^==\s*.+?\s*==$/.test(next.text)) { to = next.from - 1; break; }
    }
    return from >= to ? null : { from, to };
}

export function propertyFoldService(state: EditorState, lineStart: number) {
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
