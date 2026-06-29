# Tools-33

**Suite de utilidades profesionales para Windows — potenciada por Tauri, React y Rust.**

Tools-33 es una aplicación de escritorio nativa que reúne herramientas prácticas para el manejo de imágenes, PDFs, códigos QR y publicación editorial. Todo el procesamiento pesado corre en Rust, lo que garantiza velocidad, bajo consumo de recursos y privacidad total (sin llamadas a servidores externos).

---

## ✨ Herramientas

### 🖼️ Imagen

| Herramienta | Descripción |
|-------------|-------------|
| **Escalador** | Redimensiona imágenes con 5 métodos de interpolación: Lanczos + Sharp, Lanczos, Bicúbica, Bilineal y Vecino más cercano. Aceleración por GPU (wgpu), ajuste de DPI (72–600), nitidez ajustable y comparación antes/después con slider interactivo. |
| **Generador QR** | Crea códigos QR personalizados con 13 tipos de contenido: texto, URL, YouTube, Google Drive, Wi-Fi, correo, teléfono, WhatsApp, SMS, cuenta bancaria, vCard, ubicación y evento. Formas de módulo (cuadrado, redondeado, círculo, diamante), color personalizable, fondo transparente, logo incorporado. Exporta a PNG, SVG y WebP. |
| **Texturas** | Genera hojas de textura repitiendo imágenes en formatos de papel predefinidos (Carta, A4, A3, personalizado). Ajusta escala, rotación, opacidad y volteo alternado. Exporta a PDF y PPTX. Ideal para diseñadores gráficos y fabricación digital. |

### 📄 PDF (100% Rust nativo)

| Herramienta | Descripción |
|-------------|-------------|
| **Compresor** | Comprime PDFs con 3 niveles (bajo/medio/alto). Procesamiento por lotes. Reduce tamaño de imágenes (72–150 DPI) y optimiza contenido vectorial. Sin Ghostscript ni Acrobat. |
| **PDF a IMG** | Convierte páginas de PDF a imágenes JPG, PNG o WebP empaquetadas en ZIP. Renderizado en paralelo con Rayon. Pipeline streaming para bajo uso de RAM. |
| **Unir PDFs** | Combina múltiples PDFs en uno solo. Arrastra y reordena archivos. Compatible con arrastrar desde el explorador de Windows. |

### 📰 Publicación

| Herramienta | Descripción |
|-------------|-------------|
| **Revista** | Crea archivos PDF listos para impresión a partir de carpetas de imágenes. Inserta páginas en blanco automáticamente para la imposición de pliegos. Incluye vista previa de orden de impresión y opción de portada/contraportada. |

### 💻 Sistema

| Herramienta | Descripción |
|-------------|-------------|
| **Información del Equipo** | Muestra detalles completos del hardware y software: sistema operativo, CPU, RAM, almacenamiento, GPU dedicada e integrada, nombre del equipo y más. |

---

## 🚀 Tecnologías

- **Frontend:** React 19, TypeScript, Tailwind CSS 4, Vite 7
- **Backend:** Tauri 2, Rust (rayon, wgpu, lopdf, hayro, image, sysinfo, png, base64, zip)
- **Packaging:** MSI installer personalizado con branding, CI/CD automatizado con GitHub Actions

---

## 📦 Instalación

### Desde el release (recomendado)

Descarga el instalador MSI desde la [página de releases](https://github.com/JesherI/tools-33/releases) e instálalo.

### Compilar desde fuente

```bash
# Requisitos: Node.js 20+, pnpm, Rust toolchain
pnpm install
pnpm tauri dev     # Desarrollo
pnpm tauri build   # Compilar para distribución
```

---

## 🎨 Temas

Tools-33 incluye 3 temas visuales:

- **Light** — Claro, ideal para espacios iluminados
- **Dark** — Oscuro, fácil para la vista
- **Industrial** — Intermedio con acentos naranjas

Los temas se aplican con transiciones suaves y se guardan en localStorage.

---

## 🧠 Arquitectura

```
src/                    # Frontend React + TypeScript
├── components/         # Componentes reutilizables
│   ├── magazine/       # Componentes del módulo Revista
│   └── texture/        # Componentes del módulo Texturas
├── hooks/              # Custom hooks
├── screens/            # Pantallas principales (cada herramienta)
└── utils/              # Utilidades compartidas

src-tauri/              # Backend Rust
├── src/
│   ├── lib.rs          # Entry point Tauri
│   ├── pdf_converter.rs   # PDF → Imágenes → ZIP
│   ├── pdf_compress.rs    # Compresión de PDFs
│   ├── pdf_merge.rs       # Unión de PDFs
│   ├── image_scaler.rs    # Escalado de imágenes
│   ├── gpu_scaler.rs      # Aceleración GPU
│   ├── system_info.rs     # Información del sistema
│   └── version.rs         # Versión
├── Cargo.toml
└── tauri.conf.json
```

---

## 🛡️ Privacidad

Todo el procesamiento ocurre **localmente en tu máquina**. No se envían archivos, imágenes ni datos a ningún servidor externo.

---

## 📄 Licencia

MIT

---

<p align="center">
  <sub>Hecho con ❤️ por <a href="https://github.com/JesherI">JesherI</a> — v0.1.6</sub>
</p>
