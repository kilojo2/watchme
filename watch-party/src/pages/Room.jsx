import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ref, update, serverTimestamp, onValue } from "firebase/database";
import { RoomProvider, useRoomContext } from "../context/RoomContext";
import { database } from "../lib/firebase";
import { isDesktop } from "../lib/runtime";
import { extractVideoId } from "../lib/roomUtils";
import useTheme from "../hooks/useTheme";
import VideoPlayer from "../components/VideoPlayer";
import BrowserPlayer from "../components/BrowserPlayer";
import Chat from "../components/Chat";
import UserList from "../components/UserList";
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

// ─── Sync Status Indicator ─────────────────────────────────────
const STATUS_LABELS = {
  idle: { label: "Idle", color: "bg-felt-gray" },
  playing: { label: "Synced", color: "bg-green-400" },
  paused: { label: "Paused", color: "bg-amber-400" },
};

function SyncStatus({ status }) {
  const s = STATUS_LABELS[status] || STATUS_LABELS.idle;
  return (
    <div className="flex items-center gap-1.5" title={`Status: ${s.label}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.color} transition-colors duration-[800ms]`} />
      <span className="text-[10px] text-felt-gray uppercase tracking-wider font-mono hidden sm:inline">
        {s.label}
      </span>
    </div>
  );
}

// ─── Share Popover — redesigned ────────────────────────────────
function SharePopover({ roomId, isOpen, onClose, anchorRef }) {
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, onClose, anchorRef]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const inviteLink = `${window.location.origin}/#/room/${roomId}`;
  const [copied, setCopied] = useState(null);

  const handleCopy = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute top-full right-0 mt-2 w-80 bg-inkstone border border-white/10 rounded-2xl p-5 shadow-2xl z-50 animate-fade-in"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-felt-gray shrink-0">
          <path d="M9 3.5C9 4.88071 7.88071 6 6.5 6C5.11929 6 4 4.88071 4 3.5C4 2.11929 5.11929 1 6.5 1C7.88071 1 9 2.11929 9 3.5Z" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M9 10.5C9 11.8807 7.88071 13 6.5 13C5.11929 13 4 11.8807 4 10.5C4 9.11929 5.11929 8 6.5 8C7.88071 8 9 9.11929 9 10.5Z" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M4.5 5L8.5 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          <path d="M4.5 9L8.5 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        <h4 className="text-[11px] font-medium text-paper uppercase tracking-[0.12em]">
          Invite Friends
        </h4>
      </div>

      {/* Invite Link */}
      <div className="mb-3">
        <p className="text-[10px] text-felt-gray mb-1.5 uppercase tracking-wider">Invite link</p>
        <button
          onClick={() => handleCopy(inviteLink, "link")}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-obsidian border border-white/10 rounded-xl hover:border-white/25 transition-all duration-[800ms] ease-patient group"
        >
          <span className="text-[11px] text-ash-mist truncate font-mono flex-1 text-left">
            {inviteLink}
          </span>
          <span className="text-[10px] text-felt-gray shrink-0 group-hover:text-paper transition-colors">
            {copied === "link" ? "Copied!" : "Copy"}
          </span>
        </button>
      </div>

      {/* Room Code */}
      <div>
        <p className="text-[10px] text-felt-gray mb-1.5 uppercase tracking-wider">Room code</p>
        <button
          onClick={() => handleCopy(roomId, "code")}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-obsidian border border-white/10 rounded-xl hover:border-white/25 transition-all duration-[800ms] ease-patient group"
        >
          <span className="text-[11px] text-ash-mist font-mono tracking-wider">{roomId}</span>
          <span className="text-[10px] text-felt-gray shrink-0 group-hover:text-paper transition-colors">
            {copied === "code" ? "Copied!" : "Copy"}
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── Add Video Modal — new ─────────────────────────────────────
function AddVideoModal({ isOpen, onClose, onAdd }) {
  const inputRef = useRef(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (isOpen) {
      setUrl("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const handleSubmit = () => {
    if (!url.trim()) return;
    onAdd(url.trim());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md mx-4 p-[34px] bg-inkstone border border-white/10 rounded-3xl animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-7 h-7 flex items-center justify-center text-felt-gray hover:text-paper transition-all duration-[800ms] ease-patient rounded-full hover:bg-paper/5"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        {/* Icon */}
        <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center mb-4">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-felt-gray">
            <rect x="2" y="4" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M8 8L13 10.5L8 13V8Z" fill="currentColor" opacity="0.6"/>
          </svg>
        </div>

        <h3 className="text-[18px] font-[400] text-paper mb-1">Add Video</h3>
        <p className="text-[13px] text-felt-gray mb-5">
          Paste a YouTube link to watch together.
        </p>

        {/* URL Input */}
        <div className="mb-4">
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full editorial-input text-sm"
          />
        </div>

        {/* CTA */}
        <button
          onClick={handleSubmit}
          disabled={!url.trim()}
          className="ghost-pill w-full"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Add to Watch Party
        </button>
      </div>
    </div>
  );
}

// ─── Video Queue Item ──────────────────────────────────────────
function QueueItem({ item, index, onPlayNext, onRemove, isNowPlaying }) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-[800ms] ease-patient group ${
        isNowPlaying
          ? "bg-paper/5"
          : "hover:bg-paper/[0.03]"
      }`}
    >
      {/* Thumbnail placeholder */}
      <div className="w-10 h-7 rounded-md bg-inkstone border border-white/5 shrink-0 flex items-center justify-center overflow-hidden">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-felt-gray">
            <rect x="1" y="2" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.1"/>
            <path d="M5 5L8 6.5L5 8V5Z" fill="currentColor" opacity="0.5"/>
          </svg>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-paper truncate font-[400]">
          {item.title || `Video ${index + 1}`}
        </p>
        {item.addedBy && (
          <p className="text-[10px] text-felt-gray truncate">
            Added by {item.addedBy}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-[800ms] ease-patient">
        {!isNowPlaying && (
          <button
            onClick={() => onPlayNext(index)}
            className="w-6 h-6 flex items-center justify-center text-felt-gray hover:text-paper transition-colors rounded-md hover:bg-paper/5"
            title="Play next"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 1L8 5L2 9V1Z" fill="currentColor"/>
            </svg>
          </button>
        )}
        <button
          onClick={() => onRemove(index)}
          className="w-6 h-6 flex items-center justify-center text-felt-gray hover:text-red-400 transition-colors rounded-md hover:bg-red-400/5"
          title="Remove"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Video Queue ───────────────────────────────────────────────
function VideoQueue({ queue, currentVideoId, onPlayNext, onRemove, onClear }) {
  const nowPlaying = queue.find((item) => item.id === currentVideoId);
  const upcoming = queue.filter((item) => item.id !== currentVideoId);

  if (queue.length === 0) return null;

  return (
    <div className="animate-slide-up">
      {/* Now Playing */}
      {nowPlaying && (
        <div className="mb-2">
          <p className="text-[10px] text-felt-gray uppercase tracking-[0.12em] mb-1.5 px-3">
            Now Playing
          </p>
          <QueueItem
            item={nowPlaying}
            index={queue.indexOf(nowPlaying)}
            onPlayNext={onPlayNext}
            onRemove={onRemove}
            isNowPlaying
          />
        </div>
      )}

      {/* Up Next */}
      {upcoming.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-3 mb-1.5">
            <p className="text-[10px] text-felt-gray uppercase tracking-[0.12em]">
              Up Next — {upcoming.length}
            </p>
            <button
              onClick={onClear}
              className="text-[10px] text-felt-gray hover:text-paper transition-colors uppercase tracking-wider"
            >
              Clear
            </button>
          </div>
          <div className="space-y-0.5">
            {upcoming.map((item, idx) => (
              <QueueItem
                key={item.id + idx}
                item={item}
                index={idx}
                onPlayNext={onPlayNext}
                onRemove={onRemove}
                isNowPlaying={false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Room Settings Menu — new ──────────────────────────────────
function RoomSettings({ isOpen, onClose, theme, toggleTheme, cinemaMode, onToggleCinema, anchorRef }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, onClose, anchorRef]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className="absolute top-full right-0 mt-2 w-64 bg-inkstone border border-white/10 rounded-2xl p-4 shadow-2xl z-50 animate-fade-in"
    >
      <h4 className="text-[10px] font-mono text-felt-gray uppercase tracking-[0.15em] mb-3">
        Room Settings
      </h4>

      <div className="space-y-2">
        {/* Theme */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-paper/5 transition-all duration-[800ms] ease-patient group"
        >
          <div className="flex items-center gap-2.5">
            {theme === "dark" ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-felt-gray">
                <path d="M7 1C3.68629 1 1 3.68629 1 7C1 10.3137 3.68629 13 7 13C8.5 13 10 12 11 10.5C9.5 11 7.5 11 6 9.5C4.5 8 4.5 5.5 5.5 4C6.5 2.5 7 1 7 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-felt-gray">
                <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M7 0.5V2.5M7 11.5V13.5M3 3L4.5 4.5M9.5 9.5L11 11M0.5 7H2.5M11.5 7H13.5M3 11L4.5 9.5M9.5 4.5L11 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            )}
            <span className="text-[12px] text-paper">Theme</span>
          </div>
          <span className="text-[10px] text-felt-gray uppercase tracking-wider">
            {theme === "dark" ? "Dark" : "Light"}
          </span>
        </button>

        {/* Cinema Mode */}
        <button
          onClick={onToggleCinema}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-paper/5 transition-all duration-[800ms] ease-patient group"
        >
          <div className="flex items-center gap-2.5">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-felt-gray">
              <rect x="1" y="3" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M4 6L7 8L10 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-[12px] text-paper">Cinema Mode</span>
          </div>
          <div className={`w-8 h-4 rounded-full transition-colors duration-[800ms] ease-patient ${
            cinemaMode ? "bg-paper/30" : "bg-white/10"
          }`}>
            <div className={`w-3.5 h-3.5 rounded-full bg-paper transition-transform duration-[800ms] ease-patient mt-[1px] ml-[1px] ${
              cinemaMode ? "translate-x-4" : ""
            }`} />
          </div>
        </button>

        {/* Separator */}
        <div className="border-t border-white/5 my-2" />

        {/* Player Type Info */}
        <div className="px-3 py-2">
          <p className="text-[10px] text-felt-gray uppercase tracking-wider mb-2">Player</p>
          <div className="flex gap-1.5">
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-paper/10 text-paper">YouTube</span>
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/5 text-felt-gray">Browser</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Empty Player State — redesigned ───────────────────────────
function EmptyPlayerState({ onAddVideo, onOpenBrowser }) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-0 select-none">
      <div className="flex flex-col items-center gap-6 animate-fade-in px-6 max-w-sm text-center">
        {/* Icon — film clapper / play icon */}
        <div className="w-[72px] h-[72px] rounded-full border border-white/8 flex items-center justify-center bg-paper/[0.02]">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-felt-gray">
            <rect x="4" y="8" width="24" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M4 14H28" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10 8L12 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M18 8L20 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M13 14L20 18.5L13 23V14Z" fill="currentColor" opacity="0.4"/>
          </svg>
        </div>

        {/* Text */}
        <div>
          <h2 className="text-[18px] font-[400] text-paper mb-1.5 tracking-tight">
            Nothing playing
          </h2>
          <p className="text-[13px] text-felt-gray leading-relaxed max-w-[260px] mx-auto">
            Start the watch party by adding a YouTube video.
          </p>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-2.5">
          <button
            onClick={onAddVideo}
            className="ghost-pill"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Add Video
          </button>

          <button
            onClick={onOpenBrowser}
            className="flex items-center gap-1.5 text-[11px] text-felt-gray hover:text-paper transition-all duration-[800ms] ease-patient"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M6 1.5V10.5M1.5 6H10.5" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
            Open In-App Browser
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Participants Button ───────────────────────────────────────
function ParticipantsButton({ count, isOpen, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[75px] border transition-all duration-[800ms] ease-patient text-[12px] ${
        isOpen
          ? "border-paper/40 text-paper bg-paper/5"
          : "border-white/10 text-felt-gray hover:text-paper hover:border-white/25"
      }`}
      title="Participants"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
        <path d="M5 8C6.65685 8 8 6.65685 8 5C8 3.34315 6.65685 2 5 2C3.34315 2 2 3.34315 2 5C2 6.65685 3.34315 8 5 8Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9.5 2.13C10.5101 2.45312 11.3236 3.18683 11.7405 4.14508C12.1574 5.10333 12.1408 6.19003 11.694 7.13505C11.2473 8.08006 10.4107 8.78953 9.39019 9.08293" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M1 12.5C1.66667 11.3333 3 10 7 10C11 10 12.3333 11.3333 13 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span>{count}</span>
    </button>
  );
}

// ─── Chat Button ───────────────────────────────────────────────
function ChatButton({ unread, isOpen, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[75px] border transition-all duration-[800ms] ease-patient text-[12px] ${
        isOpen
          ? "border-paper/40 text-paper bg-paper/5"
          : "border-white/10 text-felt-gray hover:text-paper hover:border-white/25"
      }`}
      title="Chat"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
        <path d="M12 7C12 9.76142 9.76142 12 7 12C6.21678 12 5.46972 11.8558 4.78207 11.5907L2 12.5L2.90926 9.71793C2.64419 9.03028 2.5 8.28322 2.5 7.5C2.5 4.73858 4.73858 2.5 7 2.5C9.26142 2.5 12 4.73858 12 7Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {unread > 0 && !isOpen && (
        <span className="w-1.5 h-1.5 rounded-full bg-paper" />
      )}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// ROOM CONTENT
// ═══════════════════════════════════════════════════════════════
function RoomContent() {
  const {
    user,
    displayName,
    authLoading,
    roomData,
    updateDisplayName,
    leaveRoom,
    deleteRoom,
  } = useRoomContext();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  // ─── State ──────────────────────────────────────────────────
  const [videoInput, setVideoInput] = useState("");
  const [extractedId, setExtractedId] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [debugOpen, setDebugOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [showTauriModal, setShowTauriModal] = useState(false);
  const [playerType, setPlayerType] = useState("youtube");

  // ─── New UI state ───────────────────────────────────────────
  const [activeSidebarTab, setActiveSidebarTab] = useState(null); // null | 'chat' | 'participants'
  const [showShare, setShowShare] = useState(false);
  const [showAddVideo, setShowAddVideo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [cinemaMode, setCinemaMode] = useState(false);
  const [cinemaControlsVisible, setCinemaControlsVisible] = useState(true);
  const shareButtonRef = useRef(null);
  const settingsButtonRef = useRef(null);
  const cinemaTimerRef = useRef(null);

  // ─── Video Queue ────────────────────────────────────────────
  const [queue, setQueue] = useState([]);

  // ─── Unread indicator ──────────────────────────────────────
  const [unreadCount, setUnreadCount] = useState(0);
  const prevMessagesLength = useRef(0);

  const { roomId } = useParams();
  const currentRoomId = roomId || "";

  // ─── Password gate for private rooms ───────────────────────
  const [passwordVerified, setPasswordVerified] = useState(() => {
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

  // ─── Player type listener ──────────────────────────────────
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

  // ─── Handle Add Video ──────────────────────────────────────
  const handleAddVideo = useCallback(
    (url) => {
      const videoId = extractVideoId(url);
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

      setVideoInput("");
    },
    [currentRoomId],
  );

  const handleSaveName = () => {
    if (nameInput.trim()) {
      updateDisplayName(nameInput.trim());
    }
    setEditingName(false);
  };

  // ─── Cinema Mode ───────────────────────────────────────────
  const toggleCinemaMode = useCallback(() => {
    setCinemaMode((prev) => !prev);
    if (!cinemaMode) {
      // Closing sidebar when entering cinema
      setActiveSidebarTab(null);
    }
  }, [cinemaMode]);

  // ─── Cinema controls auto-hide ─────────────────────────────
  useEffect(() => {
    if (!cinemaMode) {
      setCinemaControlsVisible(true);
      return;
    }

    const showControls = () => {
      setCinemaControlsVisible(true);
      clearTimeout(cinemaTimerRef.current);
      cinemaTimerRef.current = setTimeout(() => {
        setCinemaControlsVisible(false);
      }, 3000);
    };

    showControls();
    window.addEventListener("mousemove", showControls);
    window.addEventListener("mousedown", showControls);

    return () => {
      window.removeEventListener("mousemove", showControls);
      window.removeEventListener("mousedown", showControls);
      clearTimeout(cinemaTimerRef.current);
    };
  }, [cinemaMode]);

  // ─── Queue management ─────────────────────────────────────
  const addToQueue = useCallback(
    (url) => {
      const videoId = extractVideoId(url);
      if (!videoId) return;

      const newItem = {
        id: videoId,
        title: url.length > 50 ? url.substring(0, 50) + "..." : url,
        addedBy: displayName || "Someone",
        thumbnail: null,
      };

      setQueue((prev) => [...prev, newItem]);
    },
    [displayName],
  );

  const handlePlayNext = useCallback(
    (index) => {
      const item = queue[index];
      if (!item) return;

      const roomRef = ref(database, `rooms/${currentRoomId}`);
      update(roomRef, {
        currentVideoId: item.id,
        status: "idle",
        lastPosition: 0,
        updatedAt: serverTimestamp(),
      });

      setExtractedId(item.id);
    },
    [queue, currentRoomId],
  );

  const handleRemoveFromQueue = useCallback((index) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleClearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  // ─── When video is set via modal ───────────────────────────
  const handleAddVideoWithQueue = useCallback(
    (url) => {
      const videoId = extractVideoId(url);
      if (!videoId) return;

      // If nothing is playing, play immediately
      if (!roomData?.currentVideoId) {
        handleAddVideo(url);
      } else {
        // Add to queue
        addToQueue(url);
      }
    },
    [roomData?.currentVideoId, handleAddVideo, addToQueue],
  );

  // ─── Loading state ─────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-obsidian">
        <div className="flex flex-col items-center gap-6 animate-fade-in" style={{ animationDuration: "600ms" }}>
          <img
            src="/assets/logo.jpg"
            alt="WatchMe"
            className="h-[48px] sm:h-[56px] w-auto object-contain opacity-80"
            style={{ animation: "iridescent-shift 8s ease-in-out infinite" }}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="w-5 h-5 border border-white/20 border-t-white animate-spin rounded-none" />
            <span className="text-felt-gray text-[11px] uppercase tracking-[0.15em] font-[400]">
              Authenticating...
            </span>
          </div>
        </div>
      </div>
    );
  }

  const members = roomData?.members || {};
  const membersCount = Object.keys(members).length;
  const isHost = user && roomData?.hostId === user.uid;
  const hasVideo = !!roomData?.currentVideoId;

  // ─── Password gate for private rooms ──────────────────────
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
    <div className={`h-screen bg-obsidian text-paper flex flex-col font-roobert theme-transition ${
      cinemaMode ? "cinema-mode" : ""
    }`}>
      {/* ════════════════════════ HEADER ════════════════════════ */}
      <header className={`flex items-center justify-between px-4 sm:px-[34px] py-2.5 border-b border-white/5 bg-obsidian shrink-0 theme-transition ${
        cinemaMode ? "opacity-0 hover:opacity-100 transition-opacity duration-[800ms] ease-patient" : ""
      }`}>
        {/* Left: Brand + Room info */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img
            src="/assets/logo-mark.png"
            alt="WatchMe"
            className="h-[18px] sm:h-[20px] w-auto object-contain shrink-0"
          />
          <span className="text-sm font-medium text-paper tracking-tight">
            WatchMe
          </span>
          <span className="text-white/15 hidden sm:inline">·</span>
          <span className="text-[10px] font-mono px-2 py-1 bg-inkstone text-felt-gray uppercase tracking-wider shrink-0 border border-white/5 rounded-md">
            {currentRoomId}
          </span>
          <span className="text-[11px] text-felt-gray hidden sm:inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400/70 animate-pulse-dot" />
            {membersCount} {membersCount === 1 ? "watching" : "watching"}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Display name */}
          {user && (
            <div className="hidden sm:flex items-center mr-1">
              {editingName ? (
                <div className="flex items-center gap-1">
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                    onBlur={handleSaveName}
                    autoFocus
                    className="w-24 editorial-input text-[11px]"
                  />
                </div>
              ) : (
                <button
                  onClick={() => {
                    setNameInput(displayName);
                    setEditingName(true);
                  }}
                  title="Click to rename"
                  className="flex items-center gap-1 text-[11px] text-ash-mist hover:text-paper
                             border-b border-dashed border-white/15 hover:border-white/40
                             cursor-pointer transition-all duration-[800ms] ease-patient"
                >
                  {displayName}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-felt-gray/50 shrink-0">
                    <path d="M7.5 0.5L9.5 2.5L3.5 8.5L0.5 9.5L1.5 6.5L7.5 0.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Share */}
          <div className="relative">
            <button
              ref={shareButtonRef}
              onClick={() => setShowShare((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[75px] border border-white/10 text-felt-gray hover:text-paper hover:border-white/25 transition-all duration-[800ms] ease-patient text-[12px]"
              title="Share room"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                <path d="M9 3.5C9 4.88071 7.88071 6 6.5 6C5.11929 6 4 4.88071 4 3.5C4 2.11929 5.11929 1 6.5 1C7.88071 1 9 2.11929 9 3.5Z" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M9 10.5C9 11.8807 7.88071 13 6.5 13C5.11929 13 4 11.8807 4 10.5C4 9.11929 5.11929 8 6.5 8C7.88071 8 9 9.11929 9 10.5Z" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M4.5 5L8.5 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M4.5 9L8.5 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <span className="hidden sm:inline">Share</span>
            </button>
            <SharePopover
              roomId={currentRoomId}
              isOpen={showShare}
              onClose={() => setShowShare(false)}
              anchorRef={shareButtonRef}
            />
          </div>

          {/* Sync Status */}
          <div className="hidden sm:block">
            <SyncStatus status={roomData?.status} />
          </div>

          {/* Participants */}
          <ParticipantsButton
            count={membersCount}
            isOpen={activeSidebarTab === 'participants'}
            onClick={() =>
              setActiveSidebarTab((prev) =>
                prev === 'participants' ? null : 'participants'
              )
            }
          />

          {/* Chat */}
          <ChatButton
            isOpen={activeSidebarTab === 'chat'}
            onClick={() => {
              setActiveSidebarTab((prev) => {
                if (prev === 'chat') return null;
                setUnreadCount(0);
                return 'chat';
              });
            }}
            unread={unreadCount}
          />

          {/* Settings */}
          <div className="relative">
            <button
              ref={settingsButtonRef}
              onClick={() => setShowSettings((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[75px] border border-white/10 text-felt-gray hover:text-paper hover:border-white/25 transition-all duration-[800ms] ease-patient text-[12px]"
              title="Settings"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M7 0.5V2.5M7 11.5V13.5M3 3L4.5 4.5M9.5 9.5L11 11M0.5 7H2.5M11.5 7H13.5M3 11L4.5 9.5M9.5 4.5L11 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </button>
            <RoomSettings
              isOpen={showSettings}
              onClose={() => setShowSettings(false)}
              theme={theme}
              toggleTheme={toggleTheme}
              cinemaMode={cinemaMode}
              onToggleCinema={toggleCinemaMode}
              anchorRef={settingsButtonRef}
            />
          </div>

          {/* Host: Admin Panel */}
          {isHost && (
            <button
              onClick={() => setAdminOpen(true)}
              title="Admin Panel"
              className="text-felt-gray hover:text-paper transition-all duration-[800ms] ease-patient px-2 py-1.5 text-[12px] font-[400] hidden sm:block"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1L12 3.5V6.5C12 9.5 9.5 12 7 13C4.5 12 2 9.5 2 6.5V3.5L7 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                <path d="M5 7L6.5 8.5L9 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}

          {/* Delete Room (host only) */}
          {isHost && (
            <button
              onClick={async () => {
                const confirmed = window.confirm(
                  `Are you sure you want to permanently delete room "${currentRoomId}"?\n\nAll videos, messages, and user data will be lost.`,
                );
                if (!confirmed) return;
                await deleteRoom();
                navigate("/");
              }}
              title="Delete room"
              className="text-red-400/50 hover:text-red-400 transition-all duration-[800ms] ease-patient px-2 py-1.5 text-[12px] font-[400] hidden sm:block"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 3.5H12M5 3.5V2.5C5 1.5 5.5 1 6.5 1H7.5C8.5 1 9 1.5 9 2.5V3.5M10.5 5.5V11.5C10.5 12.5 10 13 9 13H5C4 13 3.5 12.5 3.5 11.5V5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}

          {/* Cinema Mode toggle */}
          <button
            onClick={toggleCinemaMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[75px] border transition-all duration-[800ms] ease-patient text-[12px] ${
              cinemaMode
                ? "border-paper/30 text-paper bg-paper/5"
                : "border-white/10 text-felt-gray hover:text-paper hover:border-white/25"
            }`}
            title={cinemaMode ? "Exit Cinema Mode" : "Cinema Mode"}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
              <rect x="1" y="3" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M4 6L7 8L10 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Leave */}
          <button
            onClick={() => {
              leaveRoom();
              navigate("/");
            }}
            title="Leave room"
            className="flex items-center gap-1 px-3 py-1.5 rounded-[75px] border border-white/10 text-felt-gray hover:text-paper hover:border-white/25 transition-all duration-[800ms] ease-patient text-[12px]"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6H9M9 6L6.5 3.5M9 6L6.5 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      {/* Admin Panel modal */}
      <AdminPanel isOpen={adminOpen} onClose={() => setAdminOpen(false)} />

      {/* Add Video Modal */}
      <AddVideoModal
        isOpen={showAddVideo}
        onClose={() => setShowAddVideo(false)}
        onAdd={handleAddVideoWithQueue}
      />

      {/* Tauri-only feature modal */}
      {showTauriModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80 animate-fade-in"
          onClick={() => setShowTauriModal(false)}
        >
          <div
            className="relative w-full max-w-md mx-4 p-[34px] bg-inkstone border border-white/10 rounded-3xl animate-fade-in-scale"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowTauriModal(false)}
              className="absolute top-5 right-5 w-6 h-6 flex items-center justify-center text-felt-gray hover:text-paper transition-all duration-[800ms] ease-patient"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            <h3 className="text-[11px] font-mono font-medium text-felt-gray uppercase tracking-[0.15em] mb-3">
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

      {/* ═════════════════════ MAIN LAYOUT ═════════════════════ */}
      <div className={`flex flex-1 overflow-hidden relative theme-transition ${
        cinemaMode ? "cinema-video-container" : ""
      }`}>
        {/* ──────── LEFT: VIDEO AREA ──────── */}
        <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${
          cinemaMode ? "" : ""
        }`}>
          {/* Player Type Toggle (compact) */}
          {!cinemaMode && (
            <div className="flex items-center gap-2 px-4 sm:px-[34px] pt-3 pb-2 cinema-controls">
              <button
                onClick={() => switchPlayerType("youtube")}
                className={`px-4 py-1.5 text-[11px] font-[400] rounded-[75px] border transition-all duration-[800ms] ease-patient ${
                  playerType === "youtube"
                    ? "bg-paper text-obsidian border-paper"
                    : "bg-transparent text-felt-gray border-white/20 hover:text-paper hover:border-white/40"
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
                className={`px-4 py-1.5 text-[11px] font-[400] rounded-[75px] border transition-all duration-[800ms] ease-patient ${
                  playerType === "browser"
                    ? "bg-paper text-obsidian border-paper"
                    : isDesktop()
                      ? "bg-transparent text-felt-gray border-white/20 hover:text-paper hover:border-white/40"
                      : "bg-transparent text-felt-gray/40 border-white/10 cursor-not-allowed"
                }`}
              >
                In-App Browser
              </button>
            </div>
          )}

          {/* ── Video / Player Area ── */}
          {playerType === "youtube" && (
            <div className={`flex-1 flex flex-col min-h-0 ${
              cinemaMode ? "px-0 pb-0" : "px-4 sm:px-[34px] pb-3"
            }`}>
              {hasVideo ? (
                /* Video is loaded — show player */
                <div className={`flex-1 w-full min-h-0 bg-black overflow-hidden mb-3 ${
                  cinemaMode ? "rounded-none" : "rounded-2xl"
                }`}>
                  <div className={`w-full h-full relative ${cinemaMode ? "" : "aspect-video"}`}>
                    <VideoPlayer roomId={currentRoomId} />
                  </div>
                </div>
              ) : (
                /* No video — show redesigned empty state */
                <div className="flex-1 flex flex-col min-h-0">
                  <EmptyPlayerState
                    onAddVideo={() => setShowAddVideo(true)}
                    onOpenBrowser={() => {
                      if (isDesktop()) {
                        switchPlayerType("browser");
                      } else {
                        setShowTauriModal(true);
                      }
                    }}
                  />
                </div>
              )}

              {/* ── Video Queue (below player) ── */}
              {!cinemaMode && hasVideo && (
                <div className="shrink-0 mb-2">
                  <VideoQueue
                    queue={queue}
                    currentVideoId={roomData?.currentVideoId}
                    onPlayNext={handlePlayNext}
                    onRemove={handleRemoveFromQueue}
                    onClear={handleClearQueue}
                  />
                </div>
              )}

              {/* ── Add Video Button (always visible) ── */}
              {!cinemaMode && (
                <div className="shrink-0 flex gap-2 items-center mb-3">
                  <button
                    onClick={() => setShowAddVideo(true)}
                    className="ghost-pill-sm"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                    Add Video
                  </button>

                  {/* Extracted ID badge (subtle) */}
                  {extractedId && (
                    <span className="text-[10px] text-felt-gray font-mono">
                      ID: <span className="text-ash-mist">{extractedId}</span>
                    </span>
                  )}
                </div>
              )}

              {/* ── Debug Panel ── */}
              {!cinemaMode && (
                <div className="shrink-0">
                  <button
                    onClick={() => setDebugOpen(!debugOpen)}
                    className="flex items-center gap-1.5 text-[10px] text-felt-gray hover:text-ash-mist
                               transition-colors duration-[800ms] ease-patient mb-2 uppercase tracking-wider"
                  >
                    <span className={`transition-transform duration-[800ms] ${debugOpen ? "rotate-90" : ""}`}>
                      ▶
                    </span>
                    Debug
                  </button>

                  {debugOpen && (
                    <div className="animate-fade-in mb-3">
                      <div className="flex flex-wrap gap-3 text-[11px] font-mono">
                        <span className="px-2.5 py-1.5 bg-inkstone text-felt-gray rounded-lg">
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
                        <span className="px-2.5 py-1.5 bg-inkstone text-felt-gray rounded-lg">
                          pos:{" "}
                          <strong className="text-ash-mist">
                            {typeof roomData?.lastPosition === "number"
                              ? `${roomData.lastPosition.toFixed(1)}s`
                              : "0s"}
                          </strong>
                        </span>
                        <span className="px-2.5 py-1.5 bg-inkstone text-felt-gray rounded-lg">
                          videoId:{" "}
                          <strong className="text-ash-mist">
                            {roomData?.currentVideoId || "—"}
                          </strong>
                        </span>
                        <span className="px-2.5 py-1.5 bg-inkstone text-felt-gray rounded-lg">
                          👥 {membersCount}
                        </span>
                      </div>

                      {membersCount > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {Object.entries(members).map(([uid, m]) => (
                            <span
                              key={uid}
                              className="px-2 py-1 bg-inkstone text-[10px] text-felt-gray rounded"
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
              )}
            </div>
          )}

          {/* ── Browser Player ── */}
          {playerType === "browser" && (
            <div className={`flex-1 flex flex-col min-h-0 ${
              cinemaMode ? "px-0 pb-0" : "px-4 sm:px-[34px] pb-3"
            }`}>
              <div className={`flex-1 w-full min-h-0 overflow-hidden mb-3 ${
                cinemaMode ? "rounded-none" : "rounded-2xl"
              }`}>
                <BrowserPlayer roomId={currentRoomId} />
              </div>
            </div>
          )}
        </div>

        {/* ──────── RIGHT SIDEBAR (tabs: chat | participants) ──────── */}
        {activeSidebarTab && !cinemaMode && (
          <>
            {/* Mobile overlay */}
            <div
              className="fixed inset-0 z-10 bg-obsidian/60 lg:hidden"
              onClick={() => setActiveSidebarTab(null)}
            />

            {/* Sidebar container — single fixed-width panel */}
            <div className="fixed lg:relative inset-y-0 right-0 z-20 w-[300px] lg:w-[350px] border-l border-white/8 bg-obsidian flex flex-col h-full shrink-0 theme-transition">
              {/* Header */}
              <div className="flex items-center justify-between px-[26px] py-3.5 border-b border-white/5 shrink-0">
                <h3 className="text-[11px] font-mono font-medium text-felt-gray uppercase tracking-[0.15em]">
                  {activeSidebarTab === 'participants' ? (
                    <>Participants — <span className="text-paper">{membersCount}</span></>
                  ) : (
                    'Chat'
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  {/* Tab switcher */}
                  <button
                    onClick={() =>
                      setActiveSidebarTab((prev) =>
                        prev === 'chat' ? 'participants' : 'chat'
                      )
                    }
                    className="text-[10px] text-felt-gray hover:text-paper transition-colors uppercase tracking-wider"
                  >
                    {activeSidebarTab === 'chat' ? 'People' : 'Chat'}
                  </button>
                  <button
                    onClick={() => setActiveSidebarTab(null)}
                    className="text-felt-gray hover:text-paper transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content — switches between chat and participants */}
              {activeSidebarTab === 'participants' ? (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {members && Object.keys(members).length > 0 ? (
                    <UserList />
                  ) : (
                    <div className="flex items-center justify-center h-full text-[13px] text-felt-gray">
                      No participants yet
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-hidden">
                  <Chat />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ════════════════════ CINEMA MODE EXIT OVERLAY ════════════════ */}
      {cinemaMode && (
        <div
          className={`fixed inset-0 z-30 bg-black/60 pointer-events-none transition-opacity duration-[800ms] ease-patient ${
            cinemaControlsVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <div
            className={`absolute top-4 left-1/2 -translate-x-1/2 pointer-events-auto transition-all duration-[800ms] ease-patient ${
              cinemaControlsVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
            }`}
          >
            <button
              onClick={toggleCinemaMode}
              className="flex items-center gap-2 px-4 py-2.5 rounded-[75px] bg-inkstone/90 border border-white/15 text-paper text-[12px] hover:bg-inkstone transition-all duration-[800ms] ease-patient backdrop-blur-sm"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="3" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M10 3V2C10 1.5 9.5 1 9 1H5C4.5 1 4 1.5 4 2V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Exit Cinema Mode
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ROOM WRAPPER
// ═══════════════════════════════════════════════════════════════
export default function Room() {
  const { roomId } = useParams();
  const currentRoomId = roomId || "";

  return (
    <RoomProvider roomId={currentRoomId}>
      <RoomContent />
    </RoomProvider>
  );
}
