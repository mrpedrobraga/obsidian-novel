import { Render } from "./novel-visualise";

export type PropertyKey = string;
export type PropertyValue = string;
export type Metadata = Record<PropertyKey, PropertyValue>;

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
}

/** ----- Document ----- */

/** The novel document, which contains scenes. */
export class NovelDocument {
    constructor(public metadata: Metadata, private _scenes: NovelScene[]) { }

    pushScene(scene: NovelScene) {
        this._scenes.push(scene);
    }

    scenes(): NovelScene[] {
        return this._scenes;
    }

    items(): SceneItem[] {
        return this._scenes.flatMap(scene => scene.items);
    }
}

/** A novel scene, which contains dialogue, directions and more. */
export class NovelScene extends DocumentTextRange {
    /** Name of the scene */
    name: string;
    metadata: Metadata;
    items: SceneItem[];
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
}

/** Plain dialogue line. */
export class DialogueLine extends DocumentTextRange implements Render {
    constructor(range: DocumentTextRange, public content: RichText) {
        super(range.from, range.to);
    }

    asText(): string {
        return this.content.asText();
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
}

/** A new speaker for the dialogues to follow */
export class Speaker extends Reference {
    /** If true, dialogues will just use the previous speaker, with a "CONT'D" marker after the speaker name. */
    continued: boolean;
}

