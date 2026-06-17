export function GeneratingState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-full border-2 border-transparent border-t-current animate-spin" style={{ color: "var(--theme-primary)" }} />
      <p className="text-base font-medium" style={{ color: "var(--theme-primary)" }}>Generando PDF...</p>
      <p className="text-sm" style={{ color: "var(--theme-muted)" }}>Componiendo paginas...</p>
    </div>
  );
}
