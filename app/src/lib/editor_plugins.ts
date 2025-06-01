import { Plugin } from "prosemirror-state";

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
