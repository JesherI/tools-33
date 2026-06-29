import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { getCurrentWebview } from "@tauri-apps/api/webview"; 

type InterpolationMethod = "lanczos-sharp" | "lanczos" | "bicubic" | "bilinear" | "nearest";

interface ImageInfo {
  file: File;
  originalUrl: string;
  dataUrl: string;
  originalWidth: number;
  originalHeight: number;
  originalSize: number;
}

interface ScaleSettings {
  method: InterpolationMethod;
  scaleFactor: number;
  targetWidth: number;
  targetHeight: number;
  maintainAspectRatio: boolean;
  targetDpi: number;
  sharpenAmount: number;
  gpuIndex: number;
}

interface AlertState {
  show: boolean;
  message: string;
  type: "info" | "success" | "error";
}

const INTERPOLATION_METHODS: { value: InterpolationMethod; label: string; description: string }[] = [
  { value: "lanczos-sharp", label: "Lanczos + Sharp", description: "Maxima calidad con afilado agresivo" },
  { value: "lanczos", label: "Lanczos", description: "Mejor calidad, reduce artefactos y mantiene bordes nitidos" },
  { value: "bicubic", label: "Bicubica", description: "Buen equilibrio entre calidad y velocidad" },
  { value: "bilinear", label: "Bilineal", description: "Rapida, buena para imagenes suaves" },
  { value: "nearest", label: "Vecino mas cercano", description: "Mas rapida, mantiene pixeles nitidos" },
];

function BeforeAfterSlider({
  beforeImage,
  afterImage,
  beforeLabel = "Original",
  afterLabel = "Escalada",
}: {
  beforeImage: string;
  afterImage: string | null;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSliderPosition((x / rect.width) * 100);
  }, []);

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) handleMove(e.clientX);
  };
  const handleTouchMove = (e: React.TouchEvent) => handleMove(e.touches[0].clientX);

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden rounded-xl cursor-ew-resize select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
    >
      <div className="absolute inset-0">
        {afterImage ? (
          <img src={afterImage} alt="Escalada" className="w-full h-full object-contain" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--theme-text) 8%, transparent)" }}>
            <div className="text-center" style={{ color: "var(--theme-muted)" }}>
              <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">Vista previa</p>
            </div>
          </div>
        )}
      </div>

      <div
        className="absolute bottom-4 right-4 px-3 py-1.5 rounded-lg text-xs font-medium text-white backdrop-blur-sm"
        style={{ backgroundColor: "color-mix(in srgb, var(--theme-primary) 90%, transparent)" }}
      >
        {afterLabel}
      </div>

      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}>
        <img src={beforeImage} alt="Original" className="w-full h-full object-contain" draggable={false} />
      </div>

      <div
        className="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg text-xs font-medium text-white backdrop-blur-sm transition-opacity"
        style={{ backgroundColor: "color-mix(in srgb, var(--theme-text) 20%, transparent)", opacity: sliderPosition > 15 ? 1 : 0 }}
      >
        {beforeLabel}
      </div>

      <div
        className="absolute top-0 bottom-0 w-0.5 cursor-ew-resize"
        style={{ left: `${sliderPosition}%`, backgroundColor: "var(--theme-primary)" }}
      >
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center shadow-lg cursor-ew-resize hover:scale-110 transition-transform"
          style={{ backgroundColor: "var(--theme-primary)", boxShadow: "0 8px 24px color-mix(in srgb, var(--theme-primary) 35%, transparent)" }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>
    </div>
  );
}

export default function ImageScalerScreen() {
  const [image, setImage] = useState<ImageInfo | null>(null);
  const [scaledImageUrl, setScaledImageUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [nativeDragActive, setNativeDragActive] = useState(false);
  const [alert, setAlert] = useState<AlertState>({ show: false, message: "", type: "info" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeDragCounter = useRef(0);

  const [settings, setSettings] = useState<ScaleSettings>({
    method: "lanczos-sharp",
    scaleFactor: 2,
    targetWidth: 0,
    targetHeight: 0,
    maintainAspectRatio: true,
    targetDpi: 300,
    sharpenAmount: 1.5,
    gpuIndex: -2,
  });

  const showAlert = useCallback((message: string, type: AlertState["type"] = "info") => {
    setAlert({ show: true, message, type });
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    alertTimerRef.current = setTimeout(() => setAlert((a) => ({ ...a, show: false })), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    (async () => {
      unlisten = await listen<number>("scale-progress", (event) => {
        setProgress(event.payload);
      });
    })();
    return () => {
      unlisten?.();
    };
  }, []);

  // Drag & drop nativo de Tauri (arrastrar archivos desde el OS)
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    (async () => {
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === "enter") {
          nativeDragCounter.current += 1;
          setNativeDragActive(true);
        } else if (event.payload.type === "leave") {
          nativeDragCounter.current = Math.max(0, nativeDragCounter.current - 1);
          if (nativeDragCounter.current === 0) setNativeDragActive(false);
        } else if (event.payload.type === "drop") {
          nativeDragCounter.current = 0;
          setNativeDragActive(false);
          const imagePath = event.payload.paths.find(
            (p) => p.match(/\.(png|jpg|jpeg|gif|webp|bmp|tiff?)$/i)
          );
          if (imagePath) {
            handleNativeFile(imagePath);
          } else {
            showAlert("Arrastra un archivo de imagen valido", "error");
          }
        }
      });
    })();
    return () => {
      unlisten?.();
    };
  }, []);

  const handleNativeFile = useCallback(async (filePath: string) => {
    try {
      const bytes = await readFile(filePath);
      const ext = filePath.split(".").pop()?.toLowerCase() || "png";
      const mimeMap: Record<string, string> = {
        png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
        gif: "image/gif", webp: "image/webp", bmp: "image/bmp",
        tif: "image/tiff", tiff: "image/tiff",
      };
      const mime = mimeMap[ext] || "image/png";
      const blob = new Blob([bytes], { type: mime });
      const file = new File([blob], filePath.split(/[/\\]/).pop() || "image.png", { type: mime });
      const url = URL.createObjectURL(file);
      const dataUrl = await blobToDataUrl(blob);

      const img = new Image();
      img.onload = () => {
        setImage({
          file,
          originalUrl: url,
          dataUrl,
          originalWidth: img.width,
          originalHeight: img.height,
          originalSize: bytes.length,
        });
        setScaledImageUrl(null);
        setSettings((prev) => ({
          ...prev,
          targetWidth: img.width * prev.scaleFactor,
          targetHeight: img.height * prev.scaleFactor,
        }));
      };
      img.src = url;
    } catch (err) {
      console.error("Error al leer archivo nativo:", err);
      showAlert("Error al leer el archivo", "error");
    }
  }, [showAlert]);

  const blobToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  };

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const file = files[0];
      if (!file.type.startsWith("image/")) {
        showAlert("Por favor selecciona un archivo de imagen valido", "error");
        return;
      }

      const url = URL.createObjectURL(file);
      const img = new Image();
      const reader = new FileReader();

      reader.onload = () => {
        const dataUrl = reader.result as string;
        img.onload = () => {
          setImage({
            file,
            originalUrl: url,
            dataUrl,
            originalWidth: img.width,
            originalHeight: img.height,
            originalSize: file.size,
          });
          setScaledImageUrl(null);
          setSettings((prev) => ({
            ...prev,
            targetWidth: img.width * prev.scaleFactor,
            targetHeight: img.height * prev.scaleFactor,
          }));
        };
        img.src = url;
      };
      reader.readAsDataURL(file);
    },
    [showAlert]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleScale = async () => {
    if (!image) return;

    setIsProcessing(true);
    setProgress(0);

    try {
      const result = await invoke<string>("scale_image", {
        input: {
          imageData: image.dataUrl,
          method: settings.method,
          scaleFactor: settings.scaleFactor,
          targetWidth: Math.round(settings.targetWidth),
          targetHeight: Math.round(settings.targetHeight),
          targetDpi: settings.targetDpi,
          sharpenAmount: settings.sharpenAmount,
          gpuIndex: settings.gpuIndex,
        },
      });

      setProgress(100);
      setScaledImageUrl(`data:image/png;base64,${result}`);
      showAlert("Imagen escalada correctamente", "success");
    } catch (error) {
      console.error("Error al escalar imagen:", error);
      showAlert(`Error: ${error}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!scaledImageUrl || !image) return;

    try {
      const base64Data = scaledImageUrl.replace(/^data:image\/png;base64,/, "");
      const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      const filename = image.file.name.replace(/\.[^/.]+$/, "") + `_scaled_${settings.targetDpi}dpi.png`;

      const savePath = await save({
        defaultPath: filename,
        filters: [{ name: "PNG Image", extensions: ["png"] }],
        title: "Guardar imagen escalada",
      });

      if (savePath) {
        await writeFile(savePath, bytes);
        showAlert("Imagen guardada correctamente", "success");
      }
    } catch (error) {
      console.error("Error al guardar imagen:", error);
      showAlert("Error al guardar la imagen", "error");
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const panelStyle: React.CSSProperties = {
    backgroundColor: "color-mix(in srgb, var(--theme-bg) 60%, transparent)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    borderColor: "color-mix(in srgb, var(--theme-primary) 12%, transparent)",
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: "color-mix(in srgb, var(--theme-text) 6%, transparent)",
    borderColor: "color-mix(in srgb, var(--theme-primary) 20%, transparent)",
    color: "var(--theme-text)",
  };

  const alertColors =
    alert.type === "error"
      ? { bg: "color-mix(in srgb, #ef4444 20%, transparent)", border: "color-mix(in srgb, #ef4444 30%, transparent)", color: "#ef4444" }
      : alert.type === "success"
      ? { bg: "color-mix(in srgb, #22c55e 20%, transparent)", border: "color-mix(in srgb, #22c55e 30%, transparent)", color: "#22c55e" }
      : { bg: "color-mix(in srgb, var(--theme-primary) 20%, transparent)", border: "color-mix(in srgb, var(--theme-primary) 30%, transparent)", color: "var(--theme-primary)" };

  return (
    <div className="w-full h-full flex overflow-hidden relative" style={{ backgroundColor: "var(--theme-bg)" }}>
      {/* Banner de alerta */}
      {alert.show && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl border shadow-2xl flex items-center gap-3 min-w-[260px] max-w-lg"
          style={{ backgroundColor: alertColors.bg, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderColor: alertColors.border, color: alertColors.color }}
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

      <div className="w-full h-full flex gap-6 p-6">
        {/* Panel izquierdo - Controles */}
        <div className="w-80 flex-shrink-0 border rounded-2xl p-4 flex flex-col overflow-hidden" style={panelStyle}>
          {/* Zona de carga */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="relative border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all duration-200 mb-3 flex-shrink-0"
            style={{
              borderColor: dragActive || nativeDragActive ? "var(--theme-primary)" : "color-mix(in srgb, var(--theme-text) 20%, transparent)",
              backgroundColor: dragActive || nativeDragActive ? "color-mix(in srgb, var(--theme-primary) 10%, transparent)" : "transparent",
            }}
          >
            <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handleFileSelect(e.target.files)} className="hidden" />
            <div className="flex items-center justify-center gap-3">
              <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "var(--theme-muted)" }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <div className="text-left">
                <p className="text-sm font-medium" style={{ color: "var(--theme-text)" }}>Arrastra o haz clic</p>
                <p className="text-xs" style={{ color: "var(--theme-muted)" }}>para seleccionar imagen</p>
              </div>
            </div>
          </div>

          {image && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto scrollbar-thin pr-1 space-y-3">
                <div className="rounded-lg p-3 border" style={{ backgroundColor: "color-mix(in srgb, var(--theme-text) 5%, transparent)", borderColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)" }}>
                  <h3 className="text-xs font-medium mb-2" style={{ color: "var(--theme-primary)" }}>Imagen Original</h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="block" style={{ color: "var(--theme-muted)" }}>Dimensiones</span>
                      <span style={{ color: "var(--theme-text)" }}>{image.originalWidth} × {image.originalHeight}</span>
                    </div>
                    <div>
                      <span className="block" style={{ color: "var(--theme-muted)" }}>Tamano</span>
                      <span style={{ color: "var(--theme-text)" }}>{formatFileSize(image.originalSize)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs" style={{ color: "var(--theme-muted)" }}>Metodo</label>
                    <select
                      value={settings.method}
                      onChange={(e) => setSettings((prev) => ({ ...prev, method: e.target.value as InterpolationMethod }))}
                      className="w-full border rounded-lg px-3 py-2 text-xs focus:outline-none"
                      style={{ ...inputStyle, borderColor: "var(--theme-primary)" }}
                    >
                      {INTERPOLATION_METHODS.map((method) => (
                        <option key={method.value} value={method.value}>{method.label}</option>
                      ))}
                    </select>
                    <p className="text-[10px] leading-tight" style={{ color: "var(--theme-muted)" }}>
                      {INTERPOLATION_METHODS.find((m) => m.value === settings.method)?.description}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <label className="text-xs" style={{ color: "var(--theme-muted)" }}>Escala</label>
                      <span className="text-xs font-medium" style={{ color: "var(--theme-primary)" }}>{settings.scaleFactor}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="4"
                      step="0.5"
                      value={settings.scaleFactor}
                      onChange={(e) => {
                        const factor = parseFloat(e.target.value);
                        setSettings((prev) => ({
                          ...prev,
                          scaleFactor: factor,
                          targetWidth: Math.round(image.originalWidth * factor),
                          targetHeight: Math.round(image.originalHeight * factor),
                        }));
                      }}
                      className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
                      style={{ accentColor: "var(--theme-primary)" }}
                    />
                    <div className="flex justify-between text-[10px]" style={{ color: "var(--theme-muted)" }}>
                      <span>0.5x</span>
                      <span>4x</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs" style={{ color: "var(--theme-muted)" }}>Ancho</label>
                      <input
                        type="number"
                        value={settings.targetWidth || ""}
                        onChange={(e) => {
                          const width = parseInt(e.target.value) || 0;
                          setSettings((prev) => ({
                            ...prev,
                            targetWidth: width,
                            targetHeight: prev.maintainAspectRatio
                              ? Math.round((width / image.originalWidth) * image.originalHeight)
                              : prev.targetHeight,
                          }));
                        }}
                        className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                        style={inputStyle}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs" style={{ color: "var(--theme-muted)" }}>Alto</label>
                      <input
                        type="number"
                        value={settings.targetHeight || ""}
                        onChange={(e) => {
                          const height = parseInt(e.target.value) || 0;
                          setSettings((prev) => ({
                            ...prev,
                            targetHeight: height,
                            targetWidth: prev.maintainAspectRatio
                              ? Math.round((height / image.originalHeight) * image.originalWidth)
                              : prev.targetWidth,
                          }));
                        }}
                        className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs" style={{ color: "var(--theme-muted)" }}>DPI</label>
                    <select
                      value={settings.targetDpi}
                      onChange={(e) => setSettings((prev) => ({ ...prev, targetDpi: parseInt(e.target.value) }))}
                      className="w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                      style={inputStyle}
                    >
                      <option value={72}>72 DPI (Web)</option>
                      <option value={150}>150 DPI</option>
                      <option value={300}>300 DPI (Print)</option>
                      <option value={600}>600 DPI (Ultra)</option>
                    </select>
                  </div>

                  {settings.method === "lanczos-sharp" && (
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <label className="text-xs" style={{ color: "var(--theme-muted)" }}>Nitidez</label>
                        <span className="text-xs" style={{ color: "var(--theme-primary)" }}>{settings.sharpenAmount}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="3"
                        step="0.5"
                        value={settings.sharpenAmount}
                        onChange={(e) => setSettings((prev) => ({ ...prev, sharpenAmount: parseFloat(e.target.value) }))}
                        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
                        style={{ accentColor: "var(--theme-primary)" }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 mt-3 border-t space-y-2 flex-shrink-0" style={{ borderColor: "color-mix(in srgb, var(--theme-primary) 12%, transparent)" }}>
                <button
                  onClick={handleScale}
                  disabled={isProcessing}
                  className="w-full text-white font-medium py-2.5 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: "var(--theme-primary)" }}
                >
                  {isProcessing ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {progress}%
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                        <polyline points="17 6 23 6 23 12" />
                      </svg>
                      Escalar
                    </>
                  )}
                </button>

                {scaledImageUrl && (
                  <button
                    onClick={handleDownload}
                    className="w-full font-medium py-2.5 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm"
                    style={{ backgroundColor: "color-mix(in srgb, var(--theme-text) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--theme-primary) 20%, transparent)", color: "var(--theme-text)" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Descargar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Panel derecho - Vista previa */}
        <div className="flex-1 border rounded-2xl p-4 flex items-center justify-center overflow-hidden" style={panelStyle}>
          {!image ? (
            <div className="text-center">
              <div
                className="w-24 h-24 mx-auto mb-4 rounded-2xl flex items-center justify-center border"
                style={{ backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)", borderColor: "color-mix(in srgb, var(--theme-primary) 30%, transparent)" }}
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--theme-primary)" }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--theme-text)" }}>Sube una imagen</h2>
              <p className="text-sm max-w-sm" style={{ color: "var(--theme-muted)" }}>
                Selecciona una imagen y elige el metodo de interpolacion
              </p>
            </div>
          ) : scaledImageUrl ? (
            <div className="w-full h-full">
              <BeforeAfterSlider beforeImage={image.originalUrl} afterImage={scaledImageUrl} />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col">
              <div className="flex-1 flex items-center justify-center overflow-hidden">
                <img src={image.originalUrl} alt="Original" className="max-w-full max-h-full object-contain rounded-xl" />
              </div>
              <div className="mt-3 text-center">
                <span
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ backgroundColor: "color-mix(in srgb, var(--theme-text) 10%, transparent)", color: "var(--theme-muted)" }}
                >
                  Original · {image.originalWidth} × {image.originalHeight}px
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
