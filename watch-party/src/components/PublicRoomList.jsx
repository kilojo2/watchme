// ─── PublicRoomList — glassmorphism list for public rooms ──────
//
// States:
//   loading  → spinner
//   empty    → "No public rooms yet" message
//   list     → rows with room name, member count, Join button
//
// Design:
//   Container:  bg-white/5 backdrop-blur-md border border-white/15 rounded-3xl
//   Row:        hover:bg-white/10 transition-colors
//   Join btn:   capsule border-white/30 hover:border-white

export default function PublicRoomList({ rooms, loading, onJoin }) {
  // ─── Loading ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full max-w-5xl mx-auto">
        <p className="text-[11px] font-[400] uppercase tracking-[0.15em] text-felt-gray mb-[14px]">
          Public Rooms
        </p>
        <div className="border border-white/15 bg-white/5 backdrop-blur-md rounded-3xl p-8 flex items-center gap-3">
          <div className="w-4 h-4 border border-white/30 border-t-white animate-spin rounded-none" />
          <span className="text-felt-gray text-[11px] uppercase tracking-[0.15em] font-[400]">
            Loading...
          </span>
        </div>
      </div>
    );
  }

  // ─── Empty ────────────────────────────────────────────────────
  if (rooms.length === 0) {
    return (
      <div className="w-full max-w-5xl mx-auto">
        <p className="text-[11px] font-[400] uppercase tracking-[0.15em] text-felt-gray mb-[14px]">
          Public Rooms
        </p>
        <div className="border border-white/15 bg-white/5 backdrop-blur-md rounded-3xl p-8">
          <p className="text-felt-gray text-[12px] leading-[1.21] font-[400]">
            No public rooms yet. Create one to get started!
          </p>
        </div>
      </div>
    );
  }

  // ─── List ─────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-5xl mx-auto">
      <p className="text-[11px] font-[400] uppercase tracking-[0.15em] text-felt-gray mb-[14px]">
        Public Rooms
      </p>
      <div className="border border-white/15 bg-white/5 backdrop-blur-md rounded-3xl overflow-hidden">
        {rooms.map((room, index) => (
          <div
            key={room.id}
            className={`
              flex items-center justify-between px-6 py-[18px]
              hover:bg-white/10 transition-colors duration-[800ms]
              ease-[cubic-bezier(0.19,1,0.22,1)] cursor-pointer
              ${index < rooms.length - 1 ? "border-b border-white/10" : ""}
            `}
            onClick={() => onJoin(room.id)}
          >
            {/* ── Left: icon + name ── */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {/* Status indicator dot */}
              <span
                className={`shrink-0 w-2 h-2 rounded-full ${
                  room.status === "playing"
                    ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]"
                    : "bg-white/30"
                }`}
              />
              <span className="text-white text-[14px] font-[500] truncate">
                {room.name || room.id}
              </span>
            </div>

            {/* ── Right: member count + Join ── */}
            <div className="flex items-center gap-5 shrink-0">
              <span className="text-white/50 text-[12px] font-[400] whitespace-nowrap">
                👥 {room.memberCount ?? 0}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onJoin(room.id);
                }}
                className="rounded-[75px] bg-transparent border border-white/30
                           hover:border-white px-4 py-1 text-[12px] text-white
                           transition-colors duration-[800ms]
                           ease-[cubic-bezier(0.19,1,0.22,1)]
                           font-[400]"
              >
                Join
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
