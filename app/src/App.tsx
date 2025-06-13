import "katex/dist/katex.min.css";
import { createResource } from "solid-js";
import { Editor } from "./components/Editor";
import Toolbar from "./components/toolbar/toolbar";
import { parseMyst } from "./lib/parser";
import { schema } from "./lib/schema";
import { HintTooltip } from "./components/toolbar/HintTooltip";
//import "prosemirror-view/style/prosemirror.css";

/** The [SolidJS] application. This is mounted to the DOM by the `render()` function.
 * This is the top-level entry point for the application.
 *
 * [SolidJS]: https://docs.solidjs.com
 */
export default function App() {
  return (
    <>
      <Editor schema={schema}>
        <Toolbar />
      </Editor>
      <HintTooltip />
    </>
  );
}
