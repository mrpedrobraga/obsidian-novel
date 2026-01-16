import { closeBrackets } from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import { EditorState, Text } from "@codemirror/state";
import { EditorView, gutters, lineNumbers, scrollPastEnd } from "@codemirror/view";
import { TextFileView, WorkspaceLeaf } from "obsidian";
import { catppuccinLatte } from "@catppuccin/codemirror";
import typescript from "typescript";
import { ActionLine, DialogueLine, NovelDocument, NovelScene, RichText, Speaker, TaggedAction } from "parser/novel-types";
import { parseDocument } from "parser/novel-parser";
import { Success } from "utils/success";

export const TYPESCRIPT_VIEW = 'typescript-view';

export class TypescriptView extends TextFileView {
    editor: EditorView | null;
    preview: HTMLDivElement;

    constructor(leaf: WorkspaceLeaf, private jsRunner: (javascript: string, context: any) => any) {
        super(leaf);
    }

    getViewData(): string {
        return this.data;
    }
    setViewData(data: string, clear: boolean): void {
        this.data = data;
        this.editor?.dispatch({
            changes: { from: 0, to: this.editor.state.doc.length, insert: data }
        });
        this.update();
    }
    update(): void {
        this.evaluateCode();
    }
    clear(): void {
        throw new Error("Method not implemented.");
    }
    getViewType(): string {
        return TYPESCRIPT_VIEW;
    }

    getDisplayText(): string {
        return "Typescript REPL";
    }

    protected async onOpen() {
        this.contentEl.empty();
        this.contentEl.classList.add("ts-view");
        const wrapper = this.contentEl.createDiv("markdown-source-view mod-cm6 ts-wrapper");

        this.editor = createEditor(this, wrapper);
        this.preview = wrapper.createDiv({ cls: 'repl-preview', text: 'undefined' });
    }

    updatePreview(value: string) {
        this.preview.innerText = JSON.stringify(value, null, " ");
    }

    evaluateCode() {
        const rawCodeTypescript = this.data;
        const rawCodeJavascript = transpile(rawCodeTypescript);

        const docResult: Success<NovelDocument> = parseDocument(Text.of(EXAMPLE_NOV.split("\n")));
        const doc = docResult.success ? docResult.value : null;

        const context = {
            doc,
            toItems(scene: NovelScene) {
                return scene.items;
            },

            is: (type: any): ((what: any) => boolean) => (what: any) => what instanceof type,

            alphabetic: ((a: string, b: string) => a.localeCompare(b)),

            Speaker,
            DialogueLine,
            TaggedAction,
            ActionLine,
            RichText,
        };

        const result = this.jsRunner(rawCodeJavascript, context);

        if (result.success) {
            const resultValue = result.value;

            this.updatePreview(tryAsText(resultValue));
        } else {
            //console.error(result.value);
        }
    }
}

function tryAsText(what: any): any {
    if (typeof what.asText === "function") {
        return what.asText();
    }

    if (Array.isArray(what)) {
        return what.map(tryAsText);
    }

    return what;
}

const EXAMPLE_NOV = `
Title: Example Script
Author: Pedro Braga

== Scene 1 ==
Once upon a time, a man got an umbrella.

@BGM Rainy Day
@BGM Reiny Day
@BGM Rbiny Day
@BGM Rciny Day
@BGM Reiny Day
@BGM Rziny Day
@BGM kiny Day


It was raining a lot.

@SFX Woosh.
`;

function createEditor(view: TypescriptView, wrapper: HTMLDivElement): EditorView {
    const editor = new EditorView({
        state: EditorState.create({
            doc: "",
            extensions: [
                gutters(),
                lineNumbers(),
                scrollPastEnd(),
                closeBrackets(),
                catppuccinLatte,
                javascript({
                    jsx: true,
                    typescript: true
                }),
                EditorView.updateListener.of(update => {
                    if (update.docChanged) {
                        view.data = view.editor!.state.doc.toString();
                        view.requestSave();
                        view.update();
                    };
                }),
            ]
        }),
        parent: wrapper
    });

    editor.contentDOM.classList.add("code-editor");
    return editor;
}

/** TYPESCRIPT COMPILE AND RUN **/

function transpile(code: string): string {
    const result = typescript.transpileModule(code, {
        compilerOptions: {
            target: typescript.ScriptTarget.ES2020,
            module: typescript.ModuleKind.ESNext,
        }
    })

    return result.outputText
}
