import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ref, set, serverTimestamp } from "firebase/database";
import { database } from "../lib/firebase";
import { isDesktop } from "../lib/runtime";
import useAuth from "../hooks/useAuth";

// ─── Constants ───────────────────────────────────────────────
const RECENT_ROOMS_KEY = "watchparty_recentRooms";
const MAX_RECENT = 5;

// ─── Helpers ─────────────────────────────────────────────────

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function getRecentRooms() {
  try {
    const raw = localStorage.getItem(RECENT_ROOMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function pushRecentRoom(roomId) {
  try {
    const rooms = getRecentRooms().filter((id) => id !== roomId);
    rooms.unshift(roomId);
    localStorage.setItem(
      RECENT_ROOMS_KEY,
      JSON.stringify(rooms.slice(0, MAX_RECENT)),
    );
  } catch {
    // ignore
  }
}

// ─── Sub-components ──────────────────────────────────────────

function ProfileCard({ displayName, updateDisplayName, loading }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");

  const handleStartEdit = () => {
    setInput(displayName);
    setEditing(true);
  };

  const handleSave = () => {
    if (input.trim() && input.trim() !== displayName) {
      updateDisplayName(input.trim());
    }
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setEditing(false);
  };

  if (loading) {
    return <div className="w-32 h-5 bg-inkstone animate-pulse rounded-none" />;
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-felt-gray uppercase tracking-[0.15em] font-[400]">
        You are
      </span>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            autoFocus
            maxLength={24}
            className="w-36 editorial-input text-sm"
          />
          <button
            onClick={handleSave}
            className="ghost-pill-sm"
          >
            ✓
          </button>
        </div>
      ) : (
        <button
          onClick={handleStartEdit}
          className="ghost-pill-sm"
        >
          {displayName}
        </button>
      )}
    </div>
  );
}

function RecentRoomTag({ roomId, onClick }) {
  return (
    <button
      onClick={() => onClick(roomId)}
      className="ghost-pill-sm font-mono"
    >
      {roomId}
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function Home() {
  const navigate = useNavigate();
  const { displayName, loading, updateDisplayName } = useAuth();

  const [joinInput, setJoinInput] = useState("");
  const [recentRooms, setRecentRooms] = useState(() => getRecentRooms());
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handleFocus = () => setRecentRooms(getRecentRooms());
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const handleCreateRoom = useCallback(async () => {
    const roomId = generateRoomId();

    try {
      const roomRef = ref(database, `rooms/${roomId}`);
      await set(roomRef, {
        currentVideoId: "",
        status: "paused",
        lastPosition: 0,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Home: failed to create room in Firebase", err);
    }

    pushRecentRoom(roomId);
    setRecentRooms(getRecentRooms());
    navigate(`/room/${roomId}`);
  }, [navigate]);

  const handleJoinRoom = useCallback(() => {
    const id = joinInput.trim();
    if (!id) return;

    let roomId = id;
    const roomMatch = id.match(/\/room\/([^/\s?]+)/);
    if (roomMatch) {
      roomId = roomMatch[1];
    }

    roomId = roomId.replace(/[^A-Za-z0-9_-]/g, "");

    if (!roomId) return;

    pushRecentRoom(roomId);
    setRecentRooms(getRecentRooms());
    navigate(`/room/${roomId}`);
  }, [joinInput, navigate]);

  const handleRecentClick = useCallback(
    (roomId) => {
      pushRecentRoom(roomId);
      navigate(`/room/${roomId}`);
    },
    [navigate],
  );

  return (
    <div className="min-h-screen bg-obsidian flex flex-col font-roobert">
      {/* ═══ Hero — iridescent backdrop with monumental title ═══ */}
      <div className="relative flex flex-col items-center justify-center flex-1 px-6 py-16 overflow-hidden">
        {/* Iridescent backdrop — the only chromatic surface */}
        <div
          className="absolute inset-0 hero-iridescent animate-iridescent opacity-40 pointer-events-none"
          style={{ filter: "blur(120px) saturate(1.4)" }}
        />

        {/* Content */}
        <div
          className={`relative z-10 w-full max-w-[1078px] mx-auto flex flex-col items-center gap-[46px]
            transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]
            ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          {/* ═══ Monumental Title — whisper weight 300 @ 78px ═══ */}
          <div className="text-center max-w-[900px]">
            <h1 className="text-[78px] font-[300] text-paper leading-[1.1] tracking-normal font-roobert">
              Watch Party
            </h1>
            <p className="mt-[14px] text-body text-felt-gray font-roobert font-[400] leading-[1.21] max-w-[600px] mx-auto">
              Watch YouTube with friends in your browser, or download the Desktop App
              to watch streams and movies from any website.
            </p>
          </div>

          {/* ═══ Profile — floating on black, no bg fill ═══ */}
          <div className="w-full flex justify-center">
            <ProfileCard
              displayName={displayName}
              updateDisplayName={updateDisplayName}
              loading={loading}
            />
          </div>

          {/* ═══ Action columns — bordered glass cards ═══ */}
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Create Room */}
            <div className="border border-white/15 p-8 lg:p-10 bg-black/10 backdrop-blur-md rounded-3xl flex flex-col gap-[14px]">
              <h3 className="text-white text-[12px] font-semibold uppercase tracking-[0.2em]">
                Create Room
              </h3>
              <p className="text-body-sm text-white/70 leading-[1.15] font-[400]">
                Generate a new room and invite friends with its code.
              </p>
              <button
                onClick={handleCreateRoom}
                className="ghost-pill self-start mt-[14px]"
              >
                Create Room
              </button>
            </div>

            {/* Join Room */}
            <div className="border border-white/15 p-8 lg:p-10 bg-black/10 backdrop-blur-md rounded-3xl flex flex-col gap-[14px]">
              <h3 className="text-white text-[12px] font-semibold uppercase tracking-[0.2em]">
                Join Room
              </h3>
              <p className="text-body-sm text-white/70 leading-[1.15] font-[400]">
                Enter a room code or link to join an existing watch party.
              </p>
              <div className="flex gap-[14px] items-end mt-[14px]">
                <input
                  type="text"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                  placeholder="Room code or link..."
                  className="flex-1 min-w-0 border border-white/30 bg-white/5 px-6 py-3 text-white placeholder:text-white/40 rounded-full focus:bg-white/10 focus:border-white/50 transition-colors focus:outline-none w-full"
                />
                <button
                  onClick={handleJoinRoom}
                  disabled={!joinInput.trim()}
                  className="ghost-pill shrink-0"
                >
                  Go
                </button>
              </div>
            </div>
          </div>

          {/* ═══ Recent Rooms — ghost pill tags ═══ */}
          {recentRooms.length > 0 && (
            <div
              className="w-full animate-fade-in"
              style={{ animationDelay: "200ms" }}
            >
              <p className="text-[11px] font-[400] uppercase tracking-[0.15em] text-felt-gray mb-[14px]">
                Recent Rooms
              </p>
              <div className="flex flex-wrap gap-[8px]">
                {recentRooms.map((roomId) => (
                  <RecentRoomTag
                    key={roomId}
                    roomId={roomId}
                    onClick={handleRecentClick}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ═══ Download Desktop App ═══ */}
          {!isDesktop() && (
            <a
              href="https://github.com/kilojo2/watchme/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="ghost-pill inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </svg>
              Download Desktop App
            </a>
          )}

          {/* ═══ Footer — 11px Felt Gray address block ═══ */}
          <p className="text-[11px] text-felt-gray text-center uppercase tracking-[0.1em] font-[400] leading-[1.36]">
            Powered by Firebase Realtime Database &middot; Open Source
          </p>
        </div>
      </div>
    </div>
  );
}
