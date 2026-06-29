import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";

export type ImageFormat = "jpg" | "png" | "webp";

export interface PdfProgressPayload {
  current: number;
  total: number;
}

export interface PdfConversionResult {
  total_pages: number;
  zip_size_bytes: number;
  format: string;
  renderer: string;
  gpu_available: boolean;
}

export type ConverterPhase =
  | "idle"
  | "selecting"
  | "ready"
  | "converting"
  | "done"
  | "error";

export interface ConverterState {
  phase: ConverterPhase;
  pdfPath: string | null;
  format: ImageFormat;
  totalPages: number;
  currentPage: number;
  zipSizeBytes: number;
  renderer: string;
  gpuAvailable: boolean;
  error: string | null;
  alert: { type: "error" | "success" | "info"; message: string } | null;
}

export function usePdfConverter() {
  const [state, setState] = useState<ConverterState>({
    phase: "idle",
    pdfPath: null,
    format: "jpg",
    totalPages: 0,
    currentPage: 0,
    zipSizeBytes: 0,
    renderer: "",
    gpuAvailable: false,
    error: null,
    alert: null,
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const unlistenRef = useRef<(() => void) | null>(null);

  // Escuchar eventos de progreso
  useEffect(() => {
    let cancelled = false;

    async function setup() {
      const unlisten = await listen<PdfProgressPayload>(
        "pdf-progress",
        (event) => {
          if (!cancelled) {
            setState((prev) => ({
              ...prev,
              currentPage: event.payload.current,
              totalPages: event.payload.total,
            }));
          }
        }
      );
      if (!cancelled) {
        unlistenRef.current = unlisten;
      } else {
        unlisten();
      }
    }

    setup();

    return () => {
      cancelled = true;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []);

  // Drag & drop nativo de Tauri
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === "enter") {
          dragCounterRef.current += 1;
          setIsDragging(true);
        } else if (event.payload.type === "leave") {
          dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
          if (dragCounterRef.current === 0) setIsDragging(false);
        } else if (event.payload.type === "drop") {
          dragCounterRef.current = 0;
          setIsDragging(false);
          const paths = event.payload.paths;
          const pdfPath = paths.find((p) => p.toLowerCase().endsWith(".pdf"));
          if (pdfPath) {
            setState((prev) => ({
              ...prev,
              phase: "ready",
              pdfPath,
              error: null,
              alert: null,
            }));
          }
        }
      });
    })();
    return () => {
      unlisten?.();
    };
  }, []);

  // Seleccionar archivo PDF
  const pickPdf = useCallback(async () => {
    setState((prev) => ({ ...prev, phase: "selecting", error: null, alert: null }));
    try {
      const file = await open({
        multiple: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (file) {
        setState((prev) => ({
          ...prev,
          phase: "ready",
          pdfPath: file as string,
          error: null,
          alert: null,
        }));
      } else {
        setState((prev) => ({ ...prev, phase: "idle", error: null }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: "idle",
        error: `Error al seleccionar PDF: ${err}`,
        alert: { type: "error", message: `Error al seleccionar PDF: ${err}` },
      }));
    }
  }, []);

  // Cambiar formato
  const setFormat = useCallback((format: ImageFormat) => {
    setState((prev) => ({ ...prev, format }));
  }, []);

  // Iniciar conversion
  const startConversion = useCallback(async () => {
    if (!state.pdfPath) return;

    setState((prev) => ({
      ...prev,
      phase: "converting",
      currentPage: 0,
      totalPages: 0,
      zipSizeBytes: 0,
      error: null,
      alert: null,
    }));

    // Preguntar donde guardar el ZIP
    let savePath: string | null = null;
    try {
      const defaultName = `pdf_convertido_${Date.now()}.zip`;
      savePath = await save({
        filters: [{ name: "ZIP", extensions: ["zip"] }],
        defaultPath: defaultName,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: "ready",
        error: `Error al seleccionar destino: ${err}`,
        alert: { type: "error", message: `Error al seleccionar destino: ${err}` },
      }));
      return;
    }

    if (!savePath) {
      setState((prev) => ({ ...prev, phase: "ready" }));
      return;
    }

    // Llamar al comando Rust
    try {
      const result = await invoke<PdfConversionResult>("convert_pdf_to_zip", {
        pdfPath: state.pdfPath,
        outputPath: savePath,
        format: state.format,
      });

      const zipSizeMb = (result.zip_size_bytes / (1024 * 1024)).toFixed(2);
      const gpuInfo = result.gpu_available ? " | GPU detectada" : "";

      setState((prev) => ({
        ...prev,
        phase: "done",
        totalPages: result.total_pages,
        currentPage: result.total_pages,
        zipSizeBytes: result.zip_size_bytes,
        renderer: result.renderer,
        gpuAvailable: result.gpu_available,
        alert: {
          type: "success",
          message: `PDF convertido: ${result.total_pages} paginas a ${result.format.toUpperCase()}. ZIP: ${zipSizeMb} MB | ${result.renderer}${gpuInfo}`,
        },
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: "error",
        error: `${err}`,
        alert: { type: "error", message: `Error en la conversion: ${err}` },
      }));
    }
  }, [state.pdfPath, state.format]);

  // Resetear todo
  const reset = useCallback(() => {
    setState({
      phase: "idle",
      pdfPath: null,
      format: "jpg",
      totalPages: 0,
      currentPage: 0,
      zipSizeBytes: 0,
      renderer: "",
      gpuAvailable: false,
      error: null,
      alert: null,
    });
  }, []);

  // Cerrar alerta
  const hideAlert = useCallback(() => {
    setState((prev) => ({ ...prev, alert: null }));
  }, []);

  return {
    ...state,
    isDragging,
    pickPdf,
    setFormat,
    startConversion,
    reset,
    hideAlert,
  };
}
