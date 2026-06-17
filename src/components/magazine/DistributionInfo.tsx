const cardStyle: React.CSSProperties = {
  backgroundColor: "color-mix(in srgb, var(--theme-bg) 50%, transparent)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  borderColor: "color-mix(in srgb, var(--theme-primary) 20%, transparent)",
};

export function DistributionInfo({ blanks, total, hasBackCover }: { blanks: number; total: number; hasBackCover: boolean }) {
  return (
    <div className="rounded-2xl border p-4 flex items-center gap-3 text-sm" style={cardStyle}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)", color: "var(--theme-primary)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      </div>
      <p style={{ color: "var(--theme-muted)" }}>
        {blanks > 0
          ? `Se agregaron ${blanks} pagina(s) en blanco para completar el cuadernillo (multiplo de 4).`
          : `Distribucion optima: ${total} paginas forman cuadernillos completos.`}
        {hasBackCover && " Portada = img 1, Contraportada = img final."}
      </p>
    </div>
  );
}
