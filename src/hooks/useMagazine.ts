import { useState, useCallback, useEffect, useRef } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readDir, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { PDFDocument } from "pdf-lib";
import { blankPositions, computePairs, isImageExt, getFileNumber, convertToJpg } from "../utils/magazine";
import type { AlertState, PageItem, SpreadPreview } from "../components/magazine/types";

export function useMagazine() {
  const [phase, setPhase] = useState<"upload" | "preview" | "generating">("upload");
  const [hasBackCover, setHasBackCover] = useState(true);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [previewSpreads, setPreviewSpreads] = useState<SpreadPreview[]>([]);
  const [stats, setStats] = useState({ total: 0, realImages: 0, blanks: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [alert, setAlert] = useState<AlertState>({ show: false, title: "", message: "", type: "info" });
  const workerRef = useRef<Worker | null>(null);
  const pagesRef = useRef<PageItem[]>([]);
  const thumbnailPendingRef = useRef(0);

  const showAlert = useCallback((title: string, message: string, type: AlertState["type"] = "info") => {
    setAlert({ show: true, title, message, type });
  }, []);

  const hideAlert = useCallback(() => setAlert((p) => ({ ...p, show: false })), []);

  useEffect(() => {
    const worker = new Worker(new URL("../workers/imageWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const { id, url } = e.data;
      if (url) {
        setPages((prev) => prev.map((p) => (p.id === id ? { ...p, thumbnailUrl: url } : p)));
      }
      thumbnailPendingRef.current = Math.max(0, thumbnailPendingRef.current - 1);
      setProgress((prev) => ({ ...prev, current: prev.current + 1 }));
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const loadImagesFromFolder = useCallback(async (folder: string) => {
    const entries = await readDir(folder);
    const candidates: { num: number; path: string }[] = [];
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      if (!isImageExt(entry.name)) continue;
      const num = getFileNumber(entry.name);
      if (num !== null) candidates.push({ num, path: `${folder}/${entry.name}` });
    }
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => a.num - b.num);
    const realImages = candidates.length;
    const totalPages = Math.ceil(realImages / 4) * 4;
    const blankCount = totalPages - realImages;
    const blanks = blankPositions(totalPages, realImages, blankCount, hasBackCover);

    let imgIdx = 0;
    const result: PageItem[] = [];
    for (let pos = 1; pos <= totalPages; pos++) {
      if (blanks.includes(pos)) {
        result.push({ id: pos, filePath: null, isBlank: true, name: `Pos ${pos}: BLANCO`, thumbnailUrl: null, imageData: null });
      } else {
        let candidateIdx: number;
        if (hasBackCover && pos === 1) { candidateIdx = 0; imgIdx = 1; }
        else if (hasBackCover && pos === totalPages) { candidateIdx = candidates.length - 1; }
        else { candidateIdx = imgIdx; imgIdx++; }
        result.push({
          id: pos,
          filePath: candidates[candidateIdx].path,
          isBlank: false,
          name: `Pos ${pos}: Img ${candidates[candidateIdx].num}`,
          thumbnailUrl: null,
          imageData: null,
        });
      }
    }
    return { pages: result, realImages, blankCount, totalPages };
  }, [hasBackCover]);

  const readAndThumbnail = useCallback(async (items: PageItem[]) => {
    const toRead = items.filter((p) => !p.isBlank && p.filePath);
    setProgress({ current: 0, total: toRead.length });
    thumbnailPendingRef.current = toRead.length;

    for (let i = 0; i < toRead.length; i += 3) {
      const batch = toRead.slice(i, i + 3);
      const results = await Promise.all(
        batch.map(async (p) => {
          try {
            const data = await readFile(p.filePath!);
            return { id: p.id, data, ok: true as const };
          } catch {
            console.error("Error reading file:", p.filePath);
            thumbnailPendingRef.current = Math.max(0, thumbnailPendingRef.current - 1);
            setProgress((prev) => ({ ...prev, current: prev.current + 1 }));
            return { id: p.id, data: new Uint8Array(), ok: false as const };
          }
        })
      );
      for (const r of results) {
        if (!r.ok) continue;
        setPages((prev) => {
          const next = [...prev];
          const idx = next.findIndex((x) => x.id === r.id);
          if (idx !== -1) next[idx] = { ...next[idx], imageData: r.data };
          return next;
        });
        workerRef.current?.postMessage({ id: r.id, data: r.data.buffer }, [r.data.buffer]);
      }
      if (i + 3 < toRead.length) await new Promise((r) => setTimeout(r, 5));
    }
    while (thumbnailPendingRef.current > 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }, []);

  const handlePickFolder = useCallback(async () => {
    const folder = await open({ directory: true, title: "Selecciona la carpeta con imagenes" });
    if (!folder || typeof folder !== "string") return;
    try {
      setIsLoading(true);
      const result = await loadImagesFromFolder(folder);
      if (!result) {
        showAlert("Error", "No se encontraron imagenes numeradas en la carpeta", "error");
        setIsLoading(false);
        return;
      }
      setStats({ total: result.totalPages, realImages: result.realImages, blanks: result.blankCount });
      setPages(result.pages);
      pagesRef.current = result.pages;
      await readAndThumbnail(result.pages);
      setIsLoading(false);
      showAlert(
        "Imagenes cargadas",
        `${result.realImages} imagenes cargadas.\nPaginas totales: ${result.totalPages}\nBlancos: ${result.blankCount > 0 ? result.blankCount : "Ninguno"}`,
        "success"
      );
    } catch (e) {
      showAlert("Error", typeof e === "string" ? e : "No se pudieron cargar las imagenes", "error");
      setIsLoading(false);
    }
  }, [loadImagesFromFolder, readAndThumbnail, showAlert]);

  const generatePreview = useCallback(() => {
    const total = pages.length;
    if (total === 0) return;
    const pairs = computePairs(total);
    const spreads: SpreadPreview[] = pairs.map(([ln, rn], i) => ({
      left: pages.find((p) => p.id === ln)!,
      right: pages.find((p) => p.id === rn)!,
      spreadNum: i + 1,
    }));
    setPreviewSpreads(spreads);
    setPhase("preview");
  }, [pages]);

  const handleGeneratePDF = async () => {
    setPhase("generating");
    setIsGenerating(true);
    try {
      const pdfPath = await save({
        defaultPath: "revista_cuadernillo.pdf",
        filters: [{ name: "PDF", extensions: ["pdf"] }],
        title: "Guardar PDF de cuadernillo",
      });
      if (!pdfPath) {
        setPhase("preview");
        setIsGenerating(false);
        return;
      }

      const currentPages = pagesRef.current;
      const pdfDoc = await PDFDocument.create();
      const pairs = computePairs(currentPages.length);
      const sw = 1224;
      const ph = 792;
      const hw = 612;

      setProgress({ current: 0, total: pairs.length });

      for (let i = 0; i < pairs.length; i += 2) {
        const batch = pairs.slice(i, i + 2);
        await Promise.all(
          batch.map(async ([leftNum, rightNum]) => {
            const leftPage = currentPages.find((p) => p.id === leftNum);
            const rightPage = currentPages.find((p) => p.id === rightNum);
            const spreadPage = pdfDoc.addPage([sw, ph]);

            if (leftPage?.imageData && !leftPage.isBlank) {
              const jpg = await convertToJpg(leftPage.imageData);
              const img = await pdfDoc.embedJpg(jpg);
              const { width, height } = img.scale(1);
              const sc = Math.min(hw / width, ph / height);
              spreadPage.drawImage(img, {
                x: (hw - width * sc) / 2,
                y: (ph - height * sc) / 2,
                width: width * sc,
                height: height * sc,
              });
            }
            if (rightPage?.imageData && !rightPage.isBlank) {
              const jpg = await convertToJpg(rightPage.imageData);
              const img = await pdfDoc.embedJpg(jpg);
              const { width, height } = img.scale(1);
              const sc = Math.min(hw / width, ph / height);
              spreadPage.drawImage(img, {
                x: hw + (hw - width * sc) / 2,
                y: (ph - height * sc) / 2,
                width: width * sc,
                height: height * sc,
              });
            }
          })
        );
        setProgress((prev) => ({ ...prev, current: prev.current + 2 }));
        if (i + 2 < pairs.length) await new Promise((r) => setTimeout(r, 5));
      }

      const pdfBytes = await pdfDoc.save();
      await writeFile(pdfPath, pdfBytes);

      showAlert("Exito", `PDF generado correctamente en:\n${pdfPath}`, "success");
      setPages([]);
      pagesRef.current = [];
      setPreviewSpreads([]);
      setPhase("upload");
    } catch (e) {
      showAlert("Error", typeof e === "string" ? e : "No se pudo generar el PDF", "error");
      setPhase("preview");
    }
    setIsGenerating(false);
  };

  const resetPages = useCallback(() => {
    setPages([]);
    pagesRef.current = [];
    setStats({ total: 0, realImages: 0, blanks: 0 });
  }, []);

  const goBackToUpload = useCallback(() => setPhase("upload"), []);

  return {
    phase,
    hasBackCover,
    setHasBackCover,
    pages,
    previewSpreads,
    stats,
    isLoading,
    isGenerating,
    progress,
    alert,
    handlePickFolder,
    hideAlert,
    generatePreview,
    handleGeneratePDF,
    resetPages,
    goBackToUpload,
  };
}
