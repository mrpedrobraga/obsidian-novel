import { Text } from '@codemirror/state';
import { ActionLine, DocumentTextRange, NovelDocument, NovelScene, PropertyKey, PropertyValue, RichText, TaggedAction } from 'novel-types';

type Success<T> = { success: true, value: T } | { success: false };
function Success<T>(value: T): Success<T> { return { success: true, value } }
function Failure(): Success<any> { return { success: false } }

export function parseDocument(source: Text): Success<NovelDocument> {
    const script: NovelDocument = {
        metadata: {},
        scenes: []
    };

    let currentPosition = 0;

    function advanceLine() {
        let currentLineEnd = source.lineAt(currentPosition).to;
        // `to` is inclusive, so i add 1 to get to the next character, then 1 to skip it (cuz it's a newline)
        currentPosition = Math.min(source.length, currentLineEnd + 2);
    }

    // Parse properties for the document.
    while (currentPosition < source.length) {
        if (source.lineAt(currentPosition).text.trim() == "") {
            currentPosition += 1;
            continue;
        }

        let property = parseProperty(source, currentPosition);
        if (property.success) {
            script.metadata[property.value[0]] = property.value[1]
            currentPosition = property.value[2].to + 1;
        } else {
            break;
        }
    }

    // Parse scenes until you can't anymore.
    while (currentPosition < source.length) {
        if (source.lineAt(currentPosition).text.trim() == "") {
            currentPosition += 1;
            continue;
        }

        const parseSceneResult = parseScene(source, currentPosition);
        advanceLine();

        if (parseSceneResult.success) {
            const scene = parseSceneResult.value;
            script.scenes.push(scene);
            currentPosition = scene.to + 1;
        } else {
            source.lineAt(currentPosition).to
            advanceLine()
        }
    }

    return Success(script);
}

/** Parses a line for a property. */
export function parseProperty(source: Text, position: number): Success<[PropertyKey, PropertyValue, DocumentTextRange]> {
    const REGEX = /^(\w+)(:\s*)(.*)(\s*)$/;
    const line = source.lineAt(position);
    const match = REGEX.exec(line.text);
    if (!match) return Failure();

    const key = match[1]!;
    const value = match[3]!;

    return Success([key, value, { from: position, to: position + match[0].length }]);
}

/** Parses a scene. */
export function parseScene(source: Text, position: number): Success<NovelScene> {
    const HEADER_REGEX = /^(==\s*)(.+?)(\s*==)/;
    const line = source.lineAt(position);
    const match = HEADER_REGEX.exec(line.text);
    if (!match) return Failure();

    const name = match[2] ?? "Unnamed Scene";

    let scene: NovelScene = {
        name,
        metadata: {},
        items: [],
        from: line.from,
        to: 0
    };

    let currentPosition = position + match[0].length + 1;
    function advanceLine() {
        let currentLineEnd = source.lineAt(currentPosition).to;
        currentPosition = Math.min(source.length, currentLineEnd + 1);
    }

    // Parse properties for the document.
    while (currentPosition < source.length) {
        if (source.lineAt(currentPosition).text == "\n") {
            advanceLine();
            currentPosition += 1;
            continue;
        }

        let property = parseProperty(source, currentPosition);
        if (property.success) {
            scene.metadata[property.value[0]] = property.value[1]
            currentPosition = property.value[2].to + 1;
        } else {
            break;
        }
    }

    while (currentPosition < source.length) {
        const line = source.lineAt(currentPosition);

        // If the line is the start of a new scene, we stop.
        if (line.text[0] == "=") {
            currentPosition -= 1;
            break;
        };

        // Try parse tagged action.
        const parseTaggedActionResult = parseTaggedAction(source, currentPosition);
        if (parseTaggedActionResult.success) {
            scene.items.push({ t: "taggedAction", ...parseTaggedActionResult.value })
            currentPosition = parseTaggedActionResult.value.to + 1;
            continue;
        }

        // Parse anything as an action for now.
        const richText = parseRichText(source, currentPosition, line.to);
        if (richText.success) {
            const actionItem: ActionLine = {
                content: richText.value,
                from: line.from,
                to: line.to
            };
            scene.items.push({ t: "action", ...actionItem });
        }
        advanceLine()
    }

    scene.to = currentPosition;

    return Success(scene);
}

export function parseTaggedAction(source: Text, position: number): Success<TaggedAction> {
    const TAGGED_ACTION_REGEX = /^@(\w+) (.+?)$/;
    const line = source.lineAt(position);
    const match = TAGGED_ACTION_REGEX.exec(line.text);
    if (!match) return Failure();

    const textStart = position + 1 + match[1]!.length;
    const end = position + match[0].length;
    const richText = parseRichText(source, textStart, end);

    if (!richText.success) return Failure();

    return Success({
        tag: match[1]!,
        content: richText.value,
        from: position,
        to: end
    })
}

export function parseRichText(source: Text, from: number, to: number): Success<RichText> {
    return Success(dummyRichText(source.slice(from, to).toString()))
}

function dummyRichText(text: string): RichText {
    return { parts: [{ t: "text", c: text }] }
}