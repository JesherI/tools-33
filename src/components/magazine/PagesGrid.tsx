import type { PageItem } from "./types";

export function PagesGrid({ pages }: { pages: PageItem[] }) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
      {pages.map((p) => (
        <div
          key={p.id}
          className="aspect-[612/792] rounded-lg border overflow-hidden relative flex items-center justify-center text-center"
          style={{
            borderColor: p.isBlank
              ? "color-mix(in srgb, var(--theme-border), transparent 30%)"
              : "color-mix(in srgb, var(--theme-primary) 25%, transparent)",
            backgroundColor: p.isBlank
              ? "color-mix(in srgb, var(--theme-bg) 40%, transparent)"
              : "color-mix(in srgb, var(--theme-bg) 30%, transparent)",
          }}
        >
          {!p.isBlank && p.filePath ? (
            <img
              src={p.thumbnailUrl || ""}
              alt={`Pagina ${p.id}`}
              className="w-full h-full object-contain"
              draggable={false}
            />
          ) : (
            <span className="text-[10px] font-medium opacity-40" style={{ color: "var(--theme-text)" }}>BLANCO</span>
          )}
          <span
            className="absolute bottom-0.5 left-0.5 text-[8px] font-semibold px-1 py-0.5 rounded"
            style={{
              backgroundColor: "color-mix(in srgb, var(--theme-bg) 70%, transparent)",
              color: p.isBlank ? "var(--theme-muted)" : "var(--theme-primary)",
            }}
          >
            Pag {p.id}
          </span>
        </div>
      ))}
    </div>
  );
}
