import {
    Plugin,
    Transaction,
    EditorState,
    NodeSelection,
    TextSelection,
} from "prosemirror-state";
import { keymap } from "prosemirror-keymap";
import {
    splitListItem,
    sinkListItem,
    liftListItem,
} from "prosemirror-schema-list";
import { Schema } from "prosemirror-model";
import { chainCommands } from "prosemirror-commands";
import {
    toggleBold,
    toggleItalic,
    toggleStrikethrough,
    toggleSuperscript,
    toggleSubscript,
} from "./toolbar_commands";
import {
    inLastTableCell,
    insertParagraphAfterTable,
    insertParagraphAfterCodeBlock,
    deleteTable,
} from "./toolbar_utils";

// --- Plugins ---

export function preserveMarksPlugin() {
    return new Plugin({
        appendTransaction(transactions, oldState, newState) {
            const lastTr = transactions[transactions.length - 1];
            if (!lastTr || !lastTr.docChanged) return null;
            const { $from, empty } = newState.selection;
            if (!empty) return null;
            if ($from.parentOffset !== 0) return null;
            const prevStored = oldState.storedMarks;
            const prevMarks =
                prevStored && prevStored.length
                    ? prevStored
                    : oldState.selection.$from.marks();
            if (!prevMarks || prevMarks.length === 0) return null;
            return newState.tr.setStoredMarks(prevMarks);
        },
    });
}

// --- Keymaps ---

export function formattingKeymap(_schema: Schema) {
  return keymap({
    "Mod-b": toggleBold,
    "Mod-i": toggleItalic,
    "Mod-Shift-x": toggleStrikethrough,
    "Mod-.": toggleSuperscript,
    "Mod-,": toggleSubscript,
  });
}

export function customListKeymap(schema: Schema) {
    return keymap({
        Enter: (state, dispatch) => {
            if (splitListItem(schema.nodes.listItem)(state, dispatch))
                return true;
            return liftListItem(schema.nodes.listItem)(state, dispatch);
        },
        Tab: sinkListItem(schema.nodes.listItem),
        "Shift-Tab": liftListItem(schema.nodes.listItem),
    });
}

export function tableAndCodeExitKeymap(schema: Schema) {
  return keymap({
    "Mod-Enter": chainCommands(
      (state, dispatch) => {
        if (inLastTableCell(state)) {
          return insertParagraphAfterTable()(state, dispatch);
        }
        if (state.selection.$from.parent.type.name === "code") {
          return insertParagraphAfterCodeBlock()(state, dispatch);
        }
        return false;
      }
    ),
  });
}

export function tableDeleteKeymap() {
    return keymap({
        "Mod-Backspace": deleteTable(),
        "Mod-Delete": deleteTable(),
    });
}

export function mathDeleteKeymap(schema: Schema) {
    return keymap({
        "Mod-Backspace": (state, dispatch) => {
            const { $from } = state.selection;
            for (let d = $from.depth; d > 0; d--) {
                const node = $from.node(d);
                if (node.type === schema.nodes.math) {
                    const pos = $from.before(d);
                    if (dispatch) {
                        let tr = state.tr.setSelection(
                            NodeSelection.create(state.doc, pos),
                        );
                        tr = tr.deleteSelection();
                        dispatch(tr.scrollIntoView());
                    }
                    return true;
                }
            }
            return false;
        },
        "Mod-Delete": (state, dispatch) => {
            const { $from } = state.selection;
            for (let d = $from.depth; d > 0; d--) {
                const node = $from.node(d);
                if (node.type === schema.nodes.math) {
                    const pos = $from.before(d);
                    if (dispatch) {
                        let tr = state.tr.setSelection(
                            NodeSelection.create(state.doc, pos),
                        );
                        tr = tr.deleteSelection();
                        dispatch(tr.scrollIntoView());
                    }
                    return true;
                }
            }
            return false;
        },
    });
}

export function codeBlockKeymap(schema: Schema) {
    return keymap({
        "Shift-Enter": (state, dispatch) => {
            const { $from } = state.selection;
            for (let d = $from.depth; d > 0; d--) {
                if ($from.node(d).type === schema.nodes.code) {
                    if (dispatch) {
                        dispatch(
                            state.tr
                                .replaceSelectionWith(
                                    schema.nodes.break.create(),
                                )
                                .scrollIntoView(),
                        );
                    }
                    return true;
                }
            }
            // Always insert a break if not in code as well
            if (dispatch) {
                dispatch(
                    state.tr
                        .replaceSelectionWith(
                            schema.nodes.break.create(),
                        )
                        .scrollIntoView(),
                );
            }
            return true;
        },
        Tab: (state, dispatch) => {
            const { $from, $to } = state.selection;
            for (let d = $from.depth; d > 0; d--) {
                if ($from.node(d).type === schema.nodes.code) {
                    if (dispatch) {
                        let tr = state.tr;
                        if (state.selection.empty) {
                            tr = tr.insertText("  ");
                        } else {
                            const start = $from.pos;
                            const end = $to.pos;
                            let text = state.doc.textBetween(start, end, "\n");
                            text = text.replace(/^/gm, "  ");
                            tr = tr.replaceSelectionWith(
                                state.schema.text(text),
                            );
                            tr = tr.setSelection(
                                TextSelection.create(
                                    tr.doc,
                                    start,
                                    start + text.length,
                                ),
                            );
                        }
                        dispatch(tr.scrollIntoView());
                    }
                    return true;
                }
            }
            return false;
        },
        "Shift-Tab": (state, dispatch) => {
            const { $from, $to } = state.selection;
            for (let d = $from.depth; d > 0; d--) {
                if ($from.node(d).type === schema.nodes.code) {
                    if (dispatch) {
                        let tr = state.tr;
                        const start = $from.pos;
                        const end = $to.pos;
                        let text = state.doc.textBetween(start, end, "\n");
                        text = text.replace(/^ {1,2}/gm, "");
                        tr = tr.replaceSelectionWith(state.schema.text(text));
                        tr = tr.setSelection(
                            TextSelection.create(
                                tr.doc,
                                start,
                                start + text.length,
                            ),
                        );
                        dispatch(tr.scrollIntoView());
                    }
                    return true;
                }
            }
            return false;
        },
        "(": autoClosePair("(", ")", schema),
        "[": autoClosePair("[", "]", schema),
        "{": autoClosePair("{", "}", schema),
        '"': autoClosePair('"', '"', schema),
        "'": autoClosePair("'", "'", schema),
        "`": autoClosePair("`", "`", schema),
    });
}

function autoClosePair(open: string, close: string, schema: Schema) {
    return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
        const { $from } = state.selection;
        for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type === schema.nodes.code) {
                if (dispatch) {
                    const tr = state.tr.insertText(open + close);
                    const pos = state.selection.from + 1;
                    dispatch(
                        tr.setSelection(TextSelection.create(tr.doc, pos)),
                    );
                }
                return true;
            }
        }
        return false;
    };
}
