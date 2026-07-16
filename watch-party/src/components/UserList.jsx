import { useRoomContext } from "../context/RoomContext";

/**
 * UserList — список участников комнаты с аватарами и статусами.
 *
 * Каждый участник отображается с:
 * - Цветным кружком-аватаром (первая буква имени)
 * - Зелёным индикатором онлайн (пульсирующая точка)
 * - Именем пользователя
 * - Короной 👑 для хоста
 */
const AVATAR_COLORS = [
  "from-indigo-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-cyan-500 to-blue-600",
  "from-violet-500 to-fuchsia-600",
];

function getAvatarColor(uid) {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function AvatarCircle({ name, uid, size = "sm" }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  const color = getAvatarColor(uid);
  const sizeClasses = size === "sm" ? "w-8 h-8 text-sm" : "w-10 h-10 text-base";

  return (
    <div
      className={`relative flex items-center justify-center rounded-full bg-gradient-to-br ${color} ${sizeClasses} font-semibold text-white shrink-0`}
    >
      {initial}
    </div>
  );
}

function OnlineDot() {
  return (
    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-zinc-900 shadow-[0_0_6px_theme(colors.emerald.500)] animate-pulse-glow" />
  );
}

export default function UserList() {
  const { user, roomData } = useRoomContext();

  const members = roomData?.members || {};
  const entries = Object.entries(members);
  const count = entries.length;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          Online —{" "}
          <span className="text-emerald-400 font-bold">{count}</span>
          {count === 1 ? " participant" : " participants"}
        </h3>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {entries.map(([uid, m]) => {
          const isHost = roomData?.hostId === uid;
          const isMe = user && uid === user.uid;

          return (
            <div
              key={uid}
              className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-800/60 transition-colors duration-150 group"
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <AvatarCircle name={m?.name} uid={uid} />
                <OnlineDot />
              </div>

              {/* Name + badge */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-zinc-200 truncate">
                  {m?.name || "Anonymous"}
                </span>

                {isHost && (
                  <span className="text-xs shrink-0" title="Host">
                    👑
                  </span>
                )}

                {isMe && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 shrink-0">
                    you
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {count === 0 && (
          <div className="text-center text-zinc-600 text-sm py-4">
            No participants yet
          </div>
        )}
      </div>
    </div>
  );
}
