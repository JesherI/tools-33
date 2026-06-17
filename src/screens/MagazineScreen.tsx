import { useMagazine } from "../hooks/useMagazine";
import {
  AlertModal,
  LoadingState,
  EmptyState,
  PagesGrid,
  DistributionInfo,
  PreviewHeader,
  SpreadsGrid,
  GeneratePdfButton,
  GeneratingState,
} from "../components/magazine";

export default function MagazineScreen() {
  const {
    phase, hasBackCover, setHasBackCover, pages, previewSpreads, stats,
    isLoading, isGenerating, progress, alert,
    handlePickFolder, hideAlert, generatePreview, handleGeneratePDF,
    resetPages, goBackToUpload,
  } = useMagazine();

  return (
    <div className="w-full max-w-4xl mx-auto">
      <AlertModal alert={alert} onClose={hideAlert} />

      <div
        className="rounded-3xl border p-8 transition-all duration-500"
        style={{
          backgroundColor: "color-mix(in srgb, var(--theme-bg) 55%, transparent)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
        }}
      >
        {phase === "upload" && (
          <>
            {isLoading && <LoadingState current={progress.current} total={progress.total} />}

            {pages.length === 0 && !isLoading && (
              <EmptyState
                onSelectFolder={handlePickFolder}
                hasBackCover={hasBackCover}
                onBackCoverChange={setHasBackCover}
              />
            )}

            {pages.length > 0 && !isLoading && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={resetPages}
                      className="px-4 py-2 rounded-lg text-sm transition-all duration-200 flex items-center gap-2"
                      style={{
                        color: "var(--theme-muted)",
                        border: "1px solid",
                        borderColor: "color-mix(in srgb, var(--theme-border) 50%, transparent)",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--theme-primary)"; e.currentTarget.style.borderColor = "color-mix(in srgb, var(--theme-primary) 50%, transparent)" }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-muted)"; e.currentTarget.style.borderColor = "color-mix(in srgb, var(--theme-border) 50%, transparent)" }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                      </svg>
                      Regresar
                    </button>
                    <div>
                      <h3 className="text-lg font-semibold" style={{ color: "var(--theme-primary)" }}>Paginas cargadas</h3>
                      <span className="text-xs" style={{ color: "var(--theme-muted)" }}>
                        {stats.realImages} imgs + {stats.blanks} blancos = {stats.total} total
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handlePickFolder}
                    disabled={isLoading}
                    className="px-4 py-2 rounded-lg text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    style={{
                      color: "var(--theme-muted)",
                      border: "1px solid",
                      borderColor: "color-mix(in srgb, var(--theme-border) 50%, transparent)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--theme-primary)"; e.currentTarget.style.borderColor = "color-mix(in srgb, var(--theme-primary) 50%, transparent)" }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-muted)"; e.currentTarget.style.borderColor = "color-mix(in srgb, var(--theme-border) 50%, transparent)" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    Cambiar carpeta
                  </button>
                </div>
                <PagesGrid pages={pages} />
                <DistributionInfo blanks={stats.blanks} total={stats.total} hasBackCover={hasBackCover} />
                <div className="flex justify-end">
                  <button
                    onClick={generatePreview}
                    className="px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 shadow-lg flex items-center gap-2"
                    style={{ backgroundColor: "var(--theme-primary)" }}
                  >
                    <span>Ver orden de impresion</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {phase === "preview" && (
          <>
            <PreviewHeader
              total={stats.total}
              spreadsCount={previewSpreads.length}
              hasBackCover={hasBackCover}
              onBack={goBackToUpload}
            />
            <SpreadsGrid spreads={previewSpreads} />
            <div className="flex mt-6">
              <GeneratePdfButton onClick={handleGeneratePDF} isProcessing={isGenerating} progress={progress.current && progress.total ? (progress.current / progress.total) * 100 : 0} />
            </div>
          </>
        )}

        {phase === "generating" && <GeneratingState />}
      </div>

      <div className="mt-6 pt-5 border-t text-center" style={{ borderColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)" }}>
        <p className="text-xs font-medium tracking-wider" style={{ color: "var(--theme-muted)" }}>
          <span style={{ color: "var(--theme-primary)" }}>TOOLS 33</span> v{__APP_VERSION__} &mdash; Powered by Tauri &amp; React
        </p>
      </div>
    </div>
  );
}
