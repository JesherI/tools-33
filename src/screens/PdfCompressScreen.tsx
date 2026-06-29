import { useState, useRef, useEffect, useCallback } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { stat } from "@tauri-apps/plugin-fs";
import { getCurrentWebview } from "@tauri-apps/api/webview";

type Level = "baja" | "media" | "alta";

interface CompressProgress {
  fileId: string;
  fileName: string;
  phase: string;
  progress: number;
  currentPage?: number;
  totalPages?: number;
}

interface FileCompressResult {
  fileId: string;
  fileName: string;
  success: boolean;
  originalSize: number;
  compressedSize?: number;
  compressionRatio?: string;
  error?: string;
}

interface FileItem {
  id: string;
  path: string;
  name: string;
  size: number;
  status: "pending" | "compressing" | "done" | "error";
  progress: number;
  compressedSize?: number;
  compressionRatio?: string;
  errorMessage?: string;
}

interface AlertState {
  show: boolean;
  message: string;
  type: "info" | "success" | "error";
}

const LEVELS: { id: Level; label: string; dpi: string; quality: string; desc: string }[] = [
  {
    id: "baja",
    label: "Baja",
    dpi: "150 DPI",
    quality: "JPEG 80%",
    desc: "Vectores intactos, metadatos limpios, imagenes a 150 DPI. Calidad alta.",
  },
  {
    id: "media",
    label: "Media",
    dpi: "100 DPI",
    quality: "JPEG 65%",
    desc: "Unifica capas (OCG) en una sola visible, elimina vectores ocultos, 100 DPI.",
  },
  {
    id: "alta",
    label: "Alta",
    dpi: "72 DPI",
    quality: "JPEG 45%",
    desc: "Aplanamiento parejo: rasteriza TODO el vectorial, conserva texto nativo buscable.",
  },
];

const pdfIcon = (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const compressIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
  </svg>
);

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function PdfCompressScreen() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [level, setLevel] = useState<Level>("media");
  const [isCompressing, setIsCompressing] = useState(false);
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
      const newFiles: FileItem[] = [];
      for (const path of paths) {
        if (!path.toLowerCase().endsWith(".pdf")) continue;
        let size = 0;
        try {
          const info = await stat(path);
          size = info.size ?? 0;
        } catch {
          /* ignore */
        }
        const name = path.split(/[/\\]/).pop() || "unknown.pdf";
        newFiles.push({
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          path,
          name,
          size,
          status: "pending",
          progress: 0,
        });
      }
      if (newFiles.length) setFiles((prev) => [...prev, ...newFiles]);
    },
    []
  );

  // Drag & drop nativo de Tauri (entrega rutas del SO, sin copiar a temp).
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

  const handleCompress = async () => {
    if (files.length === 0) return;

    const outputDir = await open({
      directory: true,
      multiple: false,
      title: "Carpeta para PDFs comprimidos",
    });
    if (!outputDir) return;

    setIsCompressing(true);
    setFiles((prev) => prev.map((f) => ({ ...f, status: "compressing", progress: 0, errorMessage: undefined })));

    const onEvent = new Channel<CompressProgress>();
    onEvent.onmessage = (msg) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === msg.fileId ? { ...f, progress: msg.progress } : f))
      );
    };

    try {
      const inputs = files.map((f) => ({ id: f.id, name: f.name, path: f.path }));
      const results = await invoke<FileCompressResult[]>("compress_pdfs", {
        files: inputs,
        level,
        outputDir,
        onEvent,
      });

      setFiles((prev) =>
        prev.map((f) => {
          const r = results.find((res) => res.fileId === f.id);
          if (!r) return f;
          return r.success
            ? { ...f, status: "done", progress: 100, compressedSize: r.compressedSize, compressionRatio: r.compressionRatio }
            : { ...f, status: "error", errorMessage: r.error || "Error" };
        })
      );

      const okCount = results.filter((r) => r.success).length;
      showAlert(
        okCount === results.length
          ? `${okCount} PDF${okCount > 1 ? "s" : ""} comprimido${okCount > 1 ? "s" : ""} correctamente`
          : `${okCount}/${results.length} comprimidos (algunos fallaron)`,
        okCount === results.length ? "success" : "error"
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setFiles((prev) =>
        prev.map((f) => (f.status === "compressing" ? { ...f, status: "error", errorMessage: msg } : f))
      );
      showAlert(`Error: ${msg}`, "error");
    } finally {
      setIsCompressing(false);
    }
  };

  const allDone = files.length > 0 && files.every((f) => f.status === "done");
  const anyError = files.some((f) => f.status === "error");
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
            Compresor PDF
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--theme-muted)" }}>
            Compresion 100% Rust nativa para planos CAD, vectoriales e imagenes
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
              Procesamiento local sin Ghostscript ni Acrobat
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Selector de nivel */}
            <div>
              <p className="text-sm font-semibold mb-3" style={{ color: "var(--theme-text)" }}>
                Nivel de compresion
              </p>
              <div className="grid grid-cols-3 gap-3">
                {LEVELS.map((lvl) => {
                  const active = level === lvl.id;
                  return (
                    <button
                      key={lvl.id}
                      onClick={() => setLevel(lvl.id)}
                      disabled={isCompressing}
                      className="text-left p-4 rounded-xl border transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: active
                          ? "color-mix(in srgb, var(--theme-primary) 15%, transparent)"
                          : "color-mix(in srgb, var(--theme-bg) 40%, transparent)",
                        borderColor: active
                          ? "var(--theme-primary)"
                          : "color-mix(in srgb, var(--theme-primary) 20%, transparent)",
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold" style={{ color: active ? "var(--theme-primary)" : "var(--theme-text)" }}>
                          {lvl.label}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)", color: "var(--theme-primary)" }}>
                          {lvl.dpi}
                        </span>
                      </div>
                      <p className="text-[10px] leading-tight mb-1" style={{ color: "var(--theme-muted)" }}>
                        {lvl.desc}
                      </p>
                      <p className="text-[10px] font-medium" style={{ color: "var(--theme-primary)" }}>
                        {lvl.quality}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lista de archivos */}
            <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin pr-1">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="rounded-xl border p-3 flex items-center gap-3"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--theme-bg) 40%, transparent)",
                    borderColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)", color: "var(--theme-primary)" }}
                  >
                    {pdfIconSmall}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--theme-text)" }}>
                        {f.name}
                      </p>
                      {!isCompressing && (
                        <button
                          onClick={() => removeFile(f.id)}
                          className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                          style={{ color: "var(--theme-muted)" }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--theme-muted)" }}>
                      <span>{formatBytes(f.size)}</span>
                      {f.status === "done" && f.compressedSize !== undefined && (
                        <span style={{ color: "var(--theme-primary)" }}>→ {formatBytes(f.compressedSize)}</span>
                      )}
                      {f.compressionRatio && (
                        <span className="px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)", color: "var(--theme-primary)" }}>
                          -{f.compressionRatio}
                        </span>
                      )}
                      {f.status === "error" && (
                        <span style={{ color: "#ef4444" }}>{f.errorMessage}</span>
                      )}
                    </div>
                    {(f.status === "compressing" || f.status === "done") && (
                      <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${f.progress}%`, backgroundColor: "var(--theme-primary)" }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {f.status === "compressing" && (
                      <div className="w-4 h-4 rounded-full border-2 border-transparent border-t-current animate-spin" style={{ color: "var(--theme-primary)" }} />
                    )}
                    {f.status === "done" && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    {f.status === "error" && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Acciones */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleCompress}
                disabled={isCompressing || files.length === 0}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "var(--theme-primary)" }}
              >
                {isCompressing ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Comprimiendo...
                  </>
                ) : (
                  <>
                    {compressIcon}
                    Comprimir ({files.length})
                  </>
                )}
              </button>
              <button
                onClick={openFiles}
                disabled={isCompressing}
                className="px-4 py-3 rounded-xl text-sm transition-all duration-200 disabled:opacity-50"
                style={{
                  color: "var(--theme-primary)",
                  border: "1px solid",
                  borderColor: "color-mix(in srgb, var(--theme-primary) 30%, transparent)",
                }}
              >
                + Agregar
              </button>
              {!isCompressing && (
                <button
                  onClick={clearFiles}
                  className="px-4 py-3 rounded-xl text-sm transition-all duration-200"
                  style={{ color: "var(--theme-muted)", border: "1px solid", borderColor: "color-mix(in srgb, var(--theme-border) 50%, transparent)" }}
                >
                  Limpiar
                </button>
              )}
              {allDone && (
                <span className="ml-auto text-xs font-medium" style={{ color: "#22c55e" }}>
                  Todos comprimidos
                </span>
              )}
              {anyError && !allDone && !isCompressing && (
                <span className="ml-auto text-xs font-medium" style={{ color: "#ef4444" }}>
                  Hubo errores
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 pt-5 border-t text-center" style={{ borderColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)" }}>
        <p className="text-xs font-medium tracking-wider" style={{ color: "var(--theme-muted)" }}>
          <span style={{ color: "var(--theme-primary)" }}>TOOLS 33</span> v{__APP_VERSION__} &mdash; lopdf + hayro + image (Rust puro)
        </p>
      </div>
    </div>
  );
}

const pdfIconSmall = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);
