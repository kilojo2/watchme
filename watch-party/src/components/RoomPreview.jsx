// ─── RoomPreview — visual mockup of the WatchMe room experience ──
//
// A non-interactive screenshot-style preview showing the actual
// watch-party interface: video player, chat, participants, controls.
// Designed to make the user immediately understand what they get.

export default function RoomPreview() {
  return (
    <div className="w-full max-w-5xl mx-auto">
      <div
        className="relative border border-white/15 bg-black/20 backdrop-blur-sm
                   rounded-3xl overflow-hidden animate-fade-in"
        style={{ animationDelay: "400ms" }}
      >
        {/* ── Inner layout: player + chat ────────────────────────── */}
        <div className="flex flex-col lg:flex-row">
          {/* ═══ Video Player Area ═══ */}
          <div className="relative flex-1 aspect-video lg:aspect-auto lg:min-h-[320px] bg-black/60 overflow-hidden">
            {/* Cinematic placeholder — warm gradient matching iridescent palette */}
            <div
              className="absolute inset-0 opacity-30"
              style={{
                background:
                  "radial-gradient(ellipse at 30% 40%, rgba(160,224,171,0.25), transparent 60%), radial-gradient(ellipse at 70% 60%, rgba(255,172,46,0.15), transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(165,45,37,0.2), transparent 50%)",
              }}
            />

            {/* Subtle film texture overlay */}
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
              }}
            />

            {/* ── Center content ── */}
            <div className="relative z-10 flex flex-col items-center justify-center h-full p-6">
              {/* Play icon */}
              <div className="w-16 h-16 rounded-full border border-white/20 flex items-center justify-center mb-4 backdrop-blur-sm bg-white/5">
                <svg className="w-6 h-6 text-white/70 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <span className="text-white/30 text-[11px] uppercase tracking-[0.2em] font-[400]">
                Now Playing
              </span>
            </div>

            {/* ── Top bar — room code + participants ── */}
            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-3">
              {/* Room badge */}
              <div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
                <span className="text-white/50 text-[10px] uppercase tracking-[0.15em] font-[400]">
                  Room
                </span>
                <span className="text-white/80 text-[11px] font-mono font-[500] tracking-wider">
                  Abc123
                </span>
              </div>

              {/* Participant avatars */}
              <div className="flex items-center -space-x-2">
                {["#a0e0ab", "#ffac2e", "#a52d25", "#6d6d6d"].map(
                  (color, i) => (
                    <div
                      key={i}
                      className="w-7 h-7 rounded-full border-2 border-black/60 flex items-center justify-center text-[10px] font-[500] text-white"
                      style={{ backgroundColor: color }}
                    >
                      {["A", "M", "J", "K"][i]}
                    </div>
                  ),
                )}
                <span className="ml-2 text-white/40 text-[10px] font-[400]">
                  +2
                </span>
              </div>
            </div>

            {/* ── Bottom bar — controls mockup ── */}
            <div className="absolute bottom-0 left-0 right-0 z-20 px-5 py-3 bg-gradient-to-t from-black/60 to-transparent">
              {/* Progress bar */}
              <div className="w-full h-0.5 bg-white/10 rounded-full mb-3 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white/40"
                  style={{ width: "35%" }}
                />
              </div>

              <div className="flex items-center justify-between">
                {/* Left: play + time */}
                <div className="flex items-center gap-3">
                  <svg
                    className="w-4 h-4 text-white/60"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span className="text-white/40 text-[10px] font-mono font-[400]">
                    0:42 / 2:15:30
                  </span>
                </div>

                {/* Center: sync status */}
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400/80 shadow-[0_0_4px_rgba(74,222,128,0.4)]" />
                  <span className="text-white/40 text-[10px] font-[400]">
                    Synced
                  </span>
                </div>

                {/* Right: volume */}
                <svg
                  className="w-4 h-4 text-white/40"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                </svg>
              </div>
            </div>
          </div>

          {/* ═══ Chat Sidebar ═══ */}
          <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-white/10 bg-black/30 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="text-white/60 text-[10px] uppercase tracking-[0.2em] font-[500]">
                Chat
              </span>
              <span className="text-white/30 text-[10px] font-[400]">
                4 online
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 p-4 space-y-3 min-h-[160px]">
              {[
                { name: "Alex", text: "Ready when you are! 🍿", color: "#a0e0ab" },
                { name: "Mia", text: "Starting now 🔥", color: "#ffac2e" },
                { name: "Jake", text: "Finally found this movie", color: "#a52d25" },
              ].map((msg, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div
                    className="w-5 h-5 rounded-full shrink-0 mt-0.5 flex items-center justify-center text-[8px] font-[500] text-white"
                    style={{ backgroundColor: msg.color }}
                  >
                    {msg.name[0]}
                  </div>
                  <div className="min-w-0">
                    <span className="text-white/70 text-[11px] font-[500] block leading-none mb-1">
                      {msg.name}
                    </span>
                    <span className="text-white/40 text-[11px] font-[400] leading-[1.3] block">
                      {msg.text}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Input mockup */}
            <div className="px-4 py-3 border-t border-white/10">
              <div className="flex items-center gap-2 border border-white/10 rounded-full px-4 py-2 bg-white/5">
                <span className="text-white/20 text-[11px] font-[400] flex-1">
                  Type a message...
                </span>
                <svg
                  className="w-3.5 h-3.5 text-white/20"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* ── Subtle corner glow ── */}
        <div
          className="absolute -top-20 -right-20 w-40 h-40 opacity-20 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(160,224,171,0.3), transparent 70%)",
          }}
        />
      </div>
    </div>
  );
}
