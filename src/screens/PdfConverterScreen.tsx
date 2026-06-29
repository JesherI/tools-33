import { usePdfConverter } from "../hooks/usePdfConverter";

const pdfIcon = (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const zipIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const imageIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const checkIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const closeIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function PdfConverterScreen() {
  const {
    phase,
    pdfPath,
    format,
    totalPages,
    currentPage,
    zipSizeBytes,
    error,
    alert,
    isDragging,
    pickPdf,
    setFormat,
    startConversion,
    reset,
    hideAlert,
  } = usePdfConverter();

  const formatLabel = format.toUpperCase();
  const zipSizeMb = zipSizeBytes > 0
    ? (zipSizeBytes / (1024 * 1024)).toFixed(2)
    : "0.00";

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Alerta */}
      {alert && (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-4 rounded-2xl border shadow-2xl flex items-center gap-3 min-w-[320px] max-w-lg animate-in fade-in slide-in-from-top-2 duration-300"
          style={{
            backgroundColor: alert.type === "error"
              ? "color-mix(in srgb, #ef4444 20%, transparent)"
              : alert.type === "success"
              ? "color-mix(in srgb, #22c55e 20%, transparent)"
              : "color-mix(in srgb, var(--theme-primary) 20%, transparent)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            borderColor: alert.type === "error"
              ? "color-mix(in srgb, #ef4444 30%, transparent)"
              : alert.type === "success"
              ? "color-mix(in srgb, #22c55e 30%, transparent)"
              : "color-mix(in srgb, var(--theme-primary) 30%, transparent)",
            color: alert.type === "error"
              ? "#ef4444"
              : alert.type === "success"
              ? "#22c55e"
              : "var(--theme-primary)",
          }}
        >
          <span className="text-xs font-semibold flex-1">{alert.message}</span>
          <button
            onClick={hideAlert}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            {closeIcon}
          </button>
        </div>
      )}

      {/* Contenedor principal */}
      <div
        className="rounded-3xl border p-8 transition-all duration-500"
        style={{
          backgroundColor: "color-mix(in srgb, var(--theme-bg) 55%, transparent)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
        }}
      >
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{
              backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
              color: "var(--theme-primary)",
            }}
          >
            {pdfIcon}
          </div>
          <h1 className="text-3xl font-bold" style={{ color: "var(--theme-primary)" }}>
            PDF a IMG
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--theme-muted)" }}>
            Convierte paginas de PDF a imagenes enumeradas y comprimelas en ZIP
          </p>
        </div>

        {/* Estado IDLE */}
        {(phase === "idle" || phase === "selecting") && (
          <div className="flex flex-col items-center gap-6 py-8">
            <div
              className="w-full max-w-md rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300 cursor-pointer hover:border-theme-primary/50"
              style={{
                borderColor: isDragging
                  ? "var(--theme-primary)"
                  : "color-mix(in srgb, var(--theme-primary) 25%, transparent)",
                backgroundColor: isDragging
                  ? "color-mix(in srgb, var(--theme-primary) 10%, transparent)"
                  : "transparent",
              }}
              onClick={pickPdf}
            >
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
                  color: "var(--theme-primary)",
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="12" y2="12" />
                  <line x1="15" y1="15" x2="12" y2="12" />
                </svg>
              </div>
              <p className="text-base font-semibold" style={{ color: "var(--theme-text)" }}>
                {isDragging ? "Suelta el PDF aqui" : "Seleccionar archivo PDF"}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--theme-muted)" }}>
                {isDragging ? "" : "Haz clic para elegir un PDF desde tu equipo"}
              </p>
            </div>

            {phase === "selecting" && (
              <div className="flex items-center gap-2">
                <div
                  className="w-5 h-5 rounded-full border-2 border-transparent border-t-current animate-spin"
                  style={{ color: "var(--theme-primary)" }}
                />
                <span className="text-sm" style={{ color: "var(--theme-muted)" }}>
                  Seleccionando archivo...
                </span>
              </div>
            )}
          </div>
        )}

        {/* Estado READY (PDF seleccionado, esperando conversion) */}
        {phase === "ready" && pdfPath && (
          <div className="space-y-6">
            {/* Archivo seleccionado */}
            <div
              className="rounded-2xl border p-5 flex items-center gap-4"
              style={{
                backgroundColor: "color-mix(in srgb, var(--theme-bg) 40%, transparent)",
                borderColor: "color-mix(in srgb, var(--theme-primary) 20%, transparent)",
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
                  color: "var(--theme-primary)",
                }}
              >
                {pdfIcon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--theme-text)" }}>
                  {pdfPath.split(/[/\\]/).pop()}
                </p>
                <p className="text-xs mt-0.5 truncate" style={{ color: "var(--theme-muted)" }}>
                  {pdfPath}
                </p>
              </div>
              <button
                onClick={pickPdf}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
                style={{
                  color: "var(--theme-primary)",
                  border: "1px solid",
                  borderColor: "color-mix(in srgb, var(--theme-primary) 30%, transparent)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--theme-primary) 15%, transparent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                Cambiar
              </button>
            </div>

            {/* Selector de formato */}
            <div>
              <p className="text-sm font-semibold mb-3" style={{ color: "var(--theme-text)" }}>
                Formato de imagen
              </p>
              <div className="flex gap-3">
                {(["jpg", "png", "webp"] as const).map((f) => {
                  const active = format === f;
                  return (
                    <button
                      key={f}
                      onClick={() => setFormat(f)}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-medium transition-all duration-200"
                      style={{
                        backgroundColor: active
                          ? "var(--theme-primary)"
                          : "color-mix(in srgb, var(--theme-bg) 40%, transparent)",
                        borderColor: active
                          ? "var(--theme-primary)"
                          : "color-mix(in srgb, var(--theme-primary) 20%, transparent)",
                        color: active ? "#ffffff" : "var(--theme-text)",
                      }}
                    >
                      {imageIcon}
                      {f.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Botones de accion */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={startConversion}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 shadow-lg hover:shadow-xl active:scale-[0.98]"
                style={{ backgroundColor: "var(--theme-primary)" }}
              >
                {zipIcon}
                Convertir y Guardar ZIP
              </button>
              <button
                onClick={reset}
                className="px-4 py-3 rounded-xl text-sm transition-all duration-200"
                style={{
                  color: "var(--theme-muted)",
                  border: "1px solid",
                  borderColor: "color-mix(in srgb, var(--theme-border) 50%, transparent)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--theme-primary)";
                  e.currentTarget.style.borderColor = "color-mix(in srgb, var(--theme-primary) 50%, transparent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--theme-muted)";
                  e.currentTarget.style.borderColor = "color-mix(in srgb, var(--theme-border) 50%, transparent)";
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Estado CONVERTING */}
        {phase === "converting" && (
          <div className="flex flex-col items-center gap-6 py-8">
            {/* Spinner grande */}
            <div className="relative w-20 h-20">
              <div
                className="absolute inset-0 rounded-full border-4"
                style={{
                  borderColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
                }}
              />
              <div
                className="absolute inset-0 rounded-full border-4 border-transparent border-t-current animate-spin"
                style={{ color: "var(--theme-primary)" }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold" style={{ color: "var(--theme-primary)" }}>
                  {currentPage > 0 ? currentPage : "..."}
                </span>
              </div>
            </div>

            <div className="text-center">
              <p className="text-base font-semibold" style={{ color: "var(--theme-text)" }}>
                {totalPages > 0
                  ? `Procesando pagina ${currentPage} de ${totalPages}`
                  : "Procesando PDF..."}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--theme-muted)" }}>
                Renderizando y codificando en {formatLabel}
              </p>
            </div>

            {/* Barra de progreso */}
            {totalPages > 0 && (
              <div className="w-full max-w-md h-2 rounded-full overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)" }}>
                <div
                  className="h-full rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${(currentPage / totalPages) * 100}%`,
                    backgroundColor: "var(--theme-primary)",
                  }}
                />
              </div>
            )}

            <p className="text-xs" style={{ color: "var(--theme-muted)" }}>
              Usando Rayon para procesamiento en paralelo
            </p>
          </div>
        )}

        {/* Estado DONE */}
        {phase === "done" && (
          <div className="flex flex-col items-center gap-6 py-8">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{
                backgroundColor: "color-mix(in srgb, #22c55e 15%, transparent)",
                color: "#22c55e",
              }}
            >
              {checkIcon}
            </div>

            <div className="text-center">
              <p className="text-xl font-bold" style={{ color: "var(--theme-primary)" }}>
                Conversion Exitosa
              </p>
              <p className="text-sm mt-2" style={{ color: "var(--theme-muted)" }}>
                El archivo ZIP se ha guardado correctamente
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 w-full max-w-md">
              <div
                className="rounded-xl border p-4 text-center"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--theme-bg) 40%, transparent)",
                  borderColor: "color-mix(in srgb, var(--theme-primary) 20%, transparent)",
                }}
              >
                <p className="text-2xl font-bold" style={{ color: "var(--theme-primary)" }}>
                  {totalPages}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--theme-muted)" }}>
                  Paginas
                </p>
              </div>
              <div
                className="rounded-xl border p-4 text-center"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--theme-bg) 40%, transparent)",
                  borderColor: "color-mix(in srgb, var(--theme-primary) 20%, transparent)",
                }}
              >
                <p className="text-2xl font-bold" style={{ color: "var(--theme-primary)" }}>
                  {formatLabel}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--theme-muted)" }}>
                  Formato
                </p>
              </div>
              <div
                className="rounded-xl border p-4 text-center"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--theme-bg) 40%, transparent)",
                  borderColor: "color-mix(in srgb, var(--theme-primary) 20%, transparent)",
                }}
              >
                <p className="text-2xl font-bold" style={{ color: "var(--theme-primary)" }}>
                  {zipSizeMb} MB
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--theme-muted)" }}>
                  ZIP
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={reset}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 shadow-lg hover:shadow-xl active:scale-[0.98]"
                style={{ backgroundColor: "var(--theme-primary)" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                </svg>
                Nueva conversion
              </button>
            </div>
          </div>
        )}

        {/* Estado ERROR */}
        {phase === "error" && (
          <div className="flex flex-col items-center gap-6 py-8">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{
                backgroundColor: "color-mix(in srgb, #ef4444 15%, transparent)",
                color: "#ef4444",
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>

            <div className="text-center max-w-md">
              <p className="text-lg font-bold" style={{ color: "#ef4444" }}>
                Error en la conversion
              </p>
              <p className="text-sm mt-2" style={{ color: "var(--theme-muted)" }}>
                {error || "Ocurrio un error inesperado durante la conversion."}
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={reset}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 shadow-lg hover:shadow-xl active:scale-[0.98]"
                style={{ backgroundColor: "var(--theme-primary)" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                </svg>
                Intentar de nuevo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="mt-6 pt-5 border-t text-center"
        style={{ borderColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)" }}
      >
        <p className="text-xs font-medium tracking-wider" style={{ color: "var(--theme-muted)" }}>
          <span style={{ color: "var(--theme-primary)" }}>TOOLS 33</span> v{__APP_VERSION__} &mdash; Powered by Tauri &amp; React
        </p>
      </div>
    </div>
  );
}
