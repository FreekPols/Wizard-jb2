import { mystParse } from "myst-parser";
import { schema } from "../schema";
import type {
    Node as MystNode,
    Block,
    Paragraph,
    Text,
    Emphasis,
    Strong,
    Link,
    LinkReference,
    Definition,
    Parent as MystParent,
    HTML,
    Root,
    Heading,
    ThematicBreak,
    Blockquote,
    List,
    ListItem,
    Code,
    Target,
    Directive,
    Admonition,
    AdmonitionTitle,
    Container,
    Math,
    InlineMath,
} from "myst-spec";
import type { GenericNode, GenericParent } from "myst-common";
import { Mark, Node } from "prosemirror-model";

type DefinitionMap = Map<string, Definition>;

export function findDefinitions(
    myst: MystNode,
    map: DefinitionMap = new Map(),
): Map<string, Definition> {
    if (myst.type === "definition") {
        // MyST spec conversion to typescript types is unfortunately far from perfect, so we have to use some casting.
        const def = myst as Definition;
        map.set(def.identifier!.trim().toLowerCase(), def);
    } else if ("children" in myst) {
        for (const child of (myst as MystParent).children) {
            findDefinitions(child, map);
        }
    }
    return map;
}

export function parseMyst(source: string): Node {
    const parsed = mystParse(source);
    return mystToProseMirror(parsed);
}

export function mystToProseMirror(myst: GenericParent): Node {
    const definitions = findDefinitions(myst);
    const res = parseTreeRecursively(myst, definitions);
    if (Array.isArray(res)) {
        throw new TypeError("Final parse result should not be array");
    }
    return res;
}

function children(node: GenericNode, defs: DefinitionMap): Node[] | undefined {
    return node.children?.flatMap((x) => {
        const res = parseTreeRecursively(x, defs);
        return Array.isArray(res) ? res : [res];
    });
}

function markChildren(
    node: GenericNode,
    defs: DefinitionMap,
    ...marks: Mark[]
): Node[] | undefined {
    return node?.children
        ?.flatMap((n) => parseTreeRecursively(n, defs))
        ?.map((x) => x.mark([...x.marks, ...marks]));
}

function pick<T extends object, A extends keyof T>(
    src: T,
    ...attrs: A[]
): Pick<T, A> {
    const obj: Record<PropertyKey, unknown> = {};
    for (const attr of attrs) {
        obj[attr] = src[attr];
    }
    return obj as Pick<T, A>;
}

const SUPPORTED_DIRECTIVES = [
    "admonition",
    "attention",
    "caution",
    "danger",
    "error",
    "important",
    "hint",
    "note",
    "seealso",
    "tip",
    "warning",
];

const handlers = {
    root: (node: Root, defs: DefinitionMap) =>
        schema.node("root", {}, children(node, defs)),
    block: (node: Block, defs: DefinitionMap) =>
        schema.node("block", { meta: node.meta }, children(node, defs)),
    paragraph: (node: Paragraph, defs: DefinitionMap) =>
        schema.node("paragraph", {}, children(node, defs)),
    definition: (node: Definition) =>
        schema.node("definition", { url: node.url, type: node.type }),
    heading: (node: Heading, defs: DefinitionMap) =>
        schema.node(
            "heading",
            {
                level: node.depth,
                enumerated: node.enumerated,
                enumerator: node.enumerator,
                identifier: node.identifier,
                label: node.label,
            },
            children(node, defs),
        ),
    thematicBreak: (_node: ThematicBreak) => schema.node("thematicBreak"),
    blockquote: (node: Blockquote, defs: DefinitionMap) =>
        schema.node("blockquote", {}, children(node, defs)),
    list: (node: List, defs: DefinitionMap) =>
        schema.node(
            "list",
            { spread: node.spread, ordered: node.ordered },
            children(node, defs),
        ),
    listItem: (node: ListItem, defs: DefinitionMap) => {
        let myChildren = children(node, defs);
        if (myChildren !== undefined && myChildren.every((x) => x.isInline)) {
            myChildren = [schema.node("paragraph", {}, myChildren)];
        }
        return schema.node("listItem", { spread: node.spread }, myChildren);
    },
    text: (node: Text) => schema.text(node.value),
    html: (node: HTML) => schema.node("html", { value: node.value }),
    code: (node: Code) =>
        schema.node(
            "code",
            pick(
                node,
                "lang",
                "meta",
                "class",
                "showLineNumbers",
                "emphasizeLines",
                "identifier",
                "label",
            ),
            schema.text(node.value),
        ),
    mystTarget: (node: Target) =>
        schema.node("target", { label: node.label?.trim()?.toLowerCase() }),
    mystDirective: (node: Directive, defs: DefinitionMap) =>
        schema.node(
            "directive",
            pick(node, "name", "value", "args"),
            SUPPORTED_DIRECTIVES.includes(node.name)
                ? children(node, defs)
                : undefined,
        ),
    admonition: (node: Admonition, defs: DefinitionMap) =>
        schema.node("admonition", { kind: node.kind }, children(node, defs)),
    admonitionTitle: (node: AdmonitionTitle, defs: DefinitionMap) =>
        schema.node("admonitionTitle", {}, children(node, defs)),
    container: (node: Container, defs: DefinitionMap) =>
        schema.node("container", { kind: node.kind }, children(node, defs)),
    emphasis: (node: Emphasis, defs: DefinitionMap) =>
        markChildren(node, defs, schema.mark("emphasis")),
    strong: (node: Strong, defs: DefinitionMap) =>
        markChildren(node, defs, schema.mark("strong")),
    link: (node: Link, defs: DefinitionMap) =>
        markChildren(
            node,
            defs,
            schema.mark("link", pick(node, "url", "title")),
        ),
    linkReference: (node: LinkReference, defs: DefinitionMap) =>
        markChildren(
            node,
            defs,
            schema.mark("link", {
                url: defs.get(node.identifier!.trim().toLowerCase()),
                reference: {
                    referenceType: node.referenceType,
                },
            }),
        ),
    math: (node: Math) =>
        schema.node(
            "math",
            pick(node, "identifier", "label"),
            schema.text(node.value),
        ),
    inlineMath: (node: InlineMath) =>
        schema.node("inlineMath", {}, schema.text(node.value)),
};

function parseTreeRecursively(
    myst: MystNode,
    definitions: Map<string, Definition>,
): Node | Node[] {
    if (!(myst.type in handlers))
        throw new RangeError(`Unknown node type '${myst.type}'`);
    const handler = (
        handlers as unknown as Record<
            string,
            (node: MystNode, definitions: DefinitionMap) => Node
        >
    )[myst.type];
    return handler(myst, definitions);
}
