import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ref, onValue } from "firebase/database";
import { database } from "../lib/firebase";
import { isDesktop } from "../lib/runtime";
import useAuth from "../hooks/useAuth";
import CreateRoomModal from "../components/CreateRoomModal";
import PublicRoomList from "../components/PublicRoomList";
import RoomPreview from "../components/RoomPreview";

// ─── Constants ───────────────────────────────────────────────
const RECENT_ROOMS_KEY = "watchparty_recentRooms";
const MAX_RECENT = 5;

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
          <button onClick={handleSave} className="ghost-pill-sm">
            ✓
          </button>
        </div>
      ) : (
        <button onClick={handleStartEdit} className="ghost-pill-sm">
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

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [publicRoomsList, setPublicRoomsList] = useState([]);
  const [publicRoomsLoading, setPublicRoomsLoading] = useState(true);

  const handleCreateRoom = useCallback(() => {
    setShowCreateModal(true);
  }, []);

  const handleModalCreate = useCallback(
    (roomId) => {
      pushRecentRoom(roomId);
      setRecentRooms(getRecentRooms());
      setShowCreateModal(false);
      navigate(`/room/${roomId}`);
    },
    [navigate],
  );

  // ─── Public Rooms — live query from Firebase ──────────────────
  useEffect(() => {
    const publicRoomsRef = ref(database, "publicRooms");
    const unsubscribe = onValue(
      publicRoomsRef,
      (snapshot) => {
        const data = snapshot.val();
        if (!data) {
          setPublicRoomsList([]);
        } else {
          const list = Object.entries(data).map(([id, room]) => ({
            id,
            ...room,
          }));
          list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          setPublicRoomsList(list);
        }
        setPublicRoomsLoading(false);
      },
      (error) => {
        console.error("Home: failed to load public rooms", error);
        setPublicRoomsList([]);
        setPublicRoomsLoading(false);
      },
    );
    return unsubscribe;
  }, []);

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

  const handlePublicRoomJoin = useCallback(
    (roomId) => {
      pushRecentRoom(roomId);
      setRecentRooms(getRecentRooms());
      navigate(`/room/${roomId}`);
    },
    [navigate],
  );

  return (
    <div className="min-h-screen bg-obsidian flex flex-col font-roobert">
      {/* ═════════════════════════════════════════════════════════
          HERO — full-viewport iridescent-backed section
          ═════════════════════════════════════════════════════════ */}
      <div className="relative flex flex-col items-center pt-12 pb-24 px-6 overflow-hidden">
        {/* Iridescent backdrop */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[800px] hero-iridescent animate-iridescent opacity-30 pointer-events-none"
          style={{ filter: "blur(140px) saturate(1.4)" }}
        />

        {/* ── Hero content ── */}
        <div
          className={`relative z-10 w-full max-w-5xl mx-auto flex flex-col items-center
            transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]
            ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          {/* Headline */}
          <h1 className="text-[64px] sm:text-[78px] lg:text-[94px] font-[300] text-paper leading-[1.05] tracking-[-0.02em] text-center max-w-[900px]">
            Watch anything.
            <br />
            <span className="font-[400] italic">Together.</span>
          </h1>

          {/* Supporting text */}
          <p className="mt-5 max-w-[540px] text-[16px] sm:text-[18px] text-felt-gray font-[400] leading-[1.3] text-center">
            Watch movies, YouTube and streams together with your friends — perfectly synced, wherever you are.
          </p>

          {/* ── Unified action area ── */}
          <div className="mt-10 w-full max-w-[520px]">
            {/* Primary: Create Room */}
            <button
              onClick={handleCreateRoom}
              className="w-full ghost-pill text-[15px] py-4 mb-3"
            >
              Create a Room
            </button>

            {/* Secondary: Join Room */}
            <div className="flex gap-3 items-center">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                  placeholder="Enter room code or invite link..."
                  className="w-full border border-white/20 bg-white/[0.03] px-5 py-3 text-white text-[13px] placeholder:text-white/25 rounded-full focus:bg-white/[0.06] focus:border-white/40 transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] focus:outline-none"
                />
              </div>
              <button
                onClick={handleJoinRoom}
                disabled={!joinInput.trim()}
                className="ghost-pill shrink-0 px-6 py-3 text-[13px]"
              >
                Join
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════
          PREVIEW — visual mockup of the WatchMe experience
          ═════════════════════════════════════════════════════════ */}
      <div className="-mt-10 pb-20 px-6">
        <RoomPreview />
      </div>

      {/* ═════════════════════════════════════════════════════════
          SECONDARY CONTENT — rooms, recent, desktop app
          ═════════════════════════════════════════════════════════ */}
      <div
        className={`w-full max-w-5xl mx-auto px-6 pb-20 space-y-16
          transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]
          ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
      >
        {/* ── Public Rooms ── */}
        <div className="animate-fade-in delay-200">
          <PublicRoomList
            rooms={publicRoomsList}
            loading={publicRoomsLoading}
            onJoin={handlePublicRoomJoin}
          />
        </div>

        {/* ── Recent Rooms ── */}
        {recentRooms.length > 0 && (
          <div className="animate-fade-in delay-300">
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

        {/* ── Desktop App ── */}
        {!isDesktop() && (
          <div className="flex justify-center animate-fade-in delay-400">
            <a
              href="https://github.com/kilojo2/watchme/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="ghost-pill inline-flex items-center gap-2 text-[13px]"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </svg>
              Download Desktop App
            </a>
          </div>
        )}

        {/* ── Footer ── */}
        <p className="text-[11px] text-felt-gray text-center uppercase tracking-[0.1em] font-[400] leading-[1.36]">
          Powered by Firebase Realtime Database &middot; Open Source
        </p>
      </div>

      {/* ═══ Create Room Modal ═══ */}
      <CreateRoomModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleModalCreate}
      />
    </div>
  );
}
