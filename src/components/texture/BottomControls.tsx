import { EditableValue } from "./EditableValue";
import type { TextureImage } from "./types";

interface BottomControlsProps {
  image: TextureImage | null;
  onUpdate: (id: string, config: Partial<TextureImage["config"]>) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

export function BottomControls({ image, onUpdate, zoom, onZoomChange }: BottomControlsProps) {
  const adjustZoom = (delta: number) => {
    const newZoom = Math.round((zoom + delta) * 100) / 100;
    onZoomChange(Math.max(0.2, Math.min(1.5, newZoom)));
  };

  const iconBtnStyle: React.CSSProperties = {
    backgroundColor: "color-mix(in srgb, var(--theme-text) 10%, transparent)",
    color: "var(--theme-text)",
  };

  return (
    <div
      className="flex items-center gap-4 px-4 py-2.5 border-t"
      style={{
        backgroundColor: "color-mix(in srgb, var(--theme-bg) 60%, transparent)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderColor: "color-mix(in srgb, var(--theme-primary) 12%, transparent)",
      }}
    >
      {image && (
        <>
          {/* Escala */}
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--theme-muted)" }}>Escala</span>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.05"
              value={image.config.scale}
              onChange={(e) => onUpdate(image.id, { scale: parseFloat(e.target.value) })}
              className="w-24 h-1.5 rounded-lg appearance-none cursor-pointer"
              style={{ accentColor: "var(--theme-primary)" }}
            />
            <EditableValue
              value={Math.round(image.config.scale * 100)}
              suffix="%"
              min={10}
              max={300}
              onChange={(val) => onUpdate(image.id, { scale: val / 100 })}
              className="w-9"
            />
          </div>

          <div className="w-px h-5" style={{ backgroundColor: "color-mix(in srgb, var(--theme-text) 10%, transparent)" }} />

          {/* Rotación */}
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--theme-muted)" }}>Rotar</span>
            <input
              type="range"
              min="0"
              max="360"
              step="5"
              value={image.config.rotation}
              onChange={(e) => onUpdate(image.id, { rotation: parseInt(e.target.value) })}
              className="w-24 h-1.5 rounded-lg appearance-none cursor-pointer"
              style={{ accentColor: "var(--theme-primary)" }}
            />
            <EditableValue
              value={image.config.rotation}
              suffix="°"
              min={0}
              max={360}
              step={5}
              onChange={(val) => onUpdate(image.id, { rotation: val })}
              className="w-7"
            />
          </div>

          <div className="w-px h-5" style={{ backgroundColor: "color-mix(in srgb, var(--theme-text) 10%, transparent)" }} />

          {/* Opacidad */}
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--theme-muted)" }}>Opac</span>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={image.config.opacity}
              onChange={(e) => onUpdate(image.id, { opacity: parseInt(e.target.value) })}
              className="w-24 h-1.5 rounded-lg appearance-none cursor-pointer"
              style={{ accentColor: "var(--theme-primary)" }}
            />
            <EditableValue
              value={image.config.opacity}
              suffix="%"
              min={10}
              max={100}
              step={5}
              onChange={(val) => onUpdate(image.id, { opacity: val })}
              className="w-7"
            />
          </div>

          <div className="w-px h-5" style={{ backgroundColor: "color-mix(in srgb, var(--theme-text) 10%, transparent)" }} />

          {/* Voltear */}
          <label className="flex items-center gap-2 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                checked={image.config.flipAlternate}
                onChange={(e) => onUpdate(image.id, { flipAlternate: e.target.checked })}
                className="peer sr-only"
              />
              <div
                className="w-6 h-6 rounded-lg border-2 transition-all duration-200 flex items-center justify-center"
                style={{
                  backgroundColor: image.config.flipAlternate ? "var(--theme-primary)" : "color-mix(in srgb, var(--theme-bg) 40%, transparent)",
                  borderColor: image.config.flipAlternate ? "var(--theme-primary)" : "color-mix(in srgb, var(--theme-text) 20%, transparent)",
                }}
              >
                {image.config.flipAlternate && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-xs" style={{ color: "var(--theme-text)" }}>Voltear</span>
          </label>

          <div className="flex-1" />
        </>
      )}

      {!image && <div className="flex-1" />}

      {/* Zoom con botones +/- */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => adjustZoom(-0.05)}
          className="w-6 h-6 flex items-center justify-center rounded text-xs transition-all"
          style={iconBtnStyle}
        >
          −
        </button>
        <span className="text-xs w-8 text-center" style={{ color: "var(--theme-muted)" }}>{(zoom * 100).toFixed(0)}%</span>
        <button
          onClick={() => adjustZoom(0.05)}
          className="w-6 h-6 flex items-center justify-center rounded text-xs transition-all"
          style={iconBtnStyle}
        >
          +
        </button>
      </div>
    </div>
  );
}
