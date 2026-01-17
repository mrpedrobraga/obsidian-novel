export type PropertyKey = string;
export type PropertyValue = string;
export type Metadata = Record<PropertyKey, PropertyValue>;

/** Provides functionality to render this object as text. */
export interface Render {
    /** Returns some text representing this item. */
    asText(): string;

    /** Returns some DOM representing this item. */
    asDOM(cx: NovelComponentContext): HTMLElement;
}

export interface NovelComponentContext {
    scrollCallback(position: number): (event: Event) => void;
    container: HTMLElement;
}


/* ----- CST ----- */

/** The span of an element in the document itself. */
export class DocumentTextRange {
    constructor(public from: number, public to: number) { }
}

/* ----- Rich Text ----- */

/** Text that has stuff inside of it... */

/** A reference to a concept. */
export class Reference extends DocumentTextRange implements Render {
    constructor(range: DocumentTextRange, public referent: string, public alias?: string) {
        super(range.from, range.to);
    }

    asText(): string {
        return this.alias ?? this.referent;
    }

    asDOM(cx: NovelComponentContext): HTMLElement {
        const element = cx.container.createEl('a');
        element.classList.add('query-result-entry', 'item');
        element.setAttribute('href', '#');
        element.createDiv({ cls: 'novel-action-line', text: this.asText() });
        element.addEventListener('mousedown', cx.scrollCallback(this.from));
        return element;
    }
}

/** A part of a `RichText` — can be text or a slightly richer fragment. */
export type RichTextPart =
    | { t: "text"; c: string }
    | { t: "formatting"; f: string; c: RichText }
    | { t: "reference"; c: Reference };

export class RichText implements Render {
    constructor(public parts: RichTextPart[]) { }

    static simpleFromString(text: string): RichText {
        return new RichText([{ t: "text", c: text }]);
    }

    asText(): string {
        return this.parts.map(part => {
            switch (part.t) {
                case "text":
                    return part.c;
                case "formatting":
                    return part.c.asText();
                case "reference":
                    return part.c.asText();
            }
        }).join("");
    }

    asDOM(cx: NovelComponentContext): HTMLElement {
        const element = cx.container.createEl('a');
        element.classList.add('query-result-entry', 'item');
        element.setAttribute('href', '#');
        element.createDiv({ cls: 'novel-action-line', text: this.asText() });
        return element;
    }
}

/** ----- Document ----- */

/** The novel document, which contains scenes. */
export class NovelDocument implements Render {
    constructor(public metadata: Metadata, private _scenes: NovelScene[]) { }

    pushScene(scene: NovelScene) {
        this._scenes.push(scene);
    }

    scenes(): NovelScene[] {
        return this._scenes;
    }

    sceneItems(transform?: (items: SceneItem[]) => SceneItem[]): Record<string, SceneItem[]> {
        return Object.fromEntries(this._scenes.map(scene => [scene.name, transform ? transform(scene.items) : scene.items]));
    }

    items(): SceneItem[] {
        return this._scenes.flatMap(scene => scene.items);
    }

    cues(tag: string): SceneItem[] {
        return this._scenes.flatMap(scene => scene.items).filter(x => x instanceof TaggedAction && x.tag == tag);
    }

    asText(): string {
        return this.metadata["Summary"] ?? 'Novel Document';
    }

    asDOM(cx: NovelComponentContext): HTMLElement {
        const element = cx.container.createEl('a');
        element.classList.add('query-result-entry', 'document');
        element.setAttribute('href', '#'); element.createDiv({ cls: 'title', text: `Novel Document` });
        element.createDiv({ cls: 'summary', text: this.metadata["Summary"] ?? 'No summary.' });

        for (const tag of this.metadata["Tags"]?.split(/,\s*/) ?? []) {
            element.classList.add(`scene-tagged-${tag.trim().toLowerCase()}`);
        }

        element.addEventListener('mousedown', (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            cx.scrollCallback(0)(evt);
        });
        return element;
    }
}

/** A novel scene, which contains dialogue, directions and more. */
export class NovelScene extends DocumentTextRange implements Render {
    constructor(from: number, to: number, public name: string, public metadata: Metadata, public items: SceneItem[]) {
        super(from, to);
    }

    asText(): string {
        return this.name;
    }

    asDOM(cx: NovelComponentContext): HTMLElement {
        const element = cx.container.createEl('a');
        element.classList.add('query-result-entry', 'scene');
        element.setAttribute('href', '#'); element.createDiv({ cls: 'title', text: `${this.name}` });
        element.createDiv({ cls: 'summary', text: this.metadata["Summary"] ?? 'No summary.' });

        for (const tag of this.metadata["Tags"]?.split(/,\s*/) ?? []) {
            element.classList.add(`scene-tagged-${tag.trim().toLowerCase()}`);
        }

        element.addEventListener('mousedown', (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            cx.scrollCallback(this.from)(evt);
        });
        return element;
    }
}

/* ----- Scene Items ----- */

export type SceneItem = ActionLine | Speaker | DialogueLine | TaggedAction;

/** Plain action line. */
export class ActionLine extends DocumentTextRange implements Render {
    constructor(range: DocumentTextRange, public content: RichText) {
        super(range.from, range.to);
    }

    asText(): string {
        return this.content.asText();
    }

    asDOM(cx: NovelComponentContext): HTMLElement {
        const element = cx.container.createEl('a');
        element.classList.add('query-result-entry', 'item');
        element.setAttribute('href', '#');
        element.createDiv({ cls: 'novel-action-line', text: this.content.asText() });
        element.addEventListener('mousedown', cx.scrollCallback(this.from));
        return element;
    }
}

/** Plain dialogue line. */
export class DialogueLine extends DocumentTextRange implements Render {
    constructor(range: DocumentTextRange, public content: RichText) {
        super(range.from, range.to);
    }

    asText(): string {
        return this.content.asText();
    }

    asDOM(cx: NovelComponentContext): HTMLElement {
        const element = cx.container.createEl('a');
        element.classList.add('query-result-entry', 'item');
        element.setAttribute('href', '#');
        element.createDiv({ cls: 'novel-action-line', text: this.content.asText() });
        element.addEventListener('mousedown', cx.scrollCallback(this.from));
        return element;
    }
}

/** A tagged direction in the format "@TAG and then some text" */
export class TaggedAction extends DocumentTextRange implements Render {
    constructor(range: DocumentTextRange, public tag: string, public content: RichText) {
        super(range.from, range.to);
    }

    asText(): string {
        return `@${this.tag} - ${this.content.asText().trim()}`;
    }

    asDOM(cx: NovelComponentContext): HTMLElement {
        const element = cx.container.createEl('a');
        element.classList.add('query-result-entry', 'item', 'selected');
        element.setAttribute('href', '#');
        element.createDiv({ cls: 'novel-tagged-action-tag', text: this.tag });
        element.createDiv({ cls: 'novel-tagged-action-text', text: this.content.asText() });
        element.classList.add(`tag-${this.tag.trim().toLowerCase()}`);

        element.addEventListener('mousedown', cx.scrollCallback(this.from));
        return element;
    }
}

/** A new speaker for the dialogues to follow */
export class Speaker extends Reference {
    /** If true, dialogues will just use the previous speaker, with a "CONT'D" marker after the speaker name. */
    continued: boolean;
    constructor(range: DocumentTextRange, public referent: string, public alias?: string) {
        super(range, referent, alias);
        this.continued = referent == "&";
    }
}
