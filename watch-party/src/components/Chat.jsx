import { useState, useRef, useEffect } from "react";
import { useRoomContext } from "../context/RoomContext";

/**
 * Chat — editorial magazine-style text chat.
 *
 * Design rules:
 * - No chat bubbles. Text flows like an editorial magazine.
 * - Sender name in pure white (paper), message text in muted gray.
 * - Timestamp in felt-gray (11px). Left-aligned.
 * - Monochrome avatars (first letter, no gradients).
 */

function AvatarLetter({ name, uid }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  return (
    <span className="w-5 h-5 flex items-center justify-center text-[10px] font-medium text-felt-gray bg-inkstone shrink-0">
      {initial}
    </span>
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
    <div className="flex flex-col h-full bg-inkstone">
      {/* ── Header ── */}
      <div className="px-[34px] py-3 border-b border-white/5 shrink-0">
        <h3 className="text-[11px] font-medium text-felt-gray uppercase tracking-[0.15em]">
          Chat
        </h3>
      </div>

      {/* ── Messages (editorial flow) ── */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto min-h-0 px-[34px] py-4 space-y-5 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-felt-gray text-sm gap-1">
            <span className="text-xs uppercase tracking-[0.15em]">No messages yet</span>
            <span className="text-[11px] text-felt-gray/60">
              Be the first to say something.
            </span>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isMine = user && msg.uid === user.uid;

          return (
            <div
              key={msg.id}
              className="animate-fade-in"
              style={{ animationDelay: `${Math.min(idx * 15, 200)}ms` }}
            >
              {/* Sender row: avatar + name + timestamp */}
              <div className="flex items-center gap-2 mb-1">
                <AvatarLetter name={msg.name} uid={msg.uid} />
                <span className="text-[11px] font-medium text-paper">
                  {msg.name || "Anonymous"}
                  {isMine && <span className="text-felt-gray ml-1">(you)</span>}
                </span>
                <span className="text-[10px] text-felt-gray ml-auto">
                  {formatTime(msg.timestamp)}
                </span>
              </div>

              {/* Message text — editorial flow, no bubble */}
              <p className="text-sm text-ash-mist leading-relaxed pl-7">
                {msg.text}
              </p>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ── */}
      <form
        onSubmit={handleSend}
        className="shrink-0 px-[34px] py-3 border-t border-white/5 bg-inkstone"
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-transparent text-paper text-sm rounded-none px-0 py-2.5
                       border-0 border-b border-white/10
                       placeholder:text-felt-gray
                       outline-none
                       focus:border-white/30
                       transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="ghost-pill-sm shrink-0"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
