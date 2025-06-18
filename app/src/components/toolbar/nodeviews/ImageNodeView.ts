import { NodeView, EditorView } from "prosemirror-view";
import { Node as ProseMirrorNode } from "prosemirror-model";

export class ImageNodeView implements NodeView {
    dom: HTMLElement;
    img: HTMLImageElement;
    view: EditorView;
    getPos: () => number;

    constructor(node: ProseMirrorNode, view: EditorView, getPos: () => number) {
        this.view = view;
        this.getPos = getPos;

        this.dom = document.createElement("span");
        this.dom.className = "image-node";

        this.img = document.createElement("img");
        this.img.src = node.attrs.url;
        this.img.alt = node.attrs.alt || "";
        this.img.title = node.attrs.title || "";
        this.img.style.width = node.attrs.width || "50%";
        this.dom.appendChild(this.img);

        const handle = document.createElement("div");
        handle.className = "resize-handle";
        this.dom.appendChild(handle);

        this.img.addEventListener("click", (e) => {
            e.stopPropagation();
            handle.style.display = "block";
        });
        document.addEventListener("click", (e) => {
            if (!this.dom.contains(e.target as Node)) {
                handle.style.display = "none";
            }
        });

        let startX = 0;
        let startWidth = 0;
        handle.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            startX = e.clientX;
            startWidth = this.img.offsetWidth;

            const onMouseMove = (moveEvent: MouseEvent) => {
                const diff = moveEvent.clientX - startX;
                const newWidth = Math.max(40, startWidth + diff);
                this.img.style.width = newWidth + "px";
            };

            const onMouseUp = (_upEvent: MouseEvent) => {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
                const pos = this.getPos();
                const node = this.view.state.doc.nodeAt(pos);
                if (node) {
                    const newWidth = this.img.offsetWidth + "px";
                    const tr = this.view.state.tr.setNodeMarkup(
                        pos,
                        undefined,
                        {
                            ...node.attrs,
                            width: newWidth,
                        },
                    );
                    this.view.dispatch(tr);
                }
            };

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });
    }

    update(node: ProseMirrorNode) {
        this.img.src = node.attrs.url;
        this.img.alt = node.attrs.alt || "";
        this.img.title = node.attrs.title || "";
        this.img.style.width = node.attrs.width || "50%";
        return true;
    }
}
