import type { EditorState, Transaction } from "prosemirror-state";
import { Selection } from "prosemirror-state";
import type { Mark, NodeType, MarkType } from "prosemirror-model";
import { setBlockType } from "prosemirror-commands";
import { TableMap } from "prosemirror-tables";

export type FormatPainterState = {
  marks: Mark[];
  blockType: NodeType;
  blockAttrs: Record<string, any>;
} | null;

export function copyFormatPainter(state: EditorState): FormatPainterState {
  const marks = state.storedMarks || state.selection.$from.marks();
  const $from = state.selection.$from;
  const blockType = $from.parent.type;
  const blockAttrs = { ...$from.parent.attrs };
  return {
    marks: Array.isArray(marks) ? Array.from(marks) : [],
    blockType,
    blockAttrs,
  };
}

export function applyFormatPainter(
  painter: FormatPainterState,
  state: EditorState,
  dispatch?: (tr: Transaction) => void
): boolean {
  if (!painter) return false;
  const { marks, blockType, blockAttrs } = painter;
  const { from, to, empty } = state.selection;
  let tr = state.tr;

  if (empty) {
    if (dispatch) dispatch(tr.setStoredMarks(marks));
    return true;
  } else {
    // Change block type for all blocks in selection
    const $from = state.doc.resolve(from);
    const $to = state.doc.resolve(to);
    for (let d = $from.depth; d >= 0; d--) {
      const node = $from.node(d);
      if (node.isTextblock && node.type !== blockType) {
        // Try to set block type for the whole selection
        const setBlock = setBlockType(blockType, blockAttrs);
        if (setBlock(state, dispatch)) {
          // Block type changed, now apply marks
          break;
        }
      }
    }
    // Remove all marks if none, else add marks
    if (marks.length === 0) {
      Object.values(state.schema.marks).forEach((markType) => {
        tr = tr.removeMark(from, to, markType);
      });
    } else {
      marks.forEach((mark) => {
        tr = tr.addMark(from, to, mark);
      });
    }
    if (dispatch) dispatch(tr);
    return true;
  }
}

export function inLastTableCell(state: EditorState) {
    const { $from } = state.selection;
    for (let d = $from.depth; d > 0; d--) {
        const node = $from.node(d);
        if (node.type.name === "table") {
            const table = node;
            const tableMap = TableMap.get(table);
            const cellPos = $from.pos - $from.start(d);
            const cellIndex = tableMap.map.findIndex((pos) => pos === cellPos);
            return cellIndex === tableMap.map.length - 1;
        }
    }
    return false;
}

function canInsertParagraph(stateOrTr: EditorState | Transaction, pos: number) {
    const $pos = stateOrTr.doc.resolve(pos);
    const schema =
        (stateOrTr as EditorState).schema ??
        (stateOrTr as Transaction).doc.type.schema;
    for (let d = $pos.depth; d >= 0; d--) {
        const index = $pos.index(d);
        const parent = $pos.node(d);
        if (
            parent &&
            parent.canReplaceWith(index, index, schema.nodes.paragraph)
        ) {
            return true;
        }
    }
    return false;
}

export function insertParagraphAfterTable() {
    return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
        const { $from } = state.selection;
        for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (node.type.name === "table") {
                const pos = $from.after(d);
                if (dispatch && canInsertParagraph(state, pos)) {
                    const paragraph = state.schema.nodes.paragraph.create();
                    let tr = state.tr.insert(pos, paragraph);
                    const sel = Selection.near(tr.doc.resolve(pos + 1));
                    tr = tr.setSelection(sel);
                    dispatch(tr.scrollIntoView());
                }
                return true;
            }
        }
        return false;
    };
}

export function insertParagraphAfterCodeBlock() {
    return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
        const { $from } = state.selection;
        for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (node.type.name === "code") {
                const pos = $from.after(d);
                if (dispatch) {
                    const paragraph = state.schema.nodes.paragraph.create();
                    let tr = state.tr.insert(pos, paragraph);
                    const sel = Selection.near(tr.doc.resolve(pos + 1));
                    tr = tr.setSelection(sel);
                    dispatch(tr.scrollIntoView());
                }
                return true;
            }
        }
        return false;
    };
}

export function deleteTable(): import("prosemirror-state").Command {
    return (state, dispatch) => {
        const { $from } = state.selection;
        for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (node.type.name === "table") {
                const pos = $from.before(d);
                if (dispatch) {
                    let tr = state.tr.delete(pos, pos + node.nodeSize);
                    let selPos = Math.min(pos, tr.doc.content.size - 1);
                    const nodeAtSel = tr.doc.nodeAt(selPos);
                    if (!nodeAtSel || !nodeAtSel.type.isTextblock) {
                        const paragraph = state.schema.nodes.paragraph.create();
                        tr = tr.insert(selPos, paragraph);
                        selPos++;
                    }
                    tr = tr.setSelection(
                        Selection.near(tr.doc.resolve(selPos)),
                    );
                    dispatch(tr.scrollIntoView());
                }
                return true;
            }
        }
        const indexBefore = $from.index($from.depth - 1);
        if (indexBefore > 0) {
            const beforePos = $from.before($from.depth - 1);
            const nodeBefore = state.doc.nodeAt(beforePos);
            if (nodeBefore && nodeBefore.type.name === "table") {
                if (dispatch) {
                    let tr = state.tr.delete(
                        beforePos,
                        beforePos + nodeBefore.nodeSize,
                    );
                    const selPos = Math.min(beforePos, tr.doc.content.size - 1);
                    if (
                        !tr.doc.nodeAt(selPos) ||
                        tr.doc.nodeAt(selPos)?.type.isTextblock === false
                    ) {
                        const paragraph = state.schema.nodes.paragraph.create();
                        if (canInsertParagraph(tr, selPos)) {
                            tr = tr.insert(selPos, paragraph);
                        }
                    }
                    tr = tr.setSelection(
                        Selection.near(tr.doc.resolve(selPos)),
                    );
                    dispatch(tr.scrollIntoView());
                }
                return true;
            }
        }
        return false;
    };
}

/**
 * Determine if the current selection is inside a bullet or ordered list.
 * Returns "bullet", "ordered", or null if not in a list.
 */
export function getCurrentListType(
    state: EditorState,
): "bullet" | "ordered" | null {
    const { $from } = state.selection;
    for (let d = $from.depth; d > 0; d--) {
        const node = $from.node(d);
        if (node.type.name === "list") {
            return node.attrs.ordered ? "ordered" : "bullet";
        }
    }
    return null;
}

/**
 * Check if a given mark type is active in the current selection.
 * Returns true if the mark is active, false otherwise.
 */
export function markActive(state: EditorState, type: MarkType) {
    const { from, $from, to, empty } = state.selection;
    if (empty) return !!type.isInSet(state.storedMarks || $from.marks());
    return state.doc.rangeHasMark(from, to, type);
}
