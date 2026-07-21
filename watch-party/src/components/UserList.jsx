import { useRoomContext } from "../context/RoomContext";

/**
 * UserList — monochrome participant list.
 *
 * Each participant shows:
 * - Initial letter in a square monochrome badge
 * - Name in paper white
 * - "host" label for the host
 * - "you" label for current user
 */

function AvatarInitial({ name, uid }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  // Deterministic grayscale shade based on uid hash
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  const brightness = 15 + (Math.abs(hash) % 10) * 3; // 15-42
  const bgColor = `rgb(${brightness}, ${brightness}, ${brightness})`;

  return (
    <div
      className="w-8 h-8 flex items-center justify-center text-xs font-medium text-ash-mist shrink-0"
      style={{ backgroundColor: bgColor }}
    >
      {initial}
    </div>
  );
}

export default function UserList() {
  const { user, roomData } = useRoomContext();

  const members = roomData?.members || {};
  const entries = Object.entries(members);

  return (
    <div className="flex flex-col h-full">
      {/* List */}
      <div className="flex-1 overflow-y-auto px-[26px] py-2 space-y-1">
        {entries.map(([uid, m]) => {
          const isHost = roomData?.hostId === uid;
          const isMe = user && uid === user.uid;

          return (
            <div
              key={uid}
              className="flex items-center gap-3 px-2 py-2 hover:bg-paper/5 transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] group"
            >
              {/* Avatar */}
              <AvatarInitial name={m?.name} uid={uid} />

              {/* Name + badge */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-paper truncate">
                  {m?.name || "Anonymous"}
                </span>

                {isHost && (
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
            </div>
          );
        })}

        {count === 0 && (
          <div className="text-center text-felt-gray text-sm py-4">
            No participants yet
          </div>
        )}
      </div>
    </div>
  );
}
