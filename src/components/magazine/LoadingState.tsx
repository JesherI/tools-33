export function LoadingState({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="w-10 h-10 rounded-full border-2 border-transparent border-t-current animate-spin" style={{ color: "var(--theme-primary)" }} />
      <p className="text-sm" style={{ color: "var(--theme-muted)" }}>
        {total > 0 ? `Cargando imagenes... ${current}/${total}` : "Cargando imagenes..."}
      </p>
      {total > 0 && (
        <div className="w-64 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--theme-border), transparent 50%)" }}>
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: "var(--theme-primary)" }} />
        </div>
      )}
    </div>
  );
}
