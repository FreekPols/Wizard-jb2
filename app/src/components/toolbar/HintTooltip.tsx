import { createSignal, Show, onCleanup } from "solid-js";

export const [hintTooltip, setHintTooltip] = createSignal<{
  text: string;
  top: number;
  left: number;
  visible: boolean;
}>({ text: "", top: 0, left: 0, visible: false });

export function showHintTooltip(
  text: string,
  top: number,
  left: number,
) {
  setHintTooltip({ text, top, left, visible: true });
}

export function hideHintTooltip() {
  setHintTooltip((t) => ({ ...t, visible: false }));
}

export function HintTooltip() {
  window.addEventListener("scroll", hideHintTooltip);
  onCleanup(() => window.removeEventListener("scroll", hideHintTooltip));

  return (
    <Show when={hintTooltip().visible}>
      <div
        class="hint-tooltip-popup"
        style={{
          position: "absolute",
          top: `${hintTooltip().top}px`,
          left: `${hintTooltip().left}px`,
          "z-index": 99999,
          "pointer-events": "none",
        }}
      >
        <div class="hint-tooltip">{hintTooltip().text}</div>
      </div>
    </Show>
  );
}
