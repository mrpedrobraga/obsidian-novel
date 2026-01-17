import { FailureWith, Success } from "utils/success";
import typescript from "typescript";
import { EditorState, EditorView } from "@codemirror/basic-setup";
import { QueryView } from "query-view";
import { gutters, lineNumbers, scrollPastEnd } from "@codemirror/view";
import { closeBrackets } from "@codemirror/autocomplete";
import { catppuccinLatte } from "@catppuccin/codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { NovelComponentContext, Render } from "parser/novel-types";

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

export function runTS(typescript: string, context: any): Success<any, any> {
    return runJS(transpileTStoJS(typescript), context)
}

export function transpileTStoJS(code: string): string {
    const result = typescript.transpileModule(code, {
        compilerOptions: {
            target: typescript.ScriptTarget.ES2020,
            module: typescript.ModuleKind.ESNext,
        }
    })

    return result.outputText
}

export function runJS(javascript: string, context: any): Success<any, any> {
    const vm = require("node:vm");
    const vmContext = vm.createContext(context);

    try {
        const result = vm.runInContext(javascript, vmContext);
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

    return JSON.stringify(what, null, 2);
}

export function intoString(what: any): string {
    if (what === null || what === undefined) return JSON.stringify(what, null, 2);

    if (typeof what.asText === "function") {
        return what.asText();
    }

    return JSON.stringify(what, null, 2);
}

export function mapAsDOM(what: Tree<any>, cx: NovelComponentContext, level: number = 0): Tree<HTMLElement> {
    if (what === null || what === undefined) return what;

    if (typeof what.asDOM === "function") {
        return (what as Render).asDOM(cx);
    }

    if (Array.isArray(what)) {
        let nestedContainer = cx.container;

        if (level > 0) {
            const group = cx.container.createEl('fieldset', { cls: 'query-result-group' });
            nestedContainer = group;
        }

        return what.map(x => mapAsDOM(x, { scrollCallback: cx.scrollCallback, container: nestedContainer }, level + 1));
    }

    if (typeof what === "object") {
        let entries = Object.entries(what);
        let objectContainer = cx.container;
        if (level > 0 && entries.length > 1) {
            objectContainer = cx.container.createEl('fieldset', { cls: 'query-result-group' })
        }

        const groups: any[] = [];

        for (const [key, value] of entries) {
            let kvContainer = objectContainer.createEl('fieldset', { cls: 'query-result-group' });
            kvContainer.createEl('legend', { text: key });

            groups.push(mapAsDOM(value, { scrollCallback: cx.scrollCallback, container: kvContainer }, 0));
        }

        return groups;
    }

    if (typeof what === "function") {
        return cx.container.createSpan({ text: what.toString(), cls: "query-result-entry item" });
    }

    return cx.container.createSpan({ text: JSON.stringify(what, null, " "), cls: "query-result-entry item" });
}