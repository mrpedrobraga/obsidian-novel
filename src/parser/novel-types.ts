export type PropertyKey = string;
export type PropertyValue = string;
export type Metadata = Record<PropertyKey, PropertyValue>;

/** The novel document, which contains scenes. */
export interface NovelDocument {
    metadata: Metadata;
    scenes: NovelScene[];
}

/** The span of an element in the document itself. */
export interface DocumentTextRange {
    from: number;
    to: number;
}

/** A novel scene, which contains dialogue, directions and more. */
export interface NovelScene extends DocumentTextRange {
    /** Name of the scene */
    name: string;
    metadata: Metadata;
    items: SceneItem[];
}

/* ----- Scene Items ----- */

export type SceneItem =
    | ({ t: "action" } & ActionLine)
    | ({ t: "speaker" } & Speaker)
    | ({ t: "dialogue" } & DialogueLine)
    | ({ t: "taggedAction" } & TaggedAction);

/** Plain action line. */
export interface ActionLine extends DocumentTextRange {
    content: RichText;
}

/** Plain dialogue line. */
export interface DialogueLine extends DocumentTextRange {
    content: RichText;
}

/** A tagged direction in the format "@TAG and then some text" */
export interface TaggedAction extends DocumentTextRange {
    tag: string;
    content: RichText;
}

/** A new speaker for the dialogues to follow */
export interface Speaker extends Reference {
    /** If true, dialogues will just use the previous speaker, with a "CONT'D" marker after the speaker name. */
    continued: boolean;
}

/* ----- Rich Text ----- */

/** Text that has stuff inside of it... */
export interface RichText {
    parts: RichTextPart[];
}

/** A part of a `RichText` — can be text or a slightly richer fragment. */
export type RichTextPart =
    | { t: "text"; c: string }
    | { t: "formatting"; f: string; c: RichText }
    | { t: "reference"; c: Reference };

export function renderAsString(richText: RichText): string {
    return richText.parts.map(x => {
        if (x.t == "text") return x.c;
        if (x.t == "formatting") return renderAsString(x.c);
        if (x.t == "reference") return x.c.alias ?? x.c.referent;
        return ""
    }).join()
}

/** A reference to a concept. */
export interface Reference extends DocumentTextRange {
    /** Which to that this reference refers. */
    referent: string;
    /** An optional name to display in the link instead of the referent. */
    alias?: string;
}