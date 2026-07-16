import { useState, useRef, useEffect } from "react";
import { useRoomContext } from "../context/RoomContext";

/**
 * Chat — компонент текстового чата.
 *
 * Особенности:
 * - Сообщения в виде аккуратных блоков (свои — indigo, чужие — zinc)
 * - Аватар-заглушка (первая буква в цветном круге)
 * - Автоскролл к последнему сообщению
 * - Отправка по Enter
 * - Плавные анимации появления
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
  const sizeClasses = size === "xs" ? "w-6 h-6 text-[10px]" : "w-8 h-8 text-sm";

  return (
    <div
      className={`relative flex items-center justify-center rounded-full bg-gradient-to-br ${color} ${sizeClasses} font-semibold text-white shrink-0`}
    >
      {initial}
    </div>
  );
}

function formatTime(ts) {
  if (!ts) return "";
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Chat() {
  const { messages, sendMessage, user } = useRoomContext();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900/50">
      {/* ── Header ─────────────────────────────── */}
      <div className="px-4 py-3 border-b border-zinc-800 shrink-0">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          💬 Chat
        </h3>
      </div>

      {/* ── Messages ───────────────────────────── */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600 text-sm gap-1">
            <span className="text-xl">💬</span>
            <span>No messages yet</span>
            <span className="text-xs text-zinc-700">
              Be the first to say something!
            </span>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isMine = user && msg.uid === user.uid;

          return (
            <div
              key={msg.id}
              className={`flex gap-2.5 animate-fade-in ${
                isMine ? "flex-row-reverse" : "flex-row"
              }`}
              style={{ animationDelay: `${Math.min(idx * 15, 200)}ms` }}
            >
              {/* Avatar — only for others; mine are implicit */}
              {!isMine && (
                <div className="mt-1 shrink-0">
                  <AvatarCircle name={msg.name} uid={msg.uid} size="xs" />
                </div>
              )}

              {/* Bubble */}
              <div className={`flex flex-col ${isMine ? "items-end" : "items-start"} max-w-[85%]`}>
                {/* Name (only for others) */}
                {!isMine && (
                  <span className="text-[11px] font-medium text-zinc-500 mb-0.5 px-1">
                    {msg.name || "Anonymous"}
                  </span>
                )}

                {/* Message body */}
                <div
                  className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                    isMine
                      ? "bg-indigo-600 text-white rounded-br-md"
                      : "bg-zinc-800 text-zinc-200 border border-zinc-700/50 rounded-bl-md"
                  }`}
                >
                  {msg.text}
                </div>

                {/* Time + read receipt */}
                <div className={`flex items-center gap-1 mt-0.5 px-1 ${isMine ? "flex-row" : "flex-row"}`}>
                  <span className="text-[10px] text-zinc-600">
                    {formatTime(msg.timestamp)}
                  </span>
                  {isMine && (
                    <span className="text-[10px] text-indigo-400">✓✓</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ──────────────────────────────── */}
      <form
        onSubmit={handleSend}
        className="shrink-0 px-3 py-3 border-t border-zinc-800 bg-zinc-900/80"
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-zinc-800 text-zinc-200 text-sm rounded-xl px-4 py-2.5
                       border border-zinc-700/50
                       placeholder:text-zinc-500
                       outline-none ring-0
                       focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50
                       transition-all duration-200"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium
                       hover:bg-indigo-500 active:bg-indigo-700
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-all duration-200 shrink-0"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
