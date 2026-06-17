export interface AlertState {
  show: boolean;
  title: string;
  message: string;
  type: "info" | "success" | "error";
}

export interface PageItem {
  id: number;
  filePath: string | null;
  isBlank: boolean;
  name: string;
  thumbnailUrl: string | null;
  imageData: Uint8Array | null;
}

export interface SpreadPreview {
  left: PageItem;
  right: PageItem;
  spreadNum: number;
}
