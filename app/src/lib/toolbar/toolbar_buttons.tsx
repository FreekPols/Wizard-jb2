import { redo, undo } from "prosemirror-history";
import {
  blockquoteActive,
  decreaseIndent,
  increaseIndent,
  toggleBlockquote,
  toggleBold,
  toggleInlineCode,
  toggleItalic,
  toggleStrikethrough,
  toggleSubscript,
  toggleSuperscript,
} from "./toolbar_commands";
import { copyFormatPainter, applyFormatPainter, FormatPainterState } from "./toolbar_utils";
import { useDispatchCommand, useEditorState } from "../../components/Editor";
import { ToolbarButton } from "../../components/toolbar/ToolbarButton";
import { createSignal, JSX } from "solid-js";
import { Mark } from "prosemirror-model";
import { markActive } from "./toolbar_utils";

function buttonValuesToJSXElement(buttonValues: {
  icon: string;
  label: string;
  onClick: () => boolean | void;
  active: () => boolean | undefined;
}) {
  return (
    <ToolbarButton
      icon={buttonValues.icon}
      label={buttonValues.label}
      onClick={buttonValues.onClick}
      active={buttonValues.active?.()}
    />
  );
}

export const toolbarButtons: {
  undoButton?: JSX.Element;
  redoButton?: JSX.Element;
  formatButton?: JSX.Element;
  boldButton?: JSX.Element;
  italicsButton?: JSX.Element;
  strikeThroughButton?: JSX.Element;
  superscriptButton?: JSX.Element;
  subscriptButton?: JSX.Element;
  indentButton?: JSX.Element;
  outdentButton?: JSX.Element;
  quoteButton?: JSX.Element;
  codeButton?: JSX.Element;
  createButtons: () => void;
} = {
  createButtons() {
    const editorStateAccessor = useEditorState();
    const dispatchCommand = useDispatchCommand();
    const [_formatMarks, _setFormatMarks] = createSignal<Mark[] | null>(null);
    const [formatPainter, setFormatPainter] = createSignal<FormatPainterState>(
      null,
    );

    // Handles Format Painter button: copy or apply formatting
    function handleFormatPainter() {
      const state = editorStateAccessor && editorStateAccessor();
      if (!state) return;

      if (formatPainter() === null) {
        setFormatPainter(copyFormatPainter(state));
      } else {
        dispatchCommand((state, dispatch) =>
          applyFormatPainter(formatPainter(), state, dispatch)
        );
        setFormatPainter(null);
      }
    }

    this.undoButton = buttonValuesToJSXElement({
      icon: "bi-arrow-counterclockwise",
      label: "Undo",
      onClick: () => dispatchCommand(undo),
      active: () => undefined,
    });
    this.redoButton = buttonValuesToJSXElement({
      icon: "bi-arrow-clockwise",
      label: "Redo",
      onClick: () => dispatchCommand(redo),
      active: () => undefined,
    });
    this.formatButton = buttonValuesToJSXElement({
      icon: "bi-brush",
      label: "Format Painter",
      onClick: () => handleFormatPainter(),
      active: () => formatPainter() !== null,
    });
    this.boldButton = buttonValuesToJSXElement({
      icon: "bi-type-bold",
      label: "Bold",
      onClick: () => dispatchCommand(toggleBold),
      active: () =>
        editorStateAccessor
          ? markActive(
              editorStateAccessor(),
              editorStateAccessor().schema.marks.strong,
            )
          : false,
    });
    this.italicsButton = buttonValuesToJSXElement({
      icon: "bi-type-italic",
      label: "Italic",
      onClick: () => dispatchCommand(toggleItalic),
      active: () =>
        editorStateAccessor
          ? markActive(
              editorStateAccessor(),
              editorStateAccessor().schema.marks.emphasis,
            )
          : false,
    });
    this.strikeThroughButton = buttonValuesToJSXElement({
      icon: "bi-type-strikethrough",
      label: "Strikethrough",
      onClick: () => dispatchCommand(toggleStrikethrough),
      active: () =>
        editorStateAccessor
          ? markActive(
              editorStateAccessor(),
              editorStateAccessor().schema.marks.strikethrough,
            )
          : false,
    });
    this.superscriptButton = buttonValuesToJSXElement({
      icon: "bi-superscript",
      label: "Superscript",
      onClick: () => dispatchCommand(toggleSuperscript),
      active: () =>
        editorStateAccessor
          ? markActive(
              editorStateAccessor(),
              editorStateAccessor().schema.marks.superscript,
            )
          : false,
    });
    this.subscriptButton = buttonValuesToJSXElement({
      icon: "bi-subscript",
      label: "Subscript",
      onClick: () => dispatchCommand(toggleSubscript),
      active: () =>
        editorStateAccessor
          ? markActive(
              editorStateAccessor(),
              editorStateAccessor().schema.marks.subscript,
            )
          : false,
    });
    this.indentButton = buttonValuesToJSXElement({
      icon: "bi-caret-right",
      label: "Increase Indent",
      onClick: () => dispatchCommand(increaseIndent()),
      active: () => undefined,
    });
    this.outdentButton = buttonValuesToJSXElement({
      icon: "bi-caret-left",
      label: "Decrease Indent",
      onClick: () => dispatchCommand(decreaseIndent()),
      active: () => undefined,
    });
    this.quoteButton = buttonValuesToJSXElement({
      icon: "bi-blockquote-left",
      label: "Blockquote",
      onClick: () => dispatchCommand(toggleBlockquote),
      active: () =>
        editorStateAccessor ? blockquoteActive(editorStateAccessor()) : false,
    });
    this.codeButton = buttonValuesToJSXElement({
      // Set the icon and label
      icon: "bi-code",
      label: "Inline Code",
      // When clicked toggle the inline code
      onClick: () => dispatchCommand(toggleInlineCode),
      // Use markActive to check if the mark is already active, from bold/italic
      active: () =>
        editorStateAccessor
          ? markActive(
              editorStateAccessor(),
              editorStateAccessor().schema.marks.code,
            )
          : false,
    });
  },
};
