export function GeneratePdfButton({
  isProcessing,
  progress,
  onClick,
}: {
  isProcessing: boolean;
  progress: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isProcessing}
      className="px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ backgroundColor: "var(--theme-primary)" }}
    >
      {isProcessing ? `Procesando... ${Math.round(progress)}%` : "Generar PDF"}
    </button>
  );
}
