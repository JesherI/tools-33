import { useSystemInfo } from "../hooks/useSystemInfo";
import InfoCard from "../components/InfoCard";

export default function SystemInfoScreen() {
  const { systemInfo, loading } = useSystemInfo();

  return (
    <div
      className="w-full max-w-4xl rounded-3xl border p-10 transition-all duration-500"
      style={{
        backgroundColor: "color-mix(in srgb, var(--theme-bg) 55%, transparent)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
      }}
    >
        {/* Header centrado */}
        <div className="flex flex-col items-center text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{
              backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
              color: "var(--theme-primary)",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold" style={{ color: "var(--theme-primary)" }}>
            Informacion del Equipo
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--theme-muted)" }}>
            Detalles del hardware y software del sistema
          </p>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div
              className="w-10 h-10 rounded-full border-2 border-transparent border-t-current animate-spin"
              style={{ color: "var(--theme-primary)" }}
            />
          </div>
        ) : systemInfo ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoCard
              icon="os"
              label="Sistema Operativo"
              value={systemInfo.os_version}
              subvalue={`${systemInfo.os_name} ${systemInfo.architecture}`}
            />
            <InfoCard
              icon="pc"
              label="Nombre del Equipo"
              value={systemInfo.hostname}
              subvalue="Identificacion en la red"
            />
            <InfoCard
              icon="cpu"
              label="Procesador"
              value={systemInfo.cpu}
              className="md:col-span-2"
            />
            <InfoCard
              icon="ram"
              label="Memoria RAM"
              value={systemInfo.ram_gb}
              subvalue="Memoria fisica total instalada"
            />
            <InfoCard
              icon="rom"
              label="Almacenamiento"
              value={systemInfo.rom_gb}
              subvalue="Capacidad total de discos"
            />
            <InfoCard
              icon="gpu-dedicada"
              label="Grafica Dedicada"
              value={systemInfo.gpu_dedicada}
              subvalue="Memoria de video dedicada"
            />
            <InfoCard
              icon="gpu-integrada"
              label="Grafica Integrada"
              value={systemInfo.gpu_integrada}
              subvalue="Integrada en el procesador"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-base" style={{ color: "var(--theme-muted)" }}>
              No se pudo obtener la informacion del sistema
            </p>
            <p className="text-sm" style={{ color: "var(--theme-muted)" }}>
              Verifica la conexion con el backend
            </p>
          </div>
        )}

        {/* Footer centrado */}
        <div
          className="mt-8 pt-5 border-t text-center"
          style={{ borderColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)" }}
        >
          <p className="text-xs font-medium tracking-wider" style={{ color: "var(--theme-muted)" }}>
            <span style={{ color: "var(--theme-primary)" }}>TOOLS 33</span> v{__APP_VERSION__} &mdash; Powered by Tauri &amp; React
          </p>
        </div>
      </div>
  );
}
