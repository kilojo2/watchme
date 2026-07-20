import { QUICK_ACCESS_SITES } from "../data/quickAccessSites.jsx";

/**
 * QuickAccess — grid of popular streaming/pirate site shortcuts.
 *
 * Rendered inside BrowserPlayer when no URL is loaded, replacing the
 * generic empty-state placeholder.
 *
 * @param {{ onNavigate: (url: string) => void }} props
 */
export default function QuickAccess({ onNavigate }) {
  if (!QUICK_ACCESS_SITES.length) return null;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-8 py-12 overflow-y-auto bg-obsidian">
      {/* ── Iridescent hero behind Quick Access ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="hero-iridescent absolute inset-0 opacity-[0.06]" />
      </div>

      {/* Heading */}
      <div className="text-center mb-8 relative z-10">
        <h2 className="text-3xl sm:text-5xl font-light text-paper tracking-[-0.02em] leading-[0.9]">
          Paste a link.
        </h2>
        <p className="text-sm text-felt-gray mt-4">
          Or select a site below
        </p>
      </div>

      {/* Site grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 w-full max-w-4xl relative z-10">
        {QUICK_ACCESS_SITES.map((site) => {
          const Icon = site.icon;
          return (
            <button
              key={site.url}
              onClick={() => onNavigate(site.url)}
              title={`Open ${site.name}`}
              className="flex flex-col items-center gap-2.5 px-4 py-5 rounded-none
                         bg-inkstone/80 border border-white/5
                         hover:bg-inkstone hover:border-white/20
                         active:scale-[0.97]
                         transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] cursor-pointer group"
            >
              <div className="w-10 h-10 flex items-center justify-center rounded-none
                               text-ash-mist group-hover:text-paper
                               transition-colors duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]">
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-felt-gray group-hover:text-paper
                               transition-colors duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] text-center leading-tight">
                {site.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer hint */}
      <p className="text-[11px] text-felt-gray mt-8 text-center relative z-10">
        Add or remove sites in{" "}
        <code className="text-[10px] px-1.5 py-0.5 bg-inkstone text-ash-mist">
          src/data/quickAccessSites.js
        </code>
      </p>
    </div>
  );
}
