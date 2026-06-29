// Tipos y constantes compartidos para el generador de texturas

export type PaperSize = "letter" | "legal" | "tabloid" | "custom";

export interface PaperDimensions {
  name: string;
  widthCm: number;
  heightCm: number;
  widthPx: number;
  heightPx: number;
}

export const PAPER_SIZES: Record<PaperSize, PaperDimensions> = {
  letter: { name: "Carta", widthCm: 27.94, heightCm: 21.59, widthPx: 3300, heightPx: 2550 },
  legal: { name: "Oficio", widthCm: 35.56, heightCm: 21.59, widthPx: 4200, heightPx: 2550 },
  tabloid: { name: "Tabloide", widthCm: 43.18, heightCm: 27.94, widthPx: 5100, heightPx: 3300 },
  custom: { name: "Personalizado", widthCm: 29.7, heightCm: 21, widthPx: 3508, heightPx: 2480 },
};

export const DPI = 300;
export const PX_PER_CM = DPI / 2.54;

export interface TextureImage {
  id: string;
  file: File;
  url: string;
  name: string;
  config: {
    scale: number;
    rotation: number;
    opacity: number;
    flipAlternate: boolean;
  };
}

export interface TextureSettings {
  paperSize: PaperSize;
  customWidth: number;
  customHeight: number;
}
