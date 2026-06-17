import type { AlertState } from "./types";

const cardStyle: React.CSSProperties = {
  backgroundColor: "color-mix(in srgb, var(--theme-bg) 50%, transparent)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  borderColor: "color-mix(in srgb, var(--theme-primary) 20%, transparent)",
};

export function AlertModal({ alert, onClose }: { alert: AlertState; onClose: () => void }) {
  if (!alert.show) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="rounded-3xl border p-8 max-w-sm w-full mx-4 shadow-2xl"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-2" style={{ color: "var(--theme-primary)" }}>{alert.title}</h3>
        <p className="text-sm whitespace-pre-line mb-6" style={{ color: "var(--theme-muted)" }}>{alert.message}</p>
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200"
          style={{ backgroundColor: "var(--theme-primary)" }}
        >
          Aceptar
        </button>
      </div>
    </div>
  );
}
