import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ref, update, serverTimestamp, onValue } from "firebase/database";
import { RoomProvider, useRoomContext } from "../context/RoomContext";
import { database } from "../lib/firebase";
import { isTauri } from "../lib/runtime";
import VideoPlayer from "../components/VideoPlayer";
import BrowserPlayer from "../components/BrowserPlayer";
import Chat from "../components/Chat";
import UserList from "../components/UserList";
import AdminPanel from "../components/AdminPanel";

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

/**
 * Вспомогательная функция: извлекает YouTube Video ID из разных форматов.
 */
function extractVideoId(input) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;

  const urlParams = new URLSearchParams(
    trimmed.includes("?") ? trimmed.split("?")[1] : "",
  );
  const v = urlParams.get("v");
  if (v) return v;

  const shortMatch = trimmed.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  const shortsMatch = trimmed.match(/shorts\/([A-Za-z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];

  return null;
}

/**
 * RoomContent — внутренний компонент, который использует RoomContext.
 * Вынесен отдельно, чтобы RoomProvider был снаружи.
 */
function RoomContent() {
  const { user, displayName, authLoading, roomData, updateDisplayName, leaveRoom } =
    useRoomContext();
  const navigate = useNavigate();

  const [videoInput, setVideoInput] = useState("");
  const [extractedId, setExtractedId] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [debugOpen, setDebugOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [showTauriModal, setShowTauriModal] = useState(false);

  // ─── Player Type (из Firebase) ──────────────────────────────
  const [playerType, setPlayerType] = useState("youtube");

  // Извлекаем roomId из URL
  const { roomId } = useParams();
  const currentRoomId = roomId || "";

  // Сохраняем комнату в Recent Rooms при монтировании
  useEffect(() => {
    if (currentRoomId) {
      pushRecentRoom(currentRoomId);
    }
  }, [currentRoomId]);

  // ─── Подписка на playerType из Firebase ─────────────────────
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

  // ─── Переключение типа плеера ───────────────────────────────
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

  // ================================================================
  // Обработчик смены видео (только для YouTube)
  // ================================================================
  const handleSetVideo = useCallback(() => {
    const videoId = extractVideoId(videoInput);
    if (!videoId) {
      alert(
        "Не удалось распознать YouTube-ссылку. Используйте:\nhttps://www.youtube.com/watch?v=VIDEO_ID",
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

  // ================================================================
  // Обработчик смены имени
  // ================================================================
  const handleSaveName = () => {
    if (nameInput.trim()) {
      updateDisplayName(nameInput.trim());
    }
    setEditingName(false);
  };

  // ================================================================
  // Loader пока авторизация не завершена
  // ================================================================
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-500 text-sm">Authenticating...</span>
        </div>
      </div>
    );
  }

  // ================================================================
  // Данные
  // ================================================================
  const members = roomData?.members || {};
  const membersCount = Object.keys(members).length;
  const isHost = user && roomData?.hostId === user.uid;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
      {/* ════════════════ HEADER ════════════════ */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/80 bg-zinc-950 shrink-0">
        {/* Left */}
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-zinc-100 tracking-tight">
            🎬 Watch Party
          </h1>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-500 border border-zinc-800">
            {currentRoomId}
          </span>
        </div>

        {/* Right */}
        <div className="flex items-center gap-3">
          {/* User name */}
          {user && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400">
                {isHost ? "👑" : "👤"}
              </span>

              {editingName ? (
                <div className="flex items-center gap-1">
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                    onBlur={handleSaveName}
                    autoFocus
                    className="w-28 px-2 py-1 text-sm bg-zinc-800 text-zinc-200 rounded-lg
                               border border-zinc-700 outline-none
                               focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50
                               transition-all duration-200"
                  />
                </div>
              ) : (
                <span
                  onClick={() => {
                    setNameInput(displayName);
                    setEditingName(true);
                  }}
                  title="Click to rename"
                  className="text-sm text-zinc-300 border-b border-dashed border-zinc-700
                             cursor-pointer hover:text-zinc-100 transition-colors duration-150"
                >
                  {displayName}
                </span>
              )}
            </div>
          )}

          {/* Admin Panel button (host only) */}
          {isHost && (
            <button
              onClick={() => setAdminOpen(true)}
              title="Admin Panel"
              className="px-2.5 py-1.5 text-sm text-zinc-500 hover:text-cyan-400
                         rounded-lg hover:bg-cyan-500/10
                         transition-all duration-200"
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
            className="px-2.5 py-1.5 text-sm text-zinc-500 hover:text-red-400
                       rounded-lg hover:bg-red-500/10
                       transition-all duration-200"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowTauriModal(false)}
        >
          <div
            className="relative w-full max-w-md mx-4 p-6 rounded-2xl border border-zinc-700/60
                       bg-zinc-900/90 backdrop-blur-xl
                       shadow-2xl shadow-black/40
                       animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setShowTauriModal(false)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center
                         text-zinc-500 hover:text-zinc-300 rounded-lg
                         hover:bg-zinc-800 transition-all duration-200"
            >
              ✕
            </button>

            {/* Icon */}
            <div className="w-12 h-12 rounded-xl bg-indigo-600/20 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>

            <h3 className="text-lg font-semibold text-zinc-100 mb-2">
              Desktop Feature
            </h3>
            <p className="text-sm text-zinc-400 leading-relaxed mb-6">
              Want to watch movies from pirate sites or any other website? Download our Desktop App to bypass browser limitations.
            </p>

            <a
              href="https://github.com/kilojo2/watchme/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl
                         bg-gradient-to-r from-indigo-600 to-indigo-500
                         text-white text-sm font-semibold
                         shadow-lg shadow-indigo-600/20
                         hover:shadow-xl hover:shadow-indigo-600/30
                         hover:from-indigo-500 hover:to-indigo-400
                         active:scale-[0.98]
                         transition-all duration-200"
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
        {/* ──────── LEFT COLUMN (75%) ──────── */}
        <div className="flex-1 flex flex-col min-w-0 p-5 pb-0 overflow-y-auto">
          {/* ── Player Type Toggle ────────────────────────────── */}
          <div className="flex items-center gap-1 mb-4 p-1 rounded-xl bg-zinc-900 border border-zinc-800 w-fit">
            <button
              onClick={() => switchPlayerType("youtube")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                playerType === "youtube"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              }`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              YouTube
            </button>
            <button
              onClick={() => {
                if (isTauri()) {
                  switchPlayerType("browser");
                } else {
                  setShowTauriModal(true);
                }
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                playerType === "browser"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                  : isTauri()
                    ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                    : "text-zinc-600 cursor-not-allowed"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                />
              </svg>
              In-App Browser
            </button>
          </div>

          {/* ── YouTube Player ───────────────────────────────── */}
          {playerType === "youtube" && (
            <>
              {/* Video URL Input */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={videoInput}
                  onChange={(e) => setVideoInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSetVideo()}
                  placeholder="YouTube URL or Video ID..."
                  className="flex-1 px-4 py-2.5 bg-zinc-900 text-zinc-200 text-sm rounded-xl
                             border border-zinc-800 placeholder:text-zinc-600
                             outline-none ring-0
                             focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50
                             transition-all duration-200"
                />
                <button
                  onClick={handleSetVideo}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium
                             hover:bg-indigo-500 active:bg-indigo-700
                             transition-all duration-200 shrink-0"
                >
                  Load
                </button>
              </div>

              {/* Extracted ID badge */}
              {extractedId && (
                <div className="text-xs text-zinc-600 mb-2 font-mono">
                  ID: <span className="text-zinc-400">{extractedId}</span>
                </div>
              )}

              {/* YouTube Video Player */}
              <div className="w-full aspect-video rounded-xl overflow-hidden bg-zinc-900 shadow-lg shadow-black/30 mb-3">
                <VideoPlayer roomId={currentRoomId} />
              </div>
            </>
          )}

          {/* ── Browser Player ────────────────────────────────── */}
          {playerType === "browser" && (
            <div className="mb-3">
              <BrowserPlayer roomId={currentRoomId} />
            </div>
          )}

          {/* Debug Panel (collapsible) */}
          <div className="mb-5">
            <button
              onClick={() => setDebugOpen(!debugOpen)}
              className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400
                         transition-colors duration-150 mb-2"
            >
              <span className={`transition-transform duration-200 ${debugOpen ? "rotate-90" : ""}`}>
                ▶
              </span>
              Debug Panel
            </button>

            {debugOpen && (
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 animate-fade-in">
                <div className="flex flex-wrap gap-3 text-xs font-mono">
                  <span className="px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-400">
                    status:{" "}
                    <strong
                      className={
                        roomData?.status === "playing"
                          ? "text-emerald-400"
                          : roomData?.status === "paused"
                            ? "text-amber-400"
                            : "text-zinc-500"
                      }
                    >
                      {roomData?.status || "idle"}
                    </strong>
                  </span>
                  <span className="px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-400">
                    pos:{" "}
                    <strong className="text-zinc-300">
                      {typeof roomData?.lastPosition === "number"
                        ? `${roomData.lastPosition.toFixed(1)}s`
                        : "0s"}
                    </strong>
                  </span>
                  <span className="px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-400">
                    videoId:{" "}
                    <strong className="text-zinc-300">
                      {roomData?.currentVideoId || "—"}
                    </strong>
                  </span>
                  <span className="px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-400">
                    👥 {membersCount}
                  </span>
                </div>

                {/* Members debug list */}
                {membersCount > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Object.entries(members).map(([uid, m]) => (
                      <span
                        key={uid}
                        className="px-2 py-1 rounded-md bg-zinc-800/60 text-[11px] text-zinc-500"
                      >
                        {roomData?.hostId === uid ? "👑 " : ""}
                        {m?.name || "Anonymous"}
                        {uid === user?.uid && (
                          <span className="text-indigo-400 ml-1">(you)</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ──────── RIGHT COLUMN (25%) ──────── */}
        <aside className="w-[340px] shrink-0 border-l border-zinc-800/80 flex flex-col bg-zinc-950/50">
          {/* User List — верхняя половина */}
          <div className="flex-1 min-h-0 overflow-y-auto border-b border-zinc-800/50">
            <UserList />
          </div>

          {/* Chat — нижняя половина */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <Chat />
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Room — точка входа для страницы комнаты.
 * Оборачивает RoomContent в RoomProvider.
 */
export default function Room() {
  const { roomId } = useParams();
  const currentRoomId = roomId || "";

  return (
    <RoomProvider roomId={currentRoomId}>
      <RoomContent />
    </RoomProvider>
  );
}
