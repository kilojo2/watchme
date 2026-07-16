import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ref, set, serverTimestamp } from "firebase/database";
import { database } from "../lib/firebase";
import useAuth from "../hooks/useAuth";

// ─── Constants ───────────────────────────────────────────────
const RECENT_ROOMS_KEY = "watchparty_recentRooms";
const MAX_RECENT = 5;

// ─── Helpers ─────────────────────────────────────────────────

/** Генерирует случайный короткий ID для комнаты (6 символов). */
function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/** Читает массив недавних комнат из localStorage. */
function getRecentRooms() {
  try {
    const raw = localStorage.getItem(RECENT_ROOMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Добавляет roomId в начало списка недавних комнат (без дубликатов). */
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

// ─── SVG Icons (inline, no dependency needed) ────────────────

function IconPlus() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function IconJoin() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ─── Sub-components ──────────────────────────────────────────

/**
 * Профиль: отображает текущий nickname, позволяет его изменить.
 */
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
    return (
      <div className="w-40 h-9 rounded-xl bg-zinc-800/30 animate-pulse" />
    );
  }

  return (
    <div className="group flex items-center gap-2">
      <span className="text-sm text-zinc-500 font-medium">You are</span>
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            autoFocus
            maxLength={24}
            className="w-36 px-3 py-1.5 text-sm bg-zinc-800/80 text-zinc-200 rounded-lg
                       border border-zinc-700 outline-none
                       focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50
                       transition-all duration-200"
          />
          <button
            onClick={handleSave}
            className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-400
                       hover:bg-indigo-600/40 transition-colors duration-150"
          >
            <IconCheck />
          </button>
        </div>
      ) : (
        <button
          onClick={handleStartEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                     text-zinc-200 bg-zinc-800/40 rounded-lg
                     border border-zinc-800/60
                     hover:bg-zinc-800/80 hover:border-zinc-700
                     hover:text-white
                     transition-all duration-200 group"
        >
          {displayName}
          <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-zinc-500">
            <IconEdit />
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * Карточка действий: Create Room или Join Room.
 */
function ActionCard({
  icon,
  title,
  description,
  children,
  accent = "indigo",
}) {
  const accentMap = {
    indigo: {
      border: "hover:border-indigo-500/50",
      glow: "group-hover:shadow-indigo-500/10",
      text: "text-indigo-400",
    },
    emerald: {
      border: "hover:border-emerald-500/50",
      glow: "group-hover:shadow-emerald-500/10",
      text: "text-emerald-400",
    },
  };

  const a = accentMap[accent] || accentMap.indigo;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-zinc-800/60
                  bg-zinc-900/40 backdrop-blur-xl p-6
                  shadow-lg shadow-black/20
                  transition-all duration-300
                  hover:shadow-xl ${a.border} ${a.glow}`}
    >
      {/* Glass highlight */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />

      {/* Content */}
      <div className="relative z-10">
        <div
          className={`flex items-center gap-2.5 mb-3 ${a.text}`}
        >
          {icon}
          <h3 className="text-base font-semibold text-zinc-200">{title}</h3>
        </div>
        <p className="text-sm text-zinc-500 mb-4 leading-relaxed">
          {description}
        </p>
        {children}
      </div>
    </div>
  );
}

/**
 * Тег недавней комнаты.
 */
function RecentRoomTag({ roomId, onClick }) {
  return (
    <button
      onClick={() => onClick(roomId)}
      className="group flex items-center gap-2 px-3.5 py-2 rounded-xl
                 bg-zinc-800/30 border border-zinc-800/50
                 text-sm text-zinc-400 font-mono
                 hover:bg-zinc-800/60 hover:text-zinc-200 hover:border-zinc-700
                 hover:shadow-lg hover:shadow-black/20
                 transition-all duration-200"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 group-hover:bg-indigo-500 transition-colors duration-200" />
      {roomId}
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function Home() {
  const navigate = useNavigate();
  const { displayName, loading, updateDisplayName } = useAuth();

  // Состояние для Join Room
  const [joinInput, setJoinInput] = useState("");

  // Состояние для недавних комнат
  const [recentRooms, setRecentRooms] = useState(() => getRecentRooms());

  // Анимация появления
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Обновляем recentRooms при фокусе (если другой таб изменил localStorage)
  useEffect(() => {
    const handleFocus = () => setRecentRooms(getRecentRooms());
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  // ── Создание комнаты ──────────────────────────────────────
  const handleCreateRoom = useCallback(async () => {
    const roomId = generateRoomId();

    // Записываем базовую структуру в Firebase RTDB
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

  // ── Присоединение к комнате ───────────────────────────────
  const handleJoinRoom = useCallback(() => {
    const id = joinInput.trim();
    if (!id) return;

    // Извлекаем roomId из разных форматов:
    // - "abc123" → "abc123"
    // - "https://.../room/abc123" → "abc123"
    // - "/room/abc123" → "abc123"
    let roomId = id;
    const roomMatch = id.match(/\/room\/([^/\s?]+)/);
    if (roomMatch) {
      roomId = roomMatch[1];
    }

    // Очищаем от невалидных символов
    roomId = roomId.replace(/[^A-Za-z0-9_-]/g, "");

    if (!roomId) return;

    pushRecentRoom(roomId);
    setRecentRooms(getRecentRooms());
    navigate(`/room/${roomId}`);
  }, [joinInput, navigate]);

  // ── Быстрый переход по недавней комнате ───────────────────
  const handleRecentClick = useCallback(
    (roomId) => {
      pushRecentRoom(roomId);
      navigate(`/room/${roomId}`);
    },
    [navigate],
  );

  // ── Рендер ────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen bg-zinc-950 flex flex-col overflow-hidden">
      {/* ── Фоновые декоративные элементы ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-indigo-600/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-emerald-600/5 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-zinc-800/5 blur-3xl" />
      </div>

      {/* ── Контент ── */}
      <div
        className={`relative z-10 flex flex-col items-center justify-center flex-1 px-4 py-12
                    transition-all duration-700 ease-out
                    ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
      >
        <div className="w-full max-w-lg mx-auto flex flex-col items-center gap-8">
          {/* ═══ Logo / Title ═══ */}
          <div className="text-center">
            <h1
              className="text-4xl sm:text-5xl font-extrabold tracking-tight
                         bg-gradient-to-r from-indigo-400 via-violet-300 to-emerald-400
                         bg-clip-text text-transparent
                         drop-shadow-lg"
            >
              Watch Party
            </h1>
            <p className="mt-2 text-sm text-zinc-600 font-medium tracking-wide">
              Watch YouTube together in real-time
            </p>
          </div>

          {/* ═══ Profile Card ═══ */}
          <div
            className="w-full rounded-2xl border border-zinc-800/60 bg-zinc-900/30
                       backdrop-blur-xl p-5
                       shadow-lg shadow-black/20
                       transition-all duration-300"
          >
            <div className="flex items-center justify-between">
              <ProfileCard
                displayName={displayName}
                updateDisplayName={updateDisplayName}
                loading={loading}
              />
            </div>
          </div>

          {/* ═══ Action Cards ═══ */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Create Room */}
            <ActionCard
              icon={<IconPlus />}
              title="Create Room"
              description="Generate a new room and invite friends with its code."
              accent="indigo"
            >
              <button
                onClick={handleCreateRoom}
                className="w-full px-4 py-2.5 rounded-xl
                           bg-gradient-to-r from-indigo-600 to-indigo-500
                           text-white text-sm font-semibold
                           shadow-lg shadow-indigo-600/20
                           hover:shadow-xl hover:shadow-indigo-600/30
                           hover:from-indigo-500 hover:to-indigo-400
                           active:scale-[0.98]
                           transition-all duration-200"
              >
                Create Room
              </button>
            </ActionCard>

            {/* Join Room */}
            <ActionCard
              icon={<IconJoin />}
              title="Join Room"
              description="Enter a room code or link to join an existing watch party."
              accent="emerald"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                  placeholder="Room code or link..."
                  className="flex-1 min-w-0 px-3.5 py-2.5 text-sm
                             bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600
                             rounded-xl border border-zinc-700/60
                             outline-none
                             focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50
                             transition-all duration-200"
                />
                <button
                  onClick={handleJoinRoom}
                  disabled={!joinInput.trim()}
                  className="px-4 py-2.5 rounded-xl
                             bg-gradient-to-r from-emerald-600 to-emerald-500
                             text-white text-sm font-semibold
                             shadow-lg shadow-emerald-600/20
                             hover:shadow-xl hover:shadow-emerald-600/30
                             hover:from-emerald-500 hover:to-emerald-400
                             active:scale-[0.98]
                             disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none
                             transition-all duration-200 shrink-0"
                >
                  Go
                </button>
              </div>
            </ActionCard>
          </div>

          {/* ═══ Recent Rooms ═══ */}
          {recentRooms.length > 0 && (
            <div
              className="w-full animate-fade-in"
              style={{ animationDelay: "200ms" }}
            >
              <div className="flex items-center gap-2 mb-3 text-zinc-600">
                <IconHistory />
                <span className="text-xs font-medium uppercase tracking-wider">
                  Recent Rooms
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
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

          {/* ═══ Footer ═══ */}
          <p className="text-[11px] text-zinc-700 text-center mt-4">
            Powered by Firebase Realtime Database &middot; Open Source
          </p>
        </div>
      </div>
    </div>
  );
}
