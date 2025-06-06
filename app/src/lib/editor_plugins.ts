import { Plugin } from "prosemirror-state";
import { keymap } from "prosemirror-keymap";
import {
    splitListItem,
    sinkListItem,
    liftListItem,
} from "prosemirror-schema-list";
import { Schema } from "prosemirror-model";

// When pressing Enter, the marks at the cursor are lost on the new line.
// This plugin preserves the marks

export function preserveMarksPlugin() {
    return new Plugin({
        appendTransaction(transactions, oldState, newState) {
            const lastTr = transactions[transactions.length - 1];
            if (!lastTr || !lastTr.docChanged) return null;

            // Only run for cursor selections
            const { $from, empty } = newState.selection;
            if (!empty) return null;

            // Only run if a new textblock was created (usually Enter)
            if ($from.parentOffset !== 0) return null;

            // Prefer stored marks from oldState, otherwise use marks at cursor
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

export function customListKeymap(schema: Schema) {
    return keymap({
        Enter: (state, dispatch) => {
            // Try to split the list item (new item)
            if (splitListItem(schema.nodes.listItem)(state, dispatch))
                return true;
            // If not possible (empty item), lift out of the list (end the list)
            return liftListItem(schema.nodes.listItem)(state, dispatch);
        },
        Tab: sinkListItem(schema.nodes.listItem),
        "Shift-Tab": liftListItem(schema.nodes.listItem),
    });
}
