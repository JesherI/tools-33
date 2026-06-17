import type { SpreadPreview } from "./types";

const cardStyle: React.CSSProperties = {
  backgroundColor: "color-mix(in srgb, var(--theme-bg) 50%, transparent)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  borderColor: "color-mix(in srgb, var(--theme-primary) 20%, transparent)",
};

export function SpreadsGrid({ spreads }: { spreads: SpreadPreview[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {spreads.map((sp) => (
        <div
          key={sp.spreadNum}
          className="rounded-2xl border overflow-hidden"
          style={cardStyle}
        >
          <div className="px-3 py-1.5 border-b flex items-center justify-between" style={{ borderColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)" }}>
            <span className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: "var(--theme-primary)" }}>
              Pliego {sp.spreadNum}
            </span>
            <span className="text-[9px]" style={{ color: "var(--theme-muted)" }}>
              Pag {sp.left.id} · Pag {sp.right.id}
            </span>
          </div>
          <div className="flex overflow-hidden" style={{ height: 140 }}>
            <div className="flex-1 flex items-center justify-center relative">
              {!sp.left.isBlank && sp.left.filePath ? (
                <img src={sp.left.thumbnailUrl || ""} alt="" className="w-full h-full object-contain" draggable={false} />
              ) : (
                <span className="text-[10px] opacity-30" style={{ color: "var(--theme-text)" }}>BLANCO</span>
              )}
              <span className="absolute bottom-0.5 left-0.5 text-[8px] font-semibold px-1 rounded" style={{ backgroundColor: "color-mix(in srgb, var(--theme-bg) 70%, transparent)", color: "var(--theme-primary)" }}>Pag {sp.left.id}</span>
            </div>
            <div className="w-px" style={{ backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)" }} />
            <div className="flex-1 flex items-center justify-center relative">
              {!sp.right.isBlank && sp.right.filePath ? (
                <img src={sp.right.thumbnailUrl || ""} alt="" className="w-full h-full object-contain" draggable={false} />
              ) : (
                <span className="text-[10px] opacity-30" style={{ color: "var(--theme-text)" }}>BLANCO</span>
              )}
              <span className="absolute bottom-0.5 right-0.5 text-[8px] font-semibold px-1 rounded" style={{ backgroundColor: "color-mix(in srgb, var(--theme-bg) 70%, transparent)", color: "var(--theme-primary)" }}>Pag {sp.right.id}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
