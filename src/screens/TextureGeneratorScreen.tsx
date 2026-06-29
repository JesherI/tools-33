import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { PDFDocument } from "pdf-lib";
import PptxGenJS from "pptxgenjs";
import {
  Ruler,
  TextureCanvas,
  ImageList,
  BottomControls,
  PaperSizeSelector,
  ExportFormatSelector,
  type PaperDimensions,
  type TextureImage,
  type TextureSettings,
  PAPER_SIZES,
  PX_PER_CM,
} from "../components/texture";

async function renderTextureToCanvas(
  image: TextureImage,
  paperSize: PaperDimensions
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  const paperWidth = paperSize.widthCm * PX_PER_CM;
  const paperHeight = paperSize.heightCm * PX_PER_CM;

  canvas.width = paperWidth;
  canvas.height = paperHeight;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const img = await new Promise<HTMLImageElement>((resolve) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.src = image.url;
  });

  const scale = image.config.scale;
  const rotation = image.config.rotation;
  const rotationRad = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rotationRad));
  const sin = Math.abs(Math.sin(rotationRad));

  let imgWidth = img.width * scale;
  let imgHeight = img.height * scale;

  if (rotation !== 0) {
    const rotatedWidth = imgWidth * cos + imgHeight * sin;
    const rotatedHeight = imgWidth * sin + imgHeight * cos;
    imgWidth = rotatedWidth;
    imgHeight = rotatedHeight;
  }

  if (imgWidth > 0 && imgHeight > 0) {
    const cols = Math.ceil(paperWidth / imgWidth) + 1;
    const rows = Math.ceil(paperHeight / imgHeight) + 1;

    ctx.globalAlpha = image.config.opacity / 100;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * imgWidth;
        const y = row * imgHeight;

        ctx.save();
        ctx.translate(x + imgWidth / 2, y + imgHeight / 2);

        if (rotation !== 0) {
          ctx.rotate(rotationRad);
        }

        if (image.config.flipAlternate && (row + col) % 2 === 1) {
          ctx.scale(-1, 1);
        }

        ctx.drawImage(
          img,
          -(img.width * scale) / 2,
          -(img.height * scale) / 2,
          img.width * scale,
          img.height * scale
        );

        ctx.restore();
      }
    }

    ctx.globalAlpha = 1;
  }

  return canvas;
}

const yieldToMain = () => new Promise((resolve) => setTimeout(resolve, 0));

async function generateMultiDocument(
  images: TextureImage[],
  paperSize: PaperDimensions,
  format: "pdf" | "pptx",
  onProgress?: (current: number, total: number) => void
): Promise<Uint8Array> {
  if (format === "pptx") {
    const pptx = new PptxGenJS();
    const widthIn = paperSize.widthCm * 0.393701;
    const heightIn = paperSize.heightCm * 0.393701;

    pptx.defineLayout({ name: "CUSTOM", width: widthIn, height: heightIn });
    pptx.layout = "CUSTOM";

    for (let i = 0; i < images.length; i++) {
      const image = images[i];

      if (i > 0 && i % 3 === 0) {
        await yieldToMain();
      }

      const textureCanvas = await renderTextureToCanvas(image, paperSize);

      const blob = await new Promise<Blob>((resolve) => {
        textureCanvas.toBlob((b) => resolve(b!), "image/png", 0.8);
      });

      const base64Image = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const slide = pptx.addSlide();
      slide.addImage({
        data: base64Image,
        x: 0,
        y: 0,
        w: widthIn,
        h: heightIn,
      });

      onProgress?.(i + 1, images.length);
    }

    const result = (await pptx.write({ outputType: "arraybuffer", compression: true })) as ArrayBuffer;
    return new Uint8Array(result);
  }

  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < images.length; i++) {
    const image = images[i];

    if (i > 0 && i % 3 === 0) {
      await yieldToMain();
    }

    const textureCanvas = await renderTextureToCanvas(image, paperSize);

    const blob = await new Promise<Blob>((resolve) => {
      textureCanvas.toBlob((b) => resolve(b!), "image/png", 0.8);
    });

    const imageBytes = await blob.arrayBuffer();
    const page = pdfDoc.addPage([paperSize.widthPx, paperSize.heightPx]);
    const pdfImage = await pdfDoc.embedPng(imageBytes);

    page.drawImage(pdfImage, {
      x: 0,
      y: 0,
      width: paperSize.widthPx,
      height: paperSize.heightPx,
    });

    onProgress?.(i + 1, images.length);
  }

  return await pdfDoc.save({ useObjectStreams: true });
}

interface AlertState {
  show: boolean;
  message: string;
  type: "info" | "success" | "error";
}

export default function TextureGeneratorScreen() {
  const win = getCurrentWindow();
  const [images, setImages] = useState<TextureImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [zoom, setZoom] = useState(0.3);
  const [isGenerating, setIsGenerating] = useState(false);
  const [exportFormat, setExportFormat] = useState<"pdf" | "pptx">("pdf");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [alert, setAlert] = useState<AlertState>({ show: false, message: "", type: "info" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nativeDragActive, setNativeDragActive] = useState(false);
  const nativeDragCounter = useRef(0);
  const nativeDropHandled = useRef(false);

  const [settings, setSettings] = useState<TextureSettings>({
    paperSize: "letter",
    customWidth: 27.94,
    customHeight: 21.59,
  });

  const selectedImage = useMemo(
    () => images.find((img) => img.id === selectedImageId) || null,
    [images, selectedImageId]
  );

  const showAlert = useCallback((message: string, type: AlertState["type"] = "info") => {
    setAlert({ show: true, message, type });
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    alertTimerRef.current = setTimeout(() => setAlert((a) => ({ ...a, show: false })), 2600);
  }, []);

  useEffect(() => {
    return () => {
      if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        setZoom((prev) => {
          const newZoom = Math.round((prev + delta) * 100) / 100;
          return Math.max(0.2, Math.min(1.5, newZoom));
        });
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  const currentPaperSize = useMemo((): PaperDimensions => {
    if (settings.paperSize === "custom") {
      const w = Math.max(settings.customWidth, settings.customHeight);
      const h = Math.min(settings.customWidth, settings.customHeight);
      return {
        name: "Personalizado",
        widthCm: w,
        heightCm: h,
        widthPx: Math.round(w * PX_PER_CM),
        heightPx: Math.round(h * PX_PER_CM),
      };
    }
    return PAPER_SIZES[settings.paperSize];
  }, [settings]);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;

      Array.from(files).forEach((file) => {
        if (!file.type.startsWith("image/")) return;

        const id = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        const url = URL.createObjectURL(file);

        const newImage: TextureImage = {
          id,
          file,
          url,
          name: file.name,
          config: {
            scale: 0.5,
            rotation: 0,
            opacity: 100,
            flipAlternate: false,
          },
        };

        setImages((prev) => [newImage, ...prev]);
        setSelectedImageId((prev) => prev ?? id);
      });
    },
    []
  );

  const handleNativeDropFiles = useCallback(async (paths: string[]) => {
    for (const filePath of paths) {
      if (!filePath.match(/\.(png|jpg|jpeg|gif|webp|bmp|tiff?)$/i)) continue;
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

        const id = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        const url = URL.createObjectURL(file);

        const newImage: TextureImage = {
          id,
          file,
          url,
          name: file.name,
          config: {
            scale: 0.5,
            rotation: 0,
            opacity: 100,
            flipAlternate: false,
          },
        };

        setImages((prev) => [newImage, ...prev]);
        setSelectedImageId((prev) => prev ?? id);
      } catch (err) {
        console.error("Error al leer archivo nativo:", err);
      }
    }
  }, []);

  // Drag & drop nativo de Tauri
  useEffect(() => {
    let unlisten: (() => void) | undefined;
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
          nativeDropHandled.current = true;
          handleNativeDropFiles(event.payload.paths);
        }
      });
    })();
    return () => {
      unlisten?.();
    };
  }, [handleNativeDropFiles]);

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
    // Si el manejador nativo de Tauri ya procesó el drop, evitar duplicar
    if (nativeDropHandled.current) {
      nativeDropHandled.current = false;
      return;
    }
    handleFiles(e.dataTransfer.files);
  };

  const updateImageConfig = (id: string, config: Partial<TextureImage["config"]>) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, config: { ...img.config, ...config } } : img))
    );
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const filtered = prev.filter((img) => img.id !== id);
      if (selectedImageId === id) {
        setSelectedImageId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  };

  const handleSave = async () => {
    if (images.length === 0) {
      showAlert("Agrega al menos una imagen primero", "error");
      return;
    }

    setIsGenerating(true);
    setProgress({ current: 0, total: images.length });

    try {
      const extension = exportFormat === "pdf" ? "pdf" : "pptx";
      const fileBytes = await generateMultiDocument(images, currentPaperSize, exportFormat, (current, total) =>
        setProgress({ current, total })
      );

      const filePath = await save({
        defaultPath: `texturas_${images.length}.${extension}`,
        filters: [{ name: exportFormat.toUpperCase(), extensions: [extension] }],
        title: "Guardar archivo de texturas",
      });

      if (filePath) {
        await writeFile(filePath, fileBytes);
        showAlert("Guardado correctamente", "success");
      }
    } catch (error) {
      console.error("Error al guardar:", error);
      showAlert("Error al guardar", "error");
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  };

  const panelBg: React.CSSProperties = {
    backgroundColor: "color-mix(in srgb, var(--theme-bg) 60%, transparent)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
  };

  const alertColors =
    alert.type === "error"
      ? { bg: "color-mix(in srgb, #ef4444 20%, transparent)", border: "color-mix(in srgb, #ef4444 30%, transparent)", color: "#ef4444" }
      : alert.type === "success"
      ? { bg: "color-mix(in srgb, #22c55e 20%, transparent)", border: "color-mix(in srgb, #22c55e 30%, transparent)", color: "#22c55e" }
      : { bg: "color-mix(in srgb, var(--theme-primary) 20%, transparent)", border: "color-mix(in srgb, var(--theme-primary) 30%, transparent)", color: "var(--theme-primary)" };

  return (
    <div
      className="w-full h-full min-h-0 flex flex-col overflow-hidden relative"
      style={{ backgroundColor: "var(--theme-bg)" }}
    >
      {/* Banner de alerta */}
      {alert.show && (
        <div
          className="absolute top-12 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl border shadow-2xl flex items-center gap-3 min-w-[260px] max-w-lg"
          style={{
            backgroundColor: alertColors.bg,
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            borderColor: alertColors.border,
            color: alertColors.color,
          }}
        >
          <span className="text-xs font-semibold flex-1">{alert.message}</span>
          <button
            onClick={() => setAlert((a) => ({ ...a, show: false }))}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Barra superior unificada con controles de ventana */}
      <div
        data-tauri-drag-region
        className="flex-shrink-0 h-10 pl-4 pr-3 gap-3 border-b flex items-center select-none"
        style={{
          backgroundColor: "var(--theme-bg)",
          borderColor: "color-mix(in srgb, var(--theme-primary) 12%, transparent)",
        }}
      >
        <PaperSizeSelector
          selected={settings.paperSize}
          customWidth={settings.customWidth}
          customHeight={settings.customHeight}
          onSelect={(size) => setSettings((s) => ({ ...s, paperSize: size }))}
          onCustomWidthChange={(w) => setSettings((s) => ({ ...s, customWidth: w }))}
          onCustomHeightChange={(h) => setSettings((s) => ({ ...s, customHeight: h }))}
        />

        <div className="text-xs whitespace-nowrap" style={{ color: "var(--theme-muted)" }}>
          {currentPaperSize.widthCm.toFixed(1)} × {currentPaperSize.heightCm.toFixed(1)} cm
        </div>

        <div className="flex-1" />

        <ExportFormatSelector value={exportFormat} onChange={setExportFormat} />
        <button
          onClick={handleSave}
          disabled={images.length === 0 || isGenerating}
          className="px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: "var(--theme-primary)" }}
        >
          {isGenerating ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>{progress ? `${progress.current}/${progress.total}` : "..."}</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
              </svg>
              <span>Guardar ({images.length})</span>
            </>
          )}
        </button>

        {/* Controles de ventana (mismo estilo que TitleBar) */}
        <div className="flex items-center gap-2 pl-1">
          <button
            onClick={() => win.minimize()}
            className="group relative w-3.5 h-3.5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--theme-primary)" }}
            aria-label="Minimize"
          >
            <svg className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200" viewBox="0 0 12 12" fill="none">
              <path d="M2 6h8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <button
            onClick={() => win.toggleMaximize()}
            className="group relative w-3.5 h-3.5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--theme-primary)" }}
            aria-label="Maximize"
          >
            <svg className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200" viewBox="0 0 12 12" fill="none">
              <rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="#fff" strokeWidth="1.5" />
            </svg>
          </button>
          <button
            onClick={() => win.close()}
            className="group relative w-3.5 h-3.5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--theme-primary)" }}
            aria-label="Close"
          >
            <svg className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Panel izquierdo */}
        <div
          className="w-56 flex-shrink-0 border-r flex flex-col"
          style={{ ...panelBg, borderColor: "color-mix(in srgb, var(--theme-primary) 12%, transparent)" }}
        >
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="m-3 p-4 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all"
            style={{
              borderColor: dragActive || nativeDragActive
                ? "var(--theme-primary)"
                : "color-mix(in srgb, var(--theme-text) 20%, transparent)",
              backgroundColor: dragActive || nativeDragActive ? "color-mix(in srgb, var(--theme-primary) 10%, transparent)" : "transparent",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
            />
            <svg
              className="w-7 h-7 mx-auto mb-1.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ color: "var(--theme-muted)" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm font-medium" style={{ color: "var(--theme-text)" }}>Agregar</p>
            <p className="text-xs" style={{ color: "var(--theme-muted)" }}>Arrastra aquí</p>
          </div>

          <div className="flex-1 px-3 pb-2 overflow-hidden">
            <ImageList
              images={images}
              selectedId={selectedImageId}
              onSelect={setSelectedImageId}
              onRemove={removeImage}
            />
          </div>
        </div>

        {/* Panel central */}
        <div
          className="flex-1 flex flex-col overflow-hidden min-h-0"
          style={{ backgroundColor: "color-mix(in srgb, var(--theme-text) 8%, var(--theme-bg))" }}
        >
          {/* Área de trabajo con scroll */}
          <div className="flex-1 overflow-auto scrollbar-thin min-h-0">
            <div className="min-w-full min-h-full flex items-start justify-start p-8">
              {/* Contenedor con regletas */}
              <div className="relative inline-block">
                {/* Regleta superior */}
                <div className="absolute -top-7 left-6">
                  <Ruler
                    orientation="horizontal"
                    length={currentPaperSize.widthCm * PX_PER_CM * zoom}
                    cmLength={currentPaperSize.widthCm}
                  />
                </div>

                {/* Regleta lateral */}
                <div className="absolute -left-7 top-6">
                  <Ruler
                    orientation="vertical"
                    length={currentPaperSize.heightCm * PX_PER_CM * zoom}
                    cmLength={currentPaperSize.heightCm}
                  />
                </div>

                {/* Canvas con margen para las regletas */}
                <div className="ml-6 mt-6">
                  {!selectedImage ? (
                    <div
                      className="w-72 h-52 flex flex-col items-center justify-center border-2 border-dashed rounded-xl"
                      style={{
                        borderColor: "color-mix(in srgb, var(--theme-text) 20%, transparent)",
                        backgroundColor: "color-mix(in srgb, var(--theme-bg) 20%, transparent)",
                      }}
                    >
                      <svg
                        width="44"
                        height="44"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="mb-2 opacity-50"
                        style={{ color: "var(--theme-primary)" }}
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M3 9h18M9 21V9" />
                      </svg>
                      <p className="text-sm" style={{ color: "var(--theme-muted)" }}>Selecciona una imagen</p>
                    </div>
                  ) : (
                    <div className="bg-white shadow-lg">
                      <TextureCanvas image={selectedImage} paperSize={currentPaperSize} zoom={zoom} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <BottomControls image={selectedImage} onUpdate={updateImageConfig} zoom={zoom} onZoomChange={setZoom} />
        </div>
      </div>
    </div>
  );
}
