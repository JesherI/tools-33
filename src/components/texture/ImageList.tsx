import type { TextureImage } from "./types";

interface ImageListProps {
  images: TextureImage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

export function ImageList({ images, selectedId, onSelect, onRemove }: ImageListProps) {
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin space-y-1.5 pr-1">
      {images.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm" style={{ color: "var(--theme-muted)" }}>No hay imágenes</p>
        </div>
      ) : (
        images.map((img) => {
          const active = selectedId === img.id;
          return (
            <div
              key={img.id}
              className="group relative flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors duration-150"
              style={{
                backgroundColor: active
                  ? "var(--theme-primary)"
                  : "color-mix(in srgb, var(--theme-text) 8%, transparent)",
              }}
              onClick={() => onSelect(img.id)}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--theme-text) 14%, transparent)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--theme-text) 8%, transparent)";
              }}
            >
              <div className="w-9 h-9 rounded-md overflow-hidden flex-shrink-0 bg-black/10">
                <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-xs truncate"
                  style={{ color: active ? "#fff" : "var(--theme-text)" }}
                >
                  {img.name}
                </p>
                <p
                  className="text-[10px]"
                  style={{ color: active ? "rgba(255,255,255,0.7)" : "var(--theme-muted)" }}
                >
                  {(img.config.scale * 100).toFixed(0)}%
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(img.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded-md transition-all"
                style={{ color: active ? "#fff" : "#ef4444" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
