import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";

interface MergeFile {
  id: string;
  path: string;
  name: string;
  size: number;
  pageCount: number;
}

interface PdfInfoResult {
  path: string;
  name: string;
  size: number;
  page_count: number;
}

interface AlertState {
  show: boolean;
  message: string;
  type: "info" | "success" | "error";
}

const pdfIcon = (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const mergeIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m0 8v3a2 2 0 0 0 2 2h3m8-16h3a2 2 0 0 1 2 2v3m0 8v3a2 2 0 0 1-2 2h-3" />
    <path d="M12 7v10M9 10l3-3 3 3M9 14l3 3 3-3" />
  </svg>
);

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function PdfMergeScreen() {
  const [files, setFiles] = useState<MergeFile[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [alert, setAlert] = useState<AlertState>({ show: false, message: "", type: "info" });
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragCounter = useRef(0);

  const showAlert = useCallback((message: string, type: AlertState["type"] = "info") => {
    setAlert({ show: true, message, type });
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    alertTimerRef.current = setTimeout(() => setAlert((a) => ({ ...a, show: false })), 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    };
  }, []);

  const addPaths = useCallback(
    async (paths: string[]) => {
      const pdfPaths = paths.filter((p) => p.toLowerCase().endsWith(".pdf"));
      if (pdfPaths.length === 0) return;

      try {
        const infos = await invoke<PdfInfoResult[]>("get_pdf_info", { paths: pdfPaths });
        const newFiles: MergeFile[] = infos.map((info) => ({
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          path: info.path,
          name: info.name,
          size: info.size,
          pageCount: info.page_count,
        }));
        setFiles((prev) => [...prev, ...newFiles]);
      } catch (e) {
        showAlert(`Error al leer PDFs: ${e}`, "error");
      }
    },
    [showAlert]
  );

  // Drag & drop nativo de Tauri
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === "enter") {
          dragCounter.current += 1;
          setIsDragging(true);
        } else if (event.payload.type === "leave") {
          dragCounter.current = Math.max(0, dragCounter.current - 1);
          if (dragCounter.current === 0) setIsDragging(false);
        } else if (event.payload.type === "drop") {
          dragCounter.current = 0;
          setIsDragging(false);
          addPaths(event.payload.paths);
        }
      });
    })();
    return () => {
      unlisten?.();
    };
  }, [addPaths]);

  const openFiles = async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      title: "Seleccionar archivos PDF",
    });
    if (!selected) return;
    const paths: string[] = Array.isArray(selected) ? selected : [selected];
    addPaths(paths);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearFiles = () => setFiles([]);

  const moveFile = (id: string, direction: "up" | "down") => {
    setFiles((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      if (idx === -1) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const newFiles = [...prev];
      [newFiles[idx], newFiles[newIdx]] = [newFiles[newIdx], newFiles[idx]];
      return newFiles;
    });
  };

  const handleMerge = async () => {
    if (files.length < 2) {
      showAlert("Selecciona al menos 2 PDFs para unir", "error");
      return;
    }

    const outputPath = await save({
      defaultPath: "unidos.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      title: "Guardar PDF combinado",
    });

    if (!outputPath) return;

    setIsMerging(true);

    try {
      const inputPaths = files.map((f) => f.path);
      await invoke("merge_pdfs", { inputPaths, outputPath });
      const totalPages = files.reduce((sum, f) => sum + f.pageCount, 0);
      showAlert(`PDF unido: ${files.length} archivos, ${totalPages} paginas total`, "success");
      setFiles([]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      showAlert(`Error al unir: ${msg}`, "error");
    } finally {
      setIsMerging(false);
    }
  };

  const totalPages = files.reduce((sum, f) => sum + f.pageCount, 0);

  const panelStyle: React.CSSProperties = {
    backgroundColor: "color-mix(in srgb, var(--theme-bg) 55%, transparent)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    borderColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
  };

  const alertColors =
    alert.type === "error"
      ? { bg: "color-mix(in srgb, #ef4444 20%, transparent)", border: "color-mix(in srgb, #ef4444 30%, transparent)", color: "#ef4444" }
      : alert.type === "success"
      ? { bg: "color-mix(in srgb, #22c55e 20%, transparent)", border: "color-mix(in srgb, #22c55e 30%, transparent)", color: "#22c55e" }
      : { bg: "color-mix(in srgb, var(--theme-primary) 20%, transparent)", border: "color-mix(in srgb, var(--theme-primary) 30%, transparent)", color: "var(--theme-primary)" };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Alerta */}
      {alert.show && (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-4 rounded-2xl border shadow-2xl flex items-center gap-3 min-w-[320px] max-w-lg"
          style={{
            backgroundColor: alertColors.bg,
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            borderColor: alertColors.border,
            color: alertColors.color,
          }}
        >
          <span className="text-xs font-semibold flex-1">{alert.message}</span>
          <button onClick={() => setAlert((a) => ({ ...a, show: false }))} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      <div className="rounded-3xl border p-8 transition-all duration-500" style={panelStyle}>
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)", color: "var(--theme-primary)" }}
          >
            {pdfIcon}
          </div>
          <h1 className="text-3xl font-bold" style={{ color: "var(--theme-primary)" }}>
            Unir PDFs
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--theme-muted)" }}>
            Combina varios PDFs en uno solo, en el orden que elijas
          </p>
        </div>

        {/* Zona de carga cuando no hay archivos */}
        {files.length === 0 ? (
          <div
            onClick={openFiles}
            className="w-full rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300 cursor-pointer"
            style={{
              borderColor: isDragging
                ? "var(--theme-primary)"
                : "color-mix(in srgb, var(--theme-primary) 25%, transparent)",
              backgroundColor: isDragging ? "color-mix(in srgb, var(--theme-primary) 10%, transparent)" : "transparent",
            }}
          >
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)", color: "var(--theme-primary)" }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="text-base font-semibold" style={{ color: "var(--theme-text)" }}>
              {isDragging ? "Suelta los PDFs aqui" : "Arrastra PDFs o haz clic para seleccionar"}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--theme-muted)" }}>
              Minimo 2 archivos para unir
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Resumen */}
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: "var(--theme-muted)" }}>
                {files.length} archivo{files.length > 1 ? "s" : ""} · {totalPages} paginas total
              </span>
              <span style={{ color: "var(--theme-muted)" }}>Reordena con las flechas</span>
            </div>

            {/* Lista de archivos ordenada */}
            <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin pr-1">
              {files.map((f, idx) => (
                <div
                  key={f.id}
                  className="rounded-xl border p-3 flex items-center gap-3"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--theme-bg) 40%, transparent)",
                    borderColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
                  }}
                >
                  {/* Numero de orden */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                    style={{ backgroundColor: "var(--theme-primary)", color: "#fff" }}
                  >
                    {idx + 1}
                  </div>

                  {/* Icono PDF */}
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)", color: "var(--theme-primary)" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--theme-text)" }}>
                      {f.name}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--theme-muted)" }}>
                      {f.pageCount} paginas · {formatBytes(f.size)}
                    </p>
                  </div>

                  {/* Controles de reordenamiento */}
                  {!isMerging && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => moveFile(f.id, "up")}
                        disabled={idx === 0}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ color: "var(--theme-muted)" }}
                        onMouseEnter={(e) => { if (idx !== 0) e.currentTarget.style.color = "var(--theme-primary)" }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-muted)" }}
                        title="Subir"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="18 15 12 9 6 15" />
                        </svg>
                      </button>
                      <button
                        onClick={() => moveFile(f.id, "down")}
                        disabled={idx === files.length - 1}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ color: "var(--theme-muted)" }}
                        onMouseEnter={(e) => { if (idx !== files.length - 1) e.currentTarget.style.color = "var(--theme-primary)" }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-muted)" }}
                        title="Bajar"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      <button
                        onClick={() => removeFile(f.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                        style={{ color: "var(--theme-muted)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444" }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-muted)" }}
                        title="Quitar"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Botones de accion */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleMerge}
                disabled={isMerging || files.length < 2}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "var(--theme-primary)" }}
              >
                {isMerging ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Uniendo...
                  </>
                ) : (
                  <>
                    {mergeIcon}
                    Unir {files.length} PDFs
                  </>
                )}
              </button>
              <button
                onClick={openFiles}
                disabled={isMerging}
                className="px-4 py-3 rounded-xl text-sm transition-all duration-200 disabled:opacity-50"
                style={{
                  color: "var(--theme-primary)",
                  border: "1px solid",
                  borderColor: "color-mix(in srgb, var(--theme-primary) 30%, transparent)",
                }}
              >
                + Agregar
              </button>
              {!isMerging && (
                <button
                  onClick={clearFiles}
                  className="px-4 py-3 rounded-xl text-sm transition-all duration-200"
                  style={{ color: "var(--theme-muted)", border: "1px solid", borderColor: "color-mix(in srgb, var(--theme-border) 50%, transparent)" }}
                >
                  Limpiar
                </button>
              )}
              {files.length < 2 && !isMerging && (
                <span className="ml-auto text-xs" style={{ color: "var(--theme-muted)" }}>
                  Necesitas al menos 2 PDFs
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 pt-5 border-t text-center" style={{ borderColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)" }}>
        <p className="text-xs font-medium tracking-wider" style={{ color: "var(--theme-muted)" }}>
          <span style={{ color: "var(--theme-primary)" }}>TOOLS 33</span> v{__APP_VERSION__} &mdash; lopdf (Rust puro)
        </p>
      </div>
    </div>
  );
}
