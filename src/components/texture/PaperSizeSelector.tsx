import type { PaperSize } from "./types";
import { PAPER_SIZES } from "./types";

interface PaperSizeSelectorProps {
  selected: PaperSize;
  customWidth: number;
  customHeight: number;
  onSelect: (size: PaperSize) => void;
  onCustomWidthChange: (width: number) => void;
  onCustomHeightChange: (height: number) => void;
}

export function PaperSizeSelector({
  selected,
  customWidth,
  customHeight,
  onSelect,
  onCustomWidthChange,
  onCustomHeightChange,
}: PaperSizeSelectorProps) {
  const btnStyle = (active: boolean): React.CSSProperties => ({
    backgroundColor: active ? "var(--theme-primary)" : "color-mix(in srgb, var(--theme-text) 8%, transparent)",
    color: active ? "#fff" : "var(--theme-text)",
  });

  return (
    <>
      <style>{`
        .custom-size-input::-webkit-inner-spin-button,
        .custom-size-input::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .custom-size-input {
          -moz-appearance: textfield;
        }
      `}</style>
      <div className="flex items-center gap-2">
        {["letter", "legal", "tabloid"].map((key) => (
          <button
            key={key}
            onClick={() => onSelect(key as PaperSize)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={btnStyle(selected === key)}
          >
            {PAPER_SIZES[key as PaperSize].name}
          </button>
        ))}

        <div className="flex items-center gap-2">
          <button
            onClick={() => onSelect("custom")}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={btnStyle(selected === "custom")}
          >
            Pers.
          </button>

          {selected === "custom" && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="100"
                step="0.1"
                value={customWidth}
                onChange={(e) => onCustomWidthChange(parseFloat(e.target.value) || 1)}
                className="custom-size-input w-14 bg-transparent border-b text-xs focus:outline-none text-center"
                style={{ borderColor: "color-mix(in srgb, var(--theme-primary) 50%, transparent)", color: "var(--theme-primary)" }}
              />
              <span className="text-xs" style={{ color: "var(--theme-muted)" }}>×</span>
              <input
                type="number"
                min="1"
                max="100"
                step="0.1"
                value={customHeight}
                onChange={(e) => onCustomHeightChange(parseFloat(e.target.value) || 1)}
                className="custom-size-input w-14 bg-transparent border-b text-xs focus:outline-none text-center"
                style={{ borderColor: "color-mix(in srgb, var(--theme-primary) 50%, transparent)", color: "var(--theme-primary)" }}
              />
              <span className="text-xs" style={{ color: "var(--theme-muted)" }}>cm</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
