/* @refresh reload */
import { Schema } from "prosemirror-model";

import type {} from "myst-spec";
import type {} from "mdast";
import { boolean, integer, oneOf, string } from "./utils";

// NOTE: Schema inspired by [prosemirror-markdown](https://github.com/ProseMirror/prosemirror-markdown/blob/master/src/schema.ts).
// Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others
// Licensed under the MIT (Expat) License; SPDX identifier: MIT.

export const schema = new Schema({
    nodes: {
        root: {
            content: "(block | blockBreak | flowContent)+ | listContent+",
        },
        block: {
            content: "flowContent+ | listContent+",
        },
        blockBreak: {},
        paragraph: {
            group: "flowContent",
            content: "phrasingContent*",
            parseDOM: [{ tag: "p" }],
            toDOM(_node) {
                return ["p", 0];
            },
        },
        definition: {
            group: "flowContent",
            toDOM(_node) {
                return ["div", { class: "definition" }, 0];
            },
        },
        heading: {
            defining: true,
            content: "phrasingContent*",
            attrs: {
                level: {
                    default: 1,
                    validate(val) {
                        return Number.isInteger(val) && val >= 1 && val <= 6;
                    },
                },
            },
            parseDOM: [
                { tag: "h1", attrs: { level: 1 } },
                { tag: "h2", attrs: { level: 2 } },
                { tag: "h3", attrs: { level: 3 } },
                { tag: "h4", attrs: { level: 4 } },
                { tag: "h5", attrs: { level: 5 } },
                { tag: "h6", attrs: { level: 6 } },
            ],
            group: "flowContent",
            toDOM(node) {
                return ["h" + node.attrs.level, 0];
            },
        },
        thematicBreak: {
            group: "flowContent",
            parseDOM: [{ tag: "hr" }],
            toDOM(_node) {
                return ["hr", 0];
            },
        },
        blockquote: {
            group: "flowContent",
            toDOM(_node) {
                return ["blockquote", 0];
            },
        },
        list: {
            attrs: {
                ordered: boolean({ default: false }),
                start: integer({ default: 1 }),
                spread: boolean({ default: false }),
            },
            group: "flowContent",
            content: "listContent",

            parseDOM: [
                {
                    tag: "ol",
                    getAttrs(dom) {
                        return {
                            start: dom.hasAttribute("start")
                                ? +dom.getAttribute("start")!
                                : 1,
                            spread: dom.hasAttribute("data-spread"),
                            ordered: true,
                        };
                    },
                },
                {
                    tag: "ul",
                    getAttrs(dom) {
                        return {
                            spread: (dom as HTMLElement).hasAttribute(
                                "data-spread",
                            ),
                            ordered: false,
                        };
                    },
                },
            ],
            toDOM({ attrs }) {
                return [
                    attrs.ordered ? "ol" : "ul",
                    {
                        "data-spread": attrs.spread ? "true" : null,
                    },
                    0,
                ];
            },
        },
        listItem: {
            content: "",
            parseDOM: [{ tag: "li" }],
            group: "listContent",
        },
        html: {
            group: "flowContent",
        },
        code: {
            attrs: {
                lang: string({ default: "text" }),
                meta: string({ optional: true }),
                class: string({ default: "" }),
                showLineNumbers: boolean({ default: false }),
                startingLineNumber: integer({ default: 1 }),
                emphasizeLines: {
                    validate(val) {
                        return (
                            Array.isArray(val) &&
                            val.find((x) => !Number.isInteger(x)) === undefined
                        );
                    },
                },
            },
            parseDOM: [
                {
                    tag: "pre",
                    preserveWhitespace: "full",
                    getAttrs(node) {
                        console.log("getAttrs");
                        return {
                            lang: [...node.classList]
                                .find((x) => x.startsWith("language-"))
                                ?.replace("language-", ""),
                            meta: node.getAttribute("data-meta") ?? undefined,
                            emphasizeLines:
                                node
                                    .getAttribute("data-emphasize-lines")
                                    ?.split(",")
                                    .map((x) => parseInt(x)) ?? [],
                        };
                    },
                },
            ],
            code: true,
            defining: true,
            toDOM(node) {
                return [
                    "pre",
                    { class: `language-${node.attrs.lang}` },
                    ["code", 0],
                ];
            },
            group: "flowContent",
            content: "phrasingContent*",
        },
        // comment: {
        //     content: "text*",
        //     toDOM(_node) {
        //         return ["pre", { class: "comment" }, 0];
        //     },
        //     group: "flowContent",
        // },
        target: {
            attrs: {
                label: string(),
            },
            group: "flowContent",
        },
        directive: {
            attrs: {
                name: string(),
                args: string(),
                value: string(),
            },
            group: "flowContent",
        },
        admonition: {
            attrs: {
                kind: oneOf({
                    values: [
                        "attention",
                        "caution",
                        "danger",
                        "error",
                        "hint",
                        "important",
                        "note",
                        "seealso",
                        "tip",
                        "warning",
                    ] as const,
                }),
                class: string({ optional: true }),
            },
            group: "flowContent",
        },
        container: {
            attrs: {
                kind: oneOf({ values: ["figure", "table"] as const }),
            },
            group: "flowContent",
        },
        math: {
            attrs: {
                enumerated: boolean({}),
            },
            group: "flowContent",
        },
        table: {
            group: "flowContent",
        },
        footnoteDefinition: {
            group: "flowContent",
        },
        text: {
            group: "phrasingContent",
            inline: true,
        },
    },
    topNode: "root",
});
