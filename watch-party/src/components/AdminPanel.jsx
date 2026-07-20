import { useRoomContext } from "../context/RoomContext";

/**
 * AdminPanel — monochrome admin panel for the host.
 *
 * @param {{ isOpen: boolean, onClose: () => void }} props
 */
export default function AdminPanel({ isOpen, onClose }) {
  const { user, roomData } = useRoomContext();

  if (!isOpen) return null;

  const isHost = user && roomData?.hostId === user.uid;
  const members = roomData?.members || {};
  const entries = Object.entries(members);

  if (!isHost) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80 animate-fade-in">
      <div className="bg-inkstone border border-white/10 w-[520px] max-w-[90vw] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-[34px] py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-paper uppercase tracking-wider">
              Admin Panel
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 bg-obsidian text-felt-gray uppercase tracking-wider">
              Host only
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-felt-gray hover:text-paper hover:bg-paper/5 transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]"
          >
            ✕
          </button>
        </div>

        {/* Participants list */}
        <div className="flex-1 overflow-y-auto px-[34px] py-4 space-y-2">
          {entries.length === 0 && (
            <div className="text-center text-felt-gray text-sm py-8">
              No participants yet
            </div>
          )}

          {entries.map(([uid, m]) => {
            const isMemberHost = roomData?.hostId === uid;
            const isMe = user && uid === user.uid;

            return (
              <div
                key={uid}
                className="flex items-center gap-4 px-4 py-3 bg-obsidian border border-white/5"
              >
                {/* Avatar */}
                <div className="w-9 h-9 flex items-center justify-center bg-inkstone text-sm font-medium text-ash-mist shrink-0">
                  {(m?.name || "?").charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-paper truncate">
                      {m?.name || "Anonymous"}
                    </span>
                    {isMemberHost && (
                      <span className="text-[10px] font-medium text-felt-gray uppercase tracking-wider">
                        host
                      </span>
                    )}
                    {isMe && (
                      <span className="text-[10px] font-medium text-felt-gray">
                        (you)
                      </span>
                    )}
                  </div>

                  {/* IP address */}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono text-felt-gray">
                      IP:
                    </span>
                    <span className="text-[11px] font-mono text-ash-mist bg-obsidian px-2 py-0.5">
                      {m?.ip || "—"}
                    </span>
                  </div>
                </div>

                {/* Joined time */}
                <div className="text-[10px] text-felt-gray shrink-0 text-right">
                  {m?.joinedAt
                    ? new Date(m.joinedAt).toLocaleTimeString()
                    : "—"}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-[34px] py-3 border-t border-white/5 text-[10px] text-felt-gray text-center uppercase tracking-wider">
          IP addresses are only visible to the host
        </div>
      </div>
    </div>
  );
}
