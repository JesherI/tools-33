self.onmessage = async (e: MessageEvent<{ id: number; data: ArrayBuffer }>) => {
  const { id, data } = e.data;
  try {
    const blob = new Blob([data]);
    const bitmap = await createImageBitmap(blob);
    let { width, height } = bitmap;
    const maxSize = 300;
    const ratio = Math.min(maxSize / width, maxSize / height);
    if (ratio < 1) {
      width = Math.floor(width * ratio);
      height = Math.floor(height * ratio);
    }
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const thumbBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 });
    const url = URL.createObjectURL(thumbBlob);
    self.postMessage({ id, url });
  } catch {
    self.postMessage({ id, url: null });
  }
};
