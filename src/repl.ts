import { FailureWith, Success } from "utils/success";
import typescript from "typescript";
import { EditorState, EditorView } from "@codemirror/basic-setup";
import { QueryView } from "query-view";
import { gutters, lineNumbers, scrollPastEnd } from "@codemirror/view";
import { closeBrackets } from "@codemirror/autocomplete";
import { catppuccinLatte } from "@catppuccin/codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { NovelComponentContext, Render } from "parser/novel-types";
import vm from "node:vm";

export const EXAMPLE_NOV = `
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

export function createREPLEditor(view: QueryView, wrapper: HTMLElement): EditorView {
    const editor = new EditorView({
        state: EditorState.create({
            doc: `doc.scenes()`,
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
                        view.update()
                    };
                }),
            ]
        }),
        parent: wrapper
    });

    editor.contentDOM.classList.add("code-repl-editor");
    return editor;
}

/** TYPESCRIPT COMPILE AND RUN **/

export async function runTS(typescript: string, context: any): Promise<Success<any, any>> {
    return runJS(await transpileTStoJS(typescript), context)
}

export async function transpileTStoJS(code: string): Promise<string> {
    const result = typescript.transpileModule(code, {
        compilerOptions: {
            target: typescript.ScriptTarget.ESNext,
            module: typescript.ModuleKind.ESNext,
        }
    })

    return result.outputText
}

export async function runJS(javascript: string, _context: any): Promise<Success<any, any>> {
    const context = vm.createContext(_context);

    try {
        const result = vm.runInContext(javascript, context);

        return Success(result);
    } catch (e) {
        return FailureWith(e)
    }
}

/** Rendering **/

export type Tree<T> = T | T[] | Tree<T>[];

export function mapAsText(what: Tree<any>): Tree<string> {
    if (what === null || what === undefined) return JSON.stringify(what, null, 2);

    if (typeof what.asText === "function") {
        return what.asText();
    }

    if (Array.isArray(what)) {
        return what.map(mapAsText);
    }

    if (what instanceof Set) {
        return [...what].map(mapAsText);
    }

    return JSON.stringify(what, null, 2);
}

export function intoString(what: any): string {
    if (what === null || what === undefined) return JSON.stringify(what, null, 2);

    if (typeof what.asText === "function") {
        return what.asText();
    }

    return JSON.stringify(what, null, 2);
}

export async function mapAsDOM(node: Tree<any>, cx: NovelComponentContext, level: number = 0): Promise<void> {
    if (node === null || node === undefined) return node;

    if (typeof node.pushDOM === "function") {
        (node as Render).pushDOM(cx);
        return;
    }

    if (Array.isArray(node)) {
        let nestedContainer = cx.container;

        if (level > 0) {
            const group = cx.container.createEl('fieldset', { cls: 'query-result-group' });
            nestedContainer = group;
        }

        let fragment = document.createDocumentFragment();

        for (const branch of node) {
            await mapAsDOM(branch, { scrollCallback: cx.scrollCallback, container: fragment }, level + 1);
        }

        nestedContainer.appendChild(fragment);
        return;
    }

    if (node instanceof Set) {
        return mapAsDOM([...node], cx, level);
    }

    if (typeof node === "object") {
        let entries = Object.entries(node);
        let objectContainer = cx.container;
        if (level > 0 && entries.length > 1) {
            objectContainer = cx.container.createEl('fieldset', { cls: 'query-result-group' })
        }
        let objFragment = document.createDocumentFragment();
        for (const [key, value] of entries) {
            let kvContainer = objFragment.createEl('fieldset', { cls: 'query-result-group' });
            kvContainer.createEl('legend', { text: key });

            await mapAsDOM(value, { scrollCallback: cx.scrollCallback, container: kvContainer }, 0);
        }
        objectContainer.appendChild(objFragment);

        return;
    }

    if (typeof node === "function") {
        cx.container.createSpan({ text: node.toString(), cls: "query-result-entry item" });
        return;
    }

    cx.container.createSpan({ text: JSON.stringify(node, null, " "), cls: "query-result-entry item" });
}
