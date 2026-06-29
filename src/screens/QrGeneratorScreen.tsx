import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import QRCodeLib from "qrcode";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

type QrType =
  | "text" | "url" | "youtube" | "drive"
  | "wifi" | "email" | "phone" | "whatsapp"
  | "sms" | "bank" | "vcard" | "location" | "event";

type ModuleShape = "square" | "rounded" | "circle" | "diamond";

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "url" | "email" | "tel" | "textarea" | "select";
  options?: { label: string; value: string }[];
  required?: boolean;
}

interface TypeConfig {
  label: string;
  icon: string;
  fields: FieldDef[];
  generate: (values: Record<string, string>) => string;
}

const QR_TYPES: Record<QrType, TypeConfig> = {
  text: {
    label: "Texto", icon: "text",
    fields: [{ key: "text", label: "Contenido", placeholder: "Escribe cualquier texto...", type: "textarea", required: true }],
    generate: (v) => v.text || "",
  },
  url: {
    label: "URL", icon: "url",
    fields: [{ key: "url", label: "URL", placeholder: "https://ejemplo.com", type: "url", required: true }],
    generate: (v) => v.url || "",
  },
  youtube: {
    label: "YouTube", icon: "youtube",
    fields: [{ key: "url", label: "URL del video", placeholder: "https://youtube.com/watch?v=...", type: "url", required: true }],
    generate: (v) => v.url || "",
  },
  drive: {
    label: "Google Drive", icon: "drive",
    fields: [{ key: "url", label: "URL del archivo", placeholder: "https://drive.google.com/file/d/...", type: "url", required: true }],
    generate: (v) => v.url || "",
  },
  wifi: {
    label: "Wi-Fi", icon: "wifi",
    fields: [
      { key: "ssid", label: "Nombre (SSID)", placeholder: "Mi Red WiFi", type: "text", required: true },
      { key: "password", label: "Contraseña", placeholder: "••••••••", type: "text" },
      { key: "encryption", label: "Encriptación", placeholder: "Selecciona", type: "select", required: true, options: [
        { label: "WPA/WPA2", value: "WPA" }, { label: "WEP", value: "WEP" }, { label: "Sin contraseña", value: "nopass" },
      ]},
    ],
    generate: (v) => `WIFI:T:${v.encryption || "WPA"};S:${v.ssid || ""};P:${v.password || ""};;`,
  },
  email: {
    label: "Correo", icon: "email",
    fields: [
      { key: "email", label: "Para", placeholder: "correo@ejemplo.com", type: "email", required: true },
      { key: "subject", label: "Asunto", placeholder: "Asunto del correo", type: "text" },
      { key: "body", label: "Mensaje", placeholder: "Cuerpo del mensaje...", type: "textarea" },
    ],
    generate: (v) => {
      let s = `mailto:${v.email || ""}`;
      const params: string[] = [];
      if (v.subject) params.push(`subject=${encodeURIComponent(v.subject)}`);
      if (v.body) params.push(`body=${encodeURIComponent(v.body)}`);
      if (params.length) s += `?${params.join("&")}`;
      return s;
    },
  },
  phone: {
    label: "Teléfono", icon: "phone",
    fields: [{ key: "phone", label: "Número", placeholder: "+521234567890", type: "tel", required: true }],
    generate: (v) => `tel:${v.phone || ""}`,
  },
  whatsapp: {
    label: "WhatsApp", icon: "whatsapp",
    fields: [{ key: "phone", label: "Número", placeholder: "+521234567890", type: "tel", required: true }],
    generate: (v) => `https://wa.me/${(v.phone || "").replace(/[^0-9]/g, "")}`,
  },
  sms: {
    label: "SMS", icon: "sms",
    fields: [
      { key: "phone", label: "Número", placeholder: "+521234567890", type: "tel", required: true },
      { key: "message", label: "Mensaje", placeholder: "Escribe tu mensaje...", type: "textarea" },
    ],
    generate: (v) => `SMSTO:${v.phone || ""}:${v.message || ""}`,
  },
  bank: {
    label: "Cuenta Bancaria", icon: "bank",
    fields: [
      { key: "holder", label: "Titular", placeholder: "Nombre del titular", type: "text", required: true },
      { key: "account", label: "Número de cuenta", placeholder: "0000 0000 0000 0000", type: "text", required: true },
      { key: "bank", label: "Banco", placeholder: "Nombre del banco", type: "text" },
      { key: "clabe", label: "CLABE", placeholder: "000000000000000000", type: "text" },
    ],
    generate: (v) => {
      const lines = ["--- DATOS BANCARIOS ---"];
      if (v.holder) lines.push(`Titular: ${v.holder}`);
      if (v.account) lines.push(`Cuenta: ${v.account}`);
      if (v.bank) lines.push(`Banco: ${v.bank}`);
      if (v.clabe) lines.push(`CLABE: ${v.clabe}`);
      lines.push("------------------------");
      return lines.join("\n");
    },
  },
  vcard: {
    label: "Contacto", icon: "vcard",
    fields: [
      { key: "name", label: "Nombre completo", placeholder: "Juan Pérez", type: "text", required: true },
      { key: "phone", label: "Teléfono", placeholder: "+521234567890", type: "tel" },
      { key: "email", label: "Correo", placeholder: "correo@ejemplo.com", type: "email" },
      { key: "org", label: "Empresa", placeholder: "Mi Empresa", type: "text" },
      { key: "title", label: "Puesto", placeholder: "Desarrollador", type: "text" },
      { key: "url", label: "Sitio web", placeholder: "https://ejemplo.com", type: "url" },
    ],
    generate: (v) => {
      const parts = ["BEGIN:VCARD", "VERSION:3.0"];
      if (v.name) parts.push(`FN:${v.name}`);
      if (v.phone) parts.push(`TEL:${v.phone}`);
      if (v.email) parts.push(`EMAIL:${v.email}`);
      if (v.org) parts.push(`ORG:${v.org}`);
      if (v.title) parts.push(`TITLE:${v.title}`);
      if (v.url) parts.push(`URL:${v.url}`);
      parts.push("END:VCARD");
      return parts.join("\n");
    },
  },
  location: {
    label: "Ubicación", icon: "location",
    fields: [
      { key: "lat", label: "Latitud", placeholder: "19.4326", type: "text", required: true },
      { key: "lon", label: "Longitud", placeholder: "-99.1332", type: "text", required: true },
    ],
    generate: (v) => `geo:${v.lat || ""},${v.lon || ""}`,
  },
  event: {
    label: "Evento", icon: "event",
    fields: [
      { key: "summary", label: "Título", placeholder: "Título del evento", type: "text", required: true },
      { key: "start", label: "Inicio (YYYYMMDDTHHMMSS)", placeholder: "20250616T150000", type: "text", required: true },
      { key: "end", label: "Fin (YYYYMMDDTHHMMSS)", placeholder: "20250616T170000", type: "text" },
      { key: "location", label: "Lugar", placeholder: "Dirección del evento", type: "text" },
      { key: "description", label: "Descripción", placeholder: "Descripción del evento...", type: "textarea" },
    ],
    generate: (v) => {
      const parts = ["BEGIN:VEVENT"];
      if (v.summary) parts.push(`SUMMARY:${v.summary}`);
      if (v.start) parts.push(`DTSTART:${v.start}`);
      if (v.end) parts.push(`DTEND:${v.end}`);
      if (v.location) parts.push(`LOCATION:${v.location}`);
      if (v.description) parts.push(`DESCRIPTION:${v.description}`);
      parts.push("END:VEVENT");
      return parts.join("\n");
    },
  },
};

const ERROR_LEVELS = [
  { label: "L", value: "L", desc: "7% recuperación" },
  { label: "M", value: "M", desc: "15% recuperación" },
  { label: "Q", value: "Q", desc: "25% recuperación" },
  { label: "H", value: "H", desc: "30% recuperación" },
] as const;

const SHAPES: { label: string; value: ModuleShape }[] = [
  { label: "Cuadrado", value: "square" },
  { label: "Redondeado", value: "rounded" },
  { label: "Círculo", value: "circle" },
  { label: "Diamante", value: "diamond" },
];

// ─── SVG Icons ────────────────────────────────────────────────

function Icon({ name, size = 20, className = "" }: { name: string; size?: number; className?: string }) {
  const s: Record<string, React.ReactNode> = {
    text: <><rect x="4" y="4" width="16" height="16" rx="2" /><line x1="8" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="14" y2="14" /></>,
    url: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
    youtube: <><rect x="2" y="6" width="20" height="12" rx="2" /><polygon points="10,9 15,12 10,15" fill="currentColor" /></>,
    drive: <><path d="M6 2L2 8l6 14h8l6-14-4-6z" /><line x1="2" y1="8" x2="22" y2="8" /></>,
    wifi: <><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><circle cx="12" cy="20" r="1" fill="currentColor" /></>,
    email: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>,
    phone: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></>,
    whatsapp: <><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" /><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1zm0 0v.5c0 .5.5 1 1.5 1.5s1.5 0 1.5-.5v-.5m0 0V9a.5.5 0 0 1 1 0v1a.5.5 0 0 1-1 0zm0 0h.5" /></>,
    sms: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><line x1="8" y1="10" x2="16" y2="10" /><line x1="8" y1="13" x2="13" y2="13" /></>,
    bank: <><rect x="2" y="8" width="20" height="14" rx="1" /><line x1="2" y1="11" x2="22" y2="11" /><line x1="6" y1="4" x2="18" y2="4" /><line x1="10" y1="4" x2="10" y2="8" /><line x1="14" y1="4" x2="14" y2="8" /></>,
    vcard: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    location: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
    event: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    shape_square: <><rect x="5" y="5" width="14" height="14" rx="1" /></>,
    shape_rounded: <><rect x="5" y="5" width="14" height="14" rx="3" /></>,
    shape_circle: <><circle cx="12" cy="12" r="7" /></>,
    shape_diamond: <><polygon points="12,4 20,12 12,20 4,12" /></>,
    qr: <><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="3" width="6" height="6" rx="1" /><rect x="3" y="15" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /><line x1="6" y1="6" x2="6" y2="6.01" /><line x1="18" y1="6" x2="18" y2="6.01" /><line x1="6" y1="18" x2="6" y2="18.01" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>,
    close: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {s[name] ?? s.text}
    </svg>
  );
}

// ─── QR Rendering ─────────────────────────────────────────────

function getCellSize(modules: number, size: number, margin: number) {
  return (size - margin * 2) / modules;
}

function drawModule(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, shape: ModuleShape) {
  const pad = shape === "circle" ? s * 0.08 : s * 0.04;
  const inner = s - pad * 2;
  const cx = x + s / 2;
  const cy = y + s / 2;

  switch (shape) {
    case "circle": {
      ctx.beginPath();
      ctx.arc(cx, cy, inner / 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "rounded": {
      const r = inner * 0.3;
      const x0 = x + pad, x1 = x + s - pad, y0 = y + pad, y1 = y + s - pad;
      ctx.beginPath();
      ctx.moveTo(x0 + r, y0); ctx.lineTo(x1 - r, y0);
      ctx.quadraticCurveTo(x1, y0, x1, y0 + r);
      ctx.lineTo(x1, y1 - r); ctx.quadraticCurveTo(x1, y1, x1 - r, y1);
      ctx.lineTo(x0 + r, y1); ctx.quadraticCurveTo(x0, y1, x0, y1 - r);
      ctx.lineTo(x0, y0 + r); ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
      ctx.closePath(); ctx.fill();
      break;
    }
    case "diamond": {
      ctx.beginPath();
      ctx.moveTo(cx, y + pad); ctx.lineTo(x + s - pad, cy);
      ctx.lineTo(cx, y + s - pad); ctx.lineTo(x + pad, cy);
      ctx.closePath(); ctx.fill();
      break;
    }
    default: {
      ctx.fillRect(x + pad / 2, y + pad / 2, s - pad, s - pad);
    }
  }
}

function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  matrix: boolean[][],
  options: {
    size: number;
    margin: number;
    darkColor: string;
    lightColor: string | null;
    shape: ModuleShape;
    logoDataUrl?: string | null;
    logoSize?: number;
  }
) {
  const { size, margin, darkColor, lightColor, shape, logoDataUrl, logoSize = 0 } = options;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.scale(dpr, dpr);

  if (lightColor) {
    ctx.fillStyle = lightColor;
    ctx.fillRect(0, 0, size, size);
  } else {
    ctx.clearRect(0, 0, size, size);
  }

  const modules = matrix.length;
  const cellSize = getCellSize(modules, size, margin);
  const offset = margin;

  ctx.fillStyle = darkColor;

  const finder = (r: number, c: number) =>
    (r < 7 && c < 7) ||
    (r < 7 && c >= modules - 7) ||
    (r >= modules - 7 && c < 7);

  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (!matrix[row][col]) continue;
      const x = offset + col * cellSize;
      const y = offset + row * cellSize;

      if (finder(row, col)) {
        ctx.fillRect(x, y, cellSize, cellSize);
      } else {
        drawModule(ctx, x, y, cellSize, shape);
      }
    }
  }

  if (logoDataUrl) {
    const logoDim = logoSize || size * 0.22;
    const lx = (size - logoDim) / 2;
    const ly = (size - logoDim) / 2;

    if (lightColor) {
      ctx.fillStyle = lightColor;
      ctx.fillRect(lx - 4, ly - 4, logoDim + 8, logoDim + 8);
    }

    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(lx, ly, logoDim, logoDim, 8);
      ctx.clip();
      ctx.drawImage(img, lx, ly, logoDim, logoDim);
      ctx.restore();
    };
    img.onerror = () => {};
    img.src = logoDataUrl;
  }
}

function generateSvgString(
  matrix: boolean[][],
  options: {
    size: number;
    margin: number;
    darkColor: string;
    lightColor: string | null;
    shape: ModuleShape;
  }
): string {
  const { size, margin, darkColor, lightColor, shape } = options;
  const modules = matrix.length;
  const cellSize = getCellSize(modules, size, margin);
  const offset = margin;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;

  if (lightColor) {
    svg += `<rect width="${size}" height="${size}" fill="${lightColor}"/>`;
  }

  const finder = (r: number, c: number) =>
    (r < 7 && c < 7) ||
    (r < 7 && c >= modules - 7) ||
    (r >= modules - 7 && c < 7);

  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (!matrix[row][col]) continue;
      const x = offset + col * cellSize;
      const y = offset + row * cellSize;

      if (finder(row, col)) {
        svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${darkColor}"/>`;
        continue;
      }

      const pad = shape === "circle" ? cellSize * 0.08 : cellSize * 0.04;
      const inner = cellSize - pad * 2;
      const cx = x + cellSize / 2;
      const cy = y + cellSize / 2;

      switch (shape) {
        case "circle":
          svg += `<circle cx="${cx}" cy="${cy}" r="${inner / 2}" fill="${darkColor}"/>`;
          break;
        case "rounded":
          svg += `<rect x="${x + pad}" y="${y + pad}" width="${inner}" height="${inner}" fill="${darkColor}" rx="${inner * 0.3}" ry="${inner * 0.3}"/>`;
          break;
        case "diamond":
          svg += `<polygon points="${cx},${y + pad} ${x + cellSize - pad},${cy} ${cx},${y + cellSize - pad} ${x + pad},${cy}" fill="${darkColor}"/>`;
          break;
        default:
          svg += `<rect x="${x + pad / 2}" y="${y + pad / 2}" width="${cellSize - pad}" height="${cellSize - pad}" fill="${darkColor}"/>`;
      }
    }
  }

  svg += "</svg>";
  return svg;
}

// ─── Native file save (Tauri) ─────────────────────────────────

async function saveBlob(blob: Blob, defaultName: string) {
  const path = await save({ defaultPath: defaultName });
  if (!path) return;
  const buf = await blob.arrayBuffer();
  await writeFile(path, new Uint8Array(buf));
}

async function saveText(text: string, defaultName: string) {
  const path = await save({ defaultPath: defaultName });
  if (!path) return;
  await writeFile(path, new TextEncoder().encode(text));
}

// ─── Main Component ───────────────────────────────────────────

export default function QrGeneratorScreen() {
  const [qrType, setQrType] = useState<QrType>("text");
  const [values, setValues] = useState<Record<string, string>>({});
  const [darkColor, setDarkColor] = useState("#f79206");
  const [lightColor, setLightColor] = useState("#ffffff");
  const [transparentBg, setTransparentBg] = useState(false);
  const [errorLevel, setErrorLevel] = useState<string>("M");
  const [qrSize, setQrSize] = useState(320);
  const [margin, setMargin] = useState(2);
  const [shape, setShape] = useState<ModuleShape>("rounded");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [matrix, setMatrix] = useState<boolean[][] | null>(null);

  const config = QR_TYPES[qrType];

  const qrText = useMemo(() => config.generate(values), [values, config]);

  const generateMatrix = useCallback(async () => {
    const text = qrText;
    if (!text.trim()) {
      setMatrix(null);
      return;
    }
    try {
      const qr = QRCodeLib.create(text, {
        errorCorrectionLevel: errorLevel as "L" | "M" | "Q" | "H",
      });
      const m: boolean[][] = [];
      const size = qr.modules.size;
      for (let r = 0; r < size; r++) {
        const row: boolean[] = [];
        for (let c = 0; c < size; c++) {
          row.push(!!qr.modules.get(r, c));
        }
        m.push(row);
      }
      setMatrix(m);
    } catch {
      setMatrix(null);
    }
  }, [errorLevel, qrText]);

  useEffect(() => {
    generateMatrix();
  }, [generateMatrix]);

  useEffect(() => {
    if (!canvasRef.current || !matrix) return;
    const actualLight = transparentBg ? null : lightColor;
    renderQrToCanvas(canvasRef.current, matrix, {
      size: qrSize,
      margin,
      darkColor,
      lightColor: actualLight,
      shape,
      logoDataUrl: logoDataUrl,
      logoSize: logoSize,
    });
  }, [matrix, qrSize, margin, darkColor, lightColor, transparentBg, shape, logoDataUrl, logoSize]);

  const handleTypeChange = (type: QrType) => {
    setQrType(type);
    setValues({});
  };

  const handleFieldChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLogoDataUrl(ev.target?.result as string);
      setLogoSize(qrSize * 0.22);
      if (errorLevel === "L") setErrorLevel("H");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoDataUrl(null);
    setLogoSize(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownloadPng = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/png")
    );
    if (blob) await saveBlob(blob, `qr-${qrType}.png`);
  };

  const handleDownloadWebp = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/webp")
    );
    if (blob) await saveBlob(blob, `qr-${qrType}.webp`);
  };

  const handleDownloadSvg = async () => {
    if (!matrix) return;
    const actualLight = transparentBg ? null : lightColor;
    const svg = generateSvgString(matrix, {
      size: qrSize,
      margin,
      darkColor,
      lightColor: actualLight,
      shape,
    });
    await saveText(svg, `qr-${qrType}.svg`);
  };

  const isQrValid = qrText.trim().length > 0;
  const typeEntries = Object.entries(QR_TYPES) as [QrType, TypeConfig][];

  // Theme helpers
  const panelStyle: React.CSSProperties = {
    backgroundColor: "color-mix(in srgb, var(--theme-bg) 55%, transparent)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    borderColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
  };

  const inputClass =
    "w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:ring-1";
  const inputStyle: React.CSSProperties = {
    backgroundColor: "color-mix(in srgb, var(--theme-bg) 40%, transparent)",
    border: "1px solid",
    borderColor: "color-mix(in srgb, var(--theme-primary) 20%, transparent)",
    color: "var(--theme-text)",
  };
  const inputFocusStyle = (el: HTMLElement, focus: boolean) => {
    el.style.borderColor = focus
      ? "color-mix(in srgb, var(--theme-primary) 60%, transparent)"
      : "color-mix(in srgb, var(--theme-primary) 20%, transparent)";
    el.style.backgroundColor = focus
      ? "color-mix(in srgb, var(--theme-primary) 8%, transparent)"
      : "color-mix(in srgb, var(--theme-bg) 40%, transparent)";
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col items-center text-center mb-6">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)", color: "var(--theme-primary)" }}
        >
          <Icon name="qr" size={32} />
        </div>
        <h1 className="text-3xl font-bold" style={{ color: "var(--theme-primary)" }}>
          Generador QR
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--theme-muted)" }}>
          Crea codigos QR personalizados con forma, color, logo y exportacion PNG / SVG / WebP
        </p>
      </div>

      {/* Type selector */}
      <div className="scrollbar-thin -mx-1 mb-6 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {typeEntries.map(([type, cfg]) => {
          const active = qrType === type;
          return (
            <button
              key={type}
              onClick={() => handleTypeChange(type)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200"
              style={{
                backgroundColor: active
                  ? "var(--theme-primary)"
                  : "color-mix(in srgb, var(--theme-bg) 40%, transparent)",
                color: active ? "#ffffff" : "var(--theme-muted)",
                border: "1px solid",
                borderColor: active
                  ? "var(--theme-primary)"
                  : "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "var(--theme-text)"; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "var(--theme-muted)"; }}
            >
              <Icon name={cfg.icon} size={16} />
              <span>{cfg.label}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left: form + customization */}
        <div className="flex flex-col gap-6">
          {/* Fields */}
          <div className="animate-fade-slide-up rounded-2xl border p-5 sm:p-6" style={panelStyle}>
            <div className="mb-4 flex items-center gap-2">
              <Icon name={config.icon} size={16} className="text-theme-primary" />
              <h2 className="text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: "var(--theme-primary)" }}>
                {config.label}
              </h2>
            </div>
            <div className="flex flex-col gap-4">
              {config.fields.map((field) => (
                <div key={field.key}>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--theme-muted)" }}>
                    {field.label}
                    {field.required && <span className="ml-1" style={{ color: "var(--theme-primary)" }}>*</span>}
                  </label>
                  {field.type === "select" ? (
                    <select
                      value={values[field.key] || field.options?.[0]?.value || ""}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      className={inputClass}
                      style={inputStyle}
                    >
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea
                      value={values[field.key] || ""}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      rows={3}
                      className={`${inputClass} resize-none`}
                      style={inputStyle}
                      onFocus={(e) => inputFocusStyle(e.currentTarget, true)}
                      onBlur={(e) => inputFocusStyle(e.currentTarget, false)}
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={values[field.key] || ""}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className={inputClass}
                      style={inputStyle}
                      onFocus={(e) => inputFocusStyle(e.currentTarget, true)}
                      onBlur={(e) => inputFocusStyle(e.currentTarget, false)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Customization */}
          <div className="animate-fade-slide-up rounded-2xl border p-5 sm:p-6" style={panelStyle}>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: "var(--theme-primary)" }}>
              {"<"} CUSTOM {"/>"}
            </h2>

            {/* Shape */}
            <div className="mb-5">
              <label className="mb-2 block text-xs font-medium" style={{ color: "var(--theme-muted)" }}>
                FORMA DE MODULOS
              </label>
              <div className="flex gap-2">
                {SHAPES.map((s) => {
                  const active = shape === s.value;
                  return (
                    <button
                      key={s.value}
                      onClick={() => setShape(s.value)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-200"
                      style={{
                        backgroundColor: active
                          ? "var(--theme-primary)"
                          : "color-mix(in srgb, var(--theme-bg) 40%, transparent)",
                        color: active ? "#ffffff" : "var(--theme-muted)",
                        border: "1px solid",
                        borderColor: active
                          ? "var(--theme-primary)"
                          : "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
                      }}
                    >
                      <Icon name={`shape_${s.value}`} size={14} />
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Logo */}
            <div className="mb-5">
              <label className="mb-2 block text-xs font-medium" style={{ color: "var(--theme-muted)" }}>
                LOGO DE EMPRESA
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition-all"
                  style={{
                    color: "var(--theme-primary)",
                    border: "1px solid",
                    borderColor: "color-mix(in srgb, var(--theme-primary) 25%, transparent)",
                    backgroundColor: "color-mix(in srgb, var(--theme-primary) 8%, transparent)",
                  }}
                >
                  <Icon name="image" size={14} />
                  {logoDataUrl ? "CAMBIAR LOGO" : "SUBIR LOGO"}
                </button>
                {logoDataUrl && (
                  <button
                    onClick={handleRemoveLogo}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-medium transition-all"
                    style={{
                      color: "#ef4444",
                      border: "1px solid",
                      borderColor: "color-mix(in srgb, #ef4444 30%, transparent)",
                      backgroundColor: "color-mix(in srgb, #ef4444 10%, transparent)",
                    }}
                  >
                    <Icon name="close" size={12} />
                    QUITAR
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                {logoDataUrl && (
                  <span className="text-[10px] font-mono" style={{ color: "var(--theme-primary)" }}>
                    ECC auto: H
                  </span>
                )}
              </div>
            </div>

            {/* Colors + size */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--theme-muted)" }}>
                  COLOR QR
                </label>
                <input
                  type="color"
                  value={darkColor}
                  onChange={(e) => setDarkColor(e.target.value)}
                  className="h-10 w-full cursor-pointer rounded-xl p-1"
                  style={{ border: "1px solid", borderColor: "color-mix(in srgb, var(--theme-primary) 20%, transparent)", backgroundColor: "color-mix(in srgb, var(--theme-bg) 40%, transparent)" }}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--theme-muted)" }}>
                  FONDO
                </label>
                <input
                  type="color"
                  value={lightColor}
                  onChange={(e) => setLightColor(e.target.value)}
                  disabled={transparentBg}
                  className="h-10 w-full cursor-pointer rounded-xl p-1 disabled:opacity-30"
                  style={{ border: "1px solid", borderColor: "color-mix(in srgb, var(--theme-primary) 20%, transparent)", backgroundColor: "color-mix(in srgb, var(--theme-bg) 40%, transparent)" }}
                />
              </div>
              <div className="flex items-end">
                <label className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition-all" style={{ color: "var(--theme-muted)", border: "1px solid", borderColor: "color-mix(in srgb, var(--theme-primary) 20%, transparent)" }}>
                  <input
                    type="checkbox"
                    checked={transparentBg}
                    onChange={(e) => setTransparentBg(e.target.checked)}
                    className="h-4 w-4"
                    style={{ accentColor: "var(--theme-primary)" }}
                  />
                  Fondo transparente
                </label>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--theme-muted)" }}>
                  TAMAÑO: {qrSize}px
                </label>
                <input
                  type="range"
                  min="128"
                  max="1024"
                  step="16"
                  value={qrSize}
                  onChange={(e) => setQrSize(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full"
                  style={{ background: "color-mix(in srgb, var(--theme-primary) 20%, transparent)", accentColor: "var(--theme-primary)" }}
                />
              </div>
            </div>

            {/* Margin + error correction */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--theme-muted)" }}>
                  MARGEN: {margin}
                </label>
                <input
                  type="range"
                  min="0"
                  max="8"
                  step="1"
                  value={margin}
                  onChange={(e) => setMargin(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full"
                  style={{ background: "color-mix(in srgb, var(--theme-primary) 20%, transparent)", accentColor: "var(--theme-primary)" }}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--theme-muted)" }}>
                  CORRECCION: {errorLevel}
                  {logoDataUrl && <span className="ml-2 text-[10px]" style={{ color: "var(--theme-primary)" }}>(H requerido)</span>}
                </label>
                <div className="flex gap-1.5">
                  {ERROR_LEVELS.map((el) => {
                    const active = errorLevel === el.value;
                    return (
                      <button
                        key={el.value}
                        onClick={() => setErrorLevel(el.value)}
                        title={el.desc}
                        disabled={!!logoDataUrl && el.value !== "H"}
                        className="flex-1 rounded-lg px-2 py-1.5 text-center text-[10px] font-mono font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30"
                        style={{
                          backgroundColor: active
                            ? "var(--theme-primary)"
                            : "color-mix(in srgb, var(--theme-bg) 40%, transparent)",
                          color: active ? "#ffffff" : "var(--theme-muted)",
                        }}
                      >
                        {el.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: preview + export */}
        <div className="flex flex-col gap-6">
          <div className="animate-fade-slide-up flex flex-col items-center rounded-2xl border p-6" style={panelStyle}>
            <div className="relative mb-4 flex items-center justify-center">
              {isQrValid && matrix ? (
                <div className="relative">
                  <canvas
                    ref={canvasRef}
                    className="block h-auto max-w-full rounded-2xl"
                    style={{
                      width: Math.min(qrSize, 320),
                      height: Math.min(qrSize, 320),
                      imageRendering: "auto",
                    }}
                  />
                  <div
                    className="absolute -inset-4 -z-10 rounded-3xl blur-2xl"
                    style={{ backgroundColor: "color-mix(in srgb, var(--theme-primary) 8%, transparent)" }}
                  />
                </div>
              ) : (
                <div
                  className="flex items-center justify-center rounded-2xl border-2 border-dashed"
                  style={{
                    width: Math.min(qrSize, 320),
                    height: Math.min(qrSize, 320),
                    borderColor: "color-mix(in srgb, var(--theme-primary) 25%, transparent)",
                    backgroundColor: "color-mix(in srgb, var(--theme-bg) 20%, transparent)",
                  }}
                >
                  <div className="flex flex-col items-center gap-3" style={{ color: "var(--theme-muted)" }}>
                    <Icon name="qr" size={48} className="opacity-40" />
                    <span className="font-mono text-xs">// ESPERANDO DATOS</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex w-full gap-2">
              <button
                onClick={handleDownloadPng}
                disabled={!isQrValid}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-30"
                style={{ backgroundColor: "var(--theme-primary)" }}
              >
                <Icon name="download" size={14} />
                PNG
              </button>
              <button
                onClick={handleDownloadSvg}
                disabled={!isQrValid}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-30"
                style={{ backgroundColor: "var(--theme-primary)" }}
              >
                <Icon name="download" size={14} />
                SVG
              </button>
              <button
                onClick={handleDownloadWebp}
                disabled={!isQrValid}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-30"
                style={{ backgroundColor: "var(--theme-primary)" }}
              >
                <Icon name="download" size={14} />
                WebP
              </button>
            </div>

            {isQrValid && qrText.length > 60 && (
              <div className="mt-3 w-full">
                <details className="group">
                  <summary className="cursor-pointer text-[10px] font-mono font-medium transition-colors" style={{ color: "var(--theme-muted)" }}>
                    {">"} VIEW RAW DATA
                  </summary>
                  <p
                    className="mt-2 break-all rounded-xl p-3 font-mono text-[11px]"
                    style={{
                      color: "var(--theme-muted)",
                      border: "1px solid",
                      borderColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
                      backgroundColor: "color-mix(in srgb, var(--theme-bg) 30%, transparent)",
                    }}
                  >
                    {qrText}
                  </p>
                </details>
              </div>
            )}
          </div>

          {isQrValid && matrix && (
            <div
              className="animate-fade-slide-up flex items-center justify-center gap-2 rounded-2xl border p-4 text-[10px] font-mono"
              style={{ ...panelStyle, color: "var(--theme-muted)" }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--theme-primary)" }} />
              {matrix.length}&times;{matrix.length} modulos &middot; {shape} &middot;{" "}
              {transparentBg ? "transparent" : "solid"} bg &middot; ECC {errorLevel}
              {logoDataUrl && " &middot; +logo"}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-5 border-t text-center" style={{ borderColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)" }}>
        <p className="text-xs font-medium tracking-wider" style={{ color: "var(--theme-muted)" }}>
          <span style={{ color: "var(--theme-primary)" }}>TOOLS 33</span> v{__APP_VERSION__} &mdash; qrcode (JS puro)
        </p>
      </div>
    </div>
  );
}
