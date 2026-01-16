
/** Provides functionality to render this object as text. */
export interface Render {
    /** Returns some text representing this item. */
    asText(): string;

    /** Returns some DOM representing this item. */
    //asDOM(): HTMLElement;
}