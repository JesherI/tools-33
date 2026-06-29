import { useRef, useEffect, useMemo } from "react";
import type { TextureImage, PaperDimensions } from "./types";
import { PX_PER_CM } from "./types";

interface TextureCanvasProps {
  image: TextureImage | null;
  paperSize: PaperDimensions;
  zoom: number;
}

export function TextureCanvas({ image, paperSize, zoom }: TextureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const displayDimensions = useMemo(
    () => ({
      width: paperSize.widthCm * PX_PER_CM * zoom,
      height: paperSize.heightCm * PX_PER_CM * zoom,
    }),
    [paperSize, zoom]
  );

  useEffect(() => {
    if (!canvasRef.current || !image) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const paperWidth = paperSize.widthCm * PX_PER_CM;
      const paperHeight = paperSize.heightCm * PX_PER_CM;

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

      canvas.width = paperWidth;
      canvas.height = paperHeight;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

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

      ctx.strokeStyle = "rgba(247, 146, 6, 0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, canvas.width, canvas.height);
    };

    img.src = image.url;
  }, [image, paperSize, zoom]);

  return (
    <div className="relative" style={{ maxWidth: "100%", maxHeight: "100%" }}>
      <canvas
        ref={canvasRef}
        style={{
          width: displayDimensions.width,
          height: displayDimensions.height,
          imageRendering: "crisp-edges",
        }}
        className="block bg-white"
      />
    </div>
  );
}
