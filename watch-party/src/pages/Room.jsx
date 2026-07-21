import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ref, update, serverTimestamp, onValue } from "firebase/database";
import { RoomProvider, useRoomContext } from "../context/RoomContext";
import { database } from "../lib/firebase";
import { isDesktop } from "../lib/runtime";
import { extractVideoId } from "../lib/roomUtils";
import VideoPlayer from "../components/VideoPlayer";
import BrowserPlayer from "../components/BrowserPlayer";
import Chat from "../components/Chat";
import UserList from "../components/UserList";
import TheaterToggle from "../components/TheaterToggle";
import AdminPanel from "../components/AdminPanel";
import PasswordGate from "../components/PasswordGate";

// ─── Recent Rooms ──────────────────────────────────────────────
const RECENT_ROOMS_KEY = "watchparty_recentRooms";
const MAX_RECENT = 5;

function pushRecentRoom(roomId) {
  try {
    const raw = localStorage.getItem(RECENT_ROOMS_KEY);
    const rooms = raw ? JSON.parse(raw) : [];
    const filtered = rooms.filter((id) => id !== roomId);
    filtered.unshift(roomId);
    localStorage.setItem(
      RECENT_ROOMS_KEY,
      JSON.stringify(filtered.slice(0, MAX_RECENT)),
    );
  } catch {
    // ignore
  }
}


function RoomContent() {
  const { user, displayName, authLoading, roomData, updateDisplayName, leaveRoom } =
    useRoomContext();
  const navigate = useNavigate();

  const [videoInput, setVideoInput] = useState("");
  const [extractedId, setExtractedId] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [theaterMode, setTheaterMode] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [showTauriModal, setShowTauriModal] = useState(false);

  const [playerType, setPlayerType] = useState("youtube");

  const { roomId } = useParams();
  const currentRoomId = roomId || "";

  // ─── Password gate for private rooms ──────────────────────────────
  const [passwordVerified, setPasswordVerified] = useState(() => {
    // Check sessionStorage so verified users don't re-enter on refresh
    try {
      return sessionStorage.getItem(`room_pw_${currentRoomId}`) === "verified";
    } catch {
      return false;
    }
  });

  const handlePasswordVerified = useCallback(() => {
    try {
      sessionStorage.setItem(`room_pw_${currentRoomId}`, "verified");
    } catch {
      // ignore
    }
    setPasswordVerified(true);
  }, [currentRoomId]);

  useEffect(() => {
    if (currentRoomId) {
      pushRecentRoom(currentRoomId);
    }
  }, [currentRoomId]);

  useEffect(() => {
    if (!currentRoomId) return;

    const roomRef = ref(database, `rooms/${currentRoomId}`);

    const unsubPlayerType = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data?.playerType) {
        setPlayerType(data.playerType);
      }
    });

    return () => unsubPlayerType();
  }, [currentRoomId]);

  const switchPlayerType = useCallback(
    (type) => {
      if (!currentRoomId) return;

      const roomRef = ref(database, `rooms/${currentRoomId}`);
      update(roomRef, {
        playerType: type,
        status: "idle",
        lastPosition: 0,
        updatedAt: serverTimestamp(),
      });
    },
    [currentRoomId],
  );

  const handleSetVideo = useCallback(() => {
    const videoId = extractVideoId(videoInput);
    if (!videoId) {
      alert(
        "Could not recognize YouTube link. Use:\nhttps://www.youtube.com/watch?v=VIDEO_ID",
      );
      return;
    }

    setExtractedId(videoId);

    const roomRef = ref(database, `rooms/${currentRoomId}`);
    update(roomRef, {
      currentVideoId: videoId,
      status: "idle",
      lastPosition: 0,
      updatedAt: serverTimestamp(),
    });
  }, [currentRoomId, videoInput]);

  const handleSaveName = () => {
    if (nameInput.trim()) {
      updateDisplayName(nameInput.trim());
    }
    setEditingName(false);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-obsidian">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border border-white/30 border-t-white animate-spin rounded-none" />
          <span className="text-felt-gray text-[11px] uppercase tracking-[0.15em] font-[400]">
            Authenticating...
          </span>
        </div>
      </div>
    );
  }

  const members = roomData?.members || {};
  const membersCount = Object.keys(members).length;
  const isHost = user && roomData?.hostId === user.uid;

  // ─── Password gate for private rooms ───────────────
  const needsPassword =
    roomData &&
    roomData.isPublic === false &&
    roomData.password &&
    !passwordVerified;

  if (needsPassword) {
    return (
      <PasswordGate
        roomId={currentRoomId}
        roomName={roomData.name || currentRoomId}
        password={roomData.password}
        onVerified={handlePasswordVerified}
      />
    );
  }

  return (
    <div className="h-screen bg-obsidian text-paper flex flex-col font-roobert">
      {/* ════════════════ HEADER ════════════════ */}
      <header className="flex items-center justify-between px-[34px] py-3 border-b border-white/5 bg-obsidian shrink-0">
        {/* Left */}
        <div className="flex items-center gap-3">
          <h1 className="text-body-sm font-[400] text-paper uppercase tracking-[0.15em]">
            Watch Party
          </h1>
          <span className="text-[10px] font-mono px-2 py-1 bg-inkstone text-felt-gray uppercase tracking-wider">
            {currentRoomId}
          </span>
        </div>

        {/* Right */}
        <div className="flex items-center gap-3">
          {/* User name */}
          {user && (
            <div className="flex items-center gap-2">
              {editingName ? (
                <div className="flex items-center gap-1">
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                    onBlur={handleSaveName}
                    autoFocus
                    className="w-28 editorial-input text-sm"
                  />
                </div>
              ) : (
                <span
                  onClick={() => {
                    setNameInput(displayName);
                    setEditingName(true);
                  }}
                  title="Click to rename"
                  className="text-[12px] text-ash-mist border-b border-dashed border-white/10
                             cursor-pointer hover:text-paper
                             transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]"
                >
                  {displayName}
                </span>
              )}
            </div>
          )}

          {/* Theater Mode toggle */}
          <TheaterToggle
            isTheaterMode={theaterMode}
            onToggle={() => setTheaterMode((prev) => !prev)}
          />

          {/* Admin Panel button (host only) */}
          {isHost && (
            <button
              onClick={() => setAdminOpen(true)}
              title="Admin Panel"
              className="text-felt-gray hover:text-paper
                         transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] px-2 py-1 text-[12px] font-[400]"
            >
              🛡️
            </button>
          )}

          {/* Leave button */}
          <button
            onClick={() => {
              leaveRoom();
              navigate("/");
            }}
            title="Leave room"
            className="text-felt-gray hover:text-paper
                       transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] px-2 py-1 text-[12px] font-[400]"
          >
            ✕
          </button>
        </div>
      </header>

      {/* Admin Panel modal */}
      <AdminPanel isOpen={adminOpen} onClose={() => setAdminOpen(false)} />

      {/* Tauri-only feature modal (web version) */}
      {showTauriModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80 animate-fade-in"
          onClick={() => setShowTauriModal(false)}
        >
          <div
            className="relative w-full max-w-md mx-4 p-[34px] bg-inkstone"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setShowTauriModal(false)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-felt-gray hover:text-paper transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]"
            >
              ✕
            </button>

            <h3 className="text-[11px] font-[400] text-paper uppercase tracking-[0.15em] mb-3">
              Desktop Feature
            </h3>
            <p className="text-body-sm text-ash-mist leading-[1.15] font-[400] mb-6">
              Want to watch movies from any website? Download our Desktop App to bypass browser limitations.
            </p>

            <a
              href="https://github.com/kilojo2/watchme/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="ghost-pill w-full"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </svg>
              Download Desktop App
            </a>
          </div>
        </div>
      )}

      {/* ════════════════ MAIN LAYOUT ════════════════ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ──────── LEFT COLUMN ──────── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 p-[34px] pb-0 overflow-y-auto">
          {/* ── Player Type Toggle ── */}
          <div className="flex items-center mb-6">
            <button
              onClick={() => switchPlayerType("youtube")}
              className={`px-[33px] py-[11px] text-body-sm font-[400] rounded-[75px] border transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] ${
                playerType === "youtube"
                  ? "bg-paper text-obsidian border-paper"
                  : "bg-transparent text-felt-gray border-white/30 hover:text-paper hover:border-white/60"
              }`}
            >
              YouTube
            </button>
            <button
              onClick={() => {
                if (isDesktop()) {
                  switchPlayerType("browser");
                } else {
                  setShowTauriModal(true);
                }
              }}
              className={`px-[33px] py-[11px] text-body-sm font-[400] rounded-[75px] border transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] ml-[14px] ${
                playerType === "browser"
                  ? "bg-paper text-obsidian border-paper"
                  : isDesktop()
                    ? "bg-transparent text-felt-gray border-white/30 hover:text-paper hover:border-white/60"
                    : "bg-transparent text-felt-gray/40 border-white/10 cursor-not-allowed"
              }`}
            >
              In-App Browser
            </button>
          </div>

          {/* ── YouTube Player ── */}
          {playerType === "youtube" && (
            <>
              {/* Video URL Input */}
              <div className="flex gap-[14px] mb-4">
                <input
                  type="text"
                  value={videoInput}
                  onChange={(e) => setVideoInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSetVideo()}
                  placeholder="YouTube URL or Video ID..."
                  className="flex-1 editorial-input text-sm"
                />
                <button
                  onClick={handleSetVideo}
                  className="ghost-pill shrink-0"
                >
                  Load
                </button>
              </div>

              {/* Extracted ID badge */}
              {extractedId && (
                <div className="text-[10px] text-felt-gray mb-3 font-mono">
                  ID: <span className="text-ash-mist">{extractedId}</span>
                </div>
              )}

              {/* YouTube Video Player */}
              <div className="flex-1 w-full min-h-0 bg-obsidian mb-4">
                <VideoPlayer roomId={currentRoomId} />
              </div>
            </>
          )}

          {/* ── Browser Player ── */}
          {playerType === "browser" && (
            <div className="flex-1 w-full min-h-0 mb-4 flex flex-col">
              <BrowserPlayer roomId={currentRoomId} />
            </div>
          )}

          {/* Debug Panel (collapsible) */}
          <div className="mb-5">
            <button
              onClick={() => setDebugOpen(!debugOpen)}
              className="flex items-center gap-1.5 text-[10px] text-felt-gray hover:text-ash-mist
                         transition-colors duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] mb-2 uppercase tracking-wider"
            >
              <span className={`transition-transform duration-[800ms] ${debugOpen ? "rotate-90" : ""}`}>
                ▶
              </span>
              Debug Panel
            </button>

            {debugOpen && (
              <div className="animate-fade-in">
                <div className="flex flex-wrap gap-3 text-[11px] font-mono">
                  <span className="px-2.5 py-1.5 bg-inkstone text-felt-gray">
                    status:{" "}
                    <strong
                      className={
                        roomData?.status === "playing"
                          ? "text-paper"
                          : roomData?.status === "paused"
                            ? "text-ash-mist"
                            : "text-felt-gray"
                      }
                    >
                      {roomData?.status || "idle"}
                    </strong>
                  </span>
                  <span className="px-2.5 py-1.5 bg-inkstone text-felt-gray">
                    pos:{" "}
                    <strong className="text-ash-mist">
                      {typeof roomData?.lastPosition === "number"
                        ? `${roomData.lastPosition.toFixed(1)}s`
                        : "0s"}
                    </strong>
                  </span>
                  <span className="px-2.5 py-1.5 bg-inkstone text-felt-gray">
                    videoId:{" "}
                    <strong className="text-ash-mist">
                      {roomData?.currentVideoId || "—"}
                    </strong>
                  </span>
                  <span className="px-2.5 py-1.5 bg-inkstone text-felt-gray">
                    👥 {membersCount}
                  </span>
                </div>

                {/* Members debug list */}
                {membersCount > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Object.entries(members).map(([uid, m]) => (
                      <span
                        key={uid}
                        className="px-2 py-1 bg-inkstone text-[10px] text-felt-gray"
                      >
                        {m?.name || "Anonymous"}
                        {uid === user?.uid && (
                          <span className="text-paper ml-1">(you)</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ──────── RIGHT COLUMN — hidden in Theater Mode ── */}
        {!theaterMode && (
          <aside className="w-[340px] shrink-0 border-l border-white/10 flex flex-col bg-obsidian">
            {/* User List — upper half */}
            <div className="flex-1 min-h-0 overflow-y-auto border-b border-white/5">
              <UserList />
            </div>

            {/* Chat — lower half */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <Chat />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export default function Room() {
  const { roomId } = useParams();
  const currentRoomId = roomId || "";

  return (
    <RoomProvider roomId={currentRoomId}>
      <RoomContent />
    </RoomProvider>
  );
}
