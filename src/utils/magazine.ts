export function blankPositions(total: number, _max: number, blanks: number, back: boolean): number[] {
  if (blanks === 0) return [];
  if (blanks === 1 && back) return [2];
  if (blanks === 1) return [total];
  if (blanks === 2) return [2, total - 1];
  if (blanks === 3 && back) return [2, total - 2, total - 1];
  if (blanks === 3) return [2, total - 1, total];
  if (back) return Array.from({ length: blanks }, (_, i) => 2 + i);
  return Array.from({ length: blanks }, (_, i) => 2 + i);
}

export function computePairs(total: number): [number, number][] {
  const pairs: [number, number][] = [];
  let low = 1;
  let high = total;
  while (low < high) {
    pairs.push([high, low]);
    low += 1;
    high -= 1;
    pairs.push([low, high]);
    low += 1;
    high -= 1;
  }
  return pairs;
}

export function isImageExt(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase();
  return !!ext && ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff"].includes(ext);
}

export function getFileNumber(name: string): number | null {
  const stem = name.split(".").slice(0, -1).join(".");
  const num = parseInt(stem, 10);
  return isNaN(num) ? null : num;
}

export async function convertToJpg(data: Uint8Array): Promise<Uint8Array> {
  const blob = new Blob([data]);
  const url = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = url;
  });
  URL.revokeObjectURL(url);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const blob2 = await new Promise<Blob>((r) => canvas.toBlob((b) => b && r(b), "image/jpeg", 0.95));
  return new Uint8Array(await blob2.arrayBuffer());
}
