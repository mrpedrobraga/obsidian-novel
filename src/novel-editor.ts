import { App, TFile } from "obsidian";
import {
    EditorView,
    Decoration,
    DecorationSet,
    ViewUpdate,
    WidgetType,
    PluginValue,
} from "@codemirror/view";
import { RangeSetBuilder, EditorState } from "@codemirror/state";

export function novelDecorationsPluginFactory(app: App) {
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

export type SpeakerOptions = { contd: boolean };

export class SpeakerWidget extends WidgetType {
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

export class ReferenceWidget extends WidgetType {
    constructor(private app: App, private raw: RegExpExecArray, private reference: string, private alias?: string) { super(); }

    toDOM(view: EditorView): HTMLElement {
        const el = document.createElement("a");
        el.textContent = this.alias ?? this.reference;
        el.classList.add("novel-wikilink");
        infuseWikilink(this.app, el, this.reference);
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

export function infuseWikilink(app: App, el: HTMLElement, path: string) {
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
