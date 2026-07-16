import { useState } from "react";
import { useRoomContext } from "../context/RoomContext";

/**
 * AdminPanel — панель администратора (только для хоста).
 *
 * Показывает:
 * - Список всех участников комнаты
 * - IP-адрес каждого участника (не виден обычным пользователям)
 * - Время вступления
 * - Кто хост
 *
 * @param {{ isOpen: boolean, onClose: () => void }} props
 */
export default function AdminPanel({ isOpen, onClose }) {
  const { user, roomData } = useRoomContext();

  if (!isOpen) return null;

  const isHost = user && roomData?.hostId === user.uid;
  const members = roomData?.members || {};
  const entries = Object.entries(members);

  // Если пользователь не хост — ничего не показываем
  if (!isHost) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl shadow-black/50 w-[520px] max-w-[90vw] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-lg">🛡️</span>
            <h2 className="text-base font-semibold text-zinc-200">
              Admin Panel
            </h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-500">
              Host only
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg
                       text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800
                       transition-all duration-200"
          >
            ✕
          </button>
        </div>

        {/* Participants list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {entries.length === 0 && (
            <div className="text-center text-zinc-600 text-sm py-8">
              No participants yet
            </div>
          )}

          {entries.map(([uid, m]) => {
            const isMemberHost = roomData?.hostId === uid;
            const isMe = user && uid === user.uid;

            return (
              <div
                key={uid}
                className="flex items-center gap-4 px-4 py-3 rounded-xl bg-zinc-800/50 border border-zinc-800"
              >
                {/* Avatar */}
                <div className="w-9 h-9 flex items-center justify-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-600 text-sm font-semibold text-zinc-300 shrink-0">
                  {(m?.name || "?").charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  {/* Name + badges */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200 truncate">
                      {m?.name || "Anonymous"}
                    </span>
                    {isMemberHost && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                        host
                      </span>
                    )}
                    {isMe && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400">
                        you
                      </span>
                    )}
                  </div>

                  {/* IP address */}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] font-mono text-zinc-500">
                      IP:
                    </span>
                    <span className="text-[12px] font-mono text-cyan-400/80 bg-cyan-500/10 px-2 py-0.5 rounded-md">
                      {m?.ip || "—"}
                    </span>
                  </div>
                </div>

                {/* Joined time */}
                <div className="text-[10px] text-zinc-600 shrink-0 text-right">
                  {m?.joinedAt
                    ? new Date(m.joinedAt).toLocaleTimeString()
                    : "—"}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 text-[11px] text-zinc-600 text-center">
          IP addresses are only visible to the host
        </div>
      </div>
    </div>
  );
}
