import { useState, useCallback, useEffect, useRef } from "react";
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

// ─── Share Popover ─────────────────────────────────────────────
function SharePopover({ roomId, isOpen, onClose, anchorRef }) {
  const popoverRef = useRef(null);

  // Close on click outside
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

  // Close on Escape
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
      // fallback
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
      className="absolute top-full right-0 mt-2 w-80 bg-inkstone border border-white/15 rounded-2xl p-4 shadow-xl z-50 animate-fade-in"
    >
      <h4 className="text-[10px] font-mono text-felt-gray uppercase tracking-[0.15em] mb-3">
        Share Room
      </h4>

      {/* Invite Link */}
      <div className="mb-3">
        <p className="text-[10px] text-felt-gray mb-1.5">Invite link</p>
        <button
          onClick={() => handleCopy(inviteLink, "link")}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-obsidian border border-white/10 rounded-xl hover:border-white/30 transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] group"
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
        <p className="text-[10px] text-felt-gray mb-1.5">Room code</p>
        <button
          onClick={() => handleCopy(roomId, "code")}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-obsidian border border-white/10 rounded-xl hover:border-white/30 transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] group"
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

// ─── Participants Button ───────────────────────────────────────
function ParticipantsButton({ count, isOpen, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[75px] border transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] text-[12px] ${
        isOpen
          ? "border-paper/40 text-paper bg-paper/5"
          : "border-white/15 text-felt-gray hover:text-paper hover:border-white/30"
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
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[75px] border transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] text-[12px] ${
        isOpen
          ? "border-paper/40 text-paper bg-paper/5"
          : "border-white/15 text-felt-gray hover:text-paper hover:border-white/30"
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

// ─── Empty Player State ────────────────────────────────────────
function EmptyPlayerState({ onShowInput, hasInput }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-obsidian min-h-0">
      <div className="flex flex-col items-center gap-5 animate-fade-in px-4">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M4 8L24 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-felt-gray"/>
            <path d="M4 14L24 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-felt-gray"/>
            <path d="M4 20L24 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-felt-gray"/>
          </svg>
        </div>

        {/* Text */}
        <div className="text-center">
          <h2 className="text-[16px] font-[400] text-paper mb-1.5">
            Nothing playing yet
          </h2>
          <p className="text-[13px] text-felt-gray leading-relaxed max-w-xs">
            Paste a YouTube link below to start watching together.
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={onShowInput}
          className="ghost-pill"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Add Video
        </button>
      </div>
    </div>
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

  // ─── State ──────────────────────────────────────────────────
  const [videoInput, setVideoInput] = useState("");
  const [extractedId, setExtractedId] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [debugOpen, setDebugOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [showTauriModal, setShowTauriModal] = useState(false);
  const [playerType, setPlayerType] = useState("youtube");

  // ─── Drawer states ─────────────────────────────────────────
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const shareButtonRef = useRef(null);

  // ─── Unread indicator ──────────────────────────────────────
  // We track if new messages arrive while chat is closed
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

  // ─── Handle room messages from context for unread count ────
  // We read messages indirectly through roomData changes
  // Actually we need to access messages from context, but we don't
  // destructure it above. Let's use a separate context call.
  // We'll use the Chat component's own unread tracking instead.

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

    // Clear input after setting
    setVideoInput("");
  }, [currentRoomId, videoInput]);

  const handleSaveName = () => {
    if (nameInput.trim()) {
      updateDisplayName(nameInput.trim());
    }
    setEditingName(false);
  };

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
    <div className="h-screen bg-obsidian text-paper flex flex-col font-roobert">
      {/* ════════════════════════ HEADER ════════════════════════ */}
      <header className="flex items-center justify-between px-4 sm:px-[34px] py-2.5 border-b border-white/5 bg-obsidian shrink-0">
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
          <span className="text-white/20 hidden sm:inline">·</span>
          <span className="text-sm text-ash-mist truncate max-w-[120px] sm:max-w-[200px] hidden sm:inline">
            {roomData?.name || "Loading..."}
          </span>
          <span className="text-[10px] font-mono px-2 py-1 bg-inkstone text-felt-gray uppercase tracking-wider shrink-0">
            {currentRoomId}
          </span>
          <span className="text-[11px] text-felt-gray hidden sm:inline">
            {membersCount} {membersCount === 1 ? "watching" : "watching"}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Display name */}
          {user && (
            <div className="flex items-center mr-1">
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
                             cursor-pointer transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]"
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[75px] border border-white/15 text-felt-gray hover:text-paper hover:border-white/30 transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] text-[12px]"
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
          <SyncStatus status={roomData?.status} />

          {/* Participants */}
          <ParticipantsButton
            count={membersCount}
            isOpen={showParticipants}
            onClick={() => {
              setShowParticipants((prev) => !prev);
              // Close chat if opening participants on mobile
            }}
          />

          {/* Chat */}
          <ChatButton
            isOpen={showChat}
            onClick={() => {
              setShowChat((prev) => !prev);
              if (!showChat) setUnreadCount(0);
            }}
            unread={unreadCount}
          />

          {/* Host actions */}
          {isHost && (
            <button
              onClick={() => setAdminOpen(true)}
              title="Admin Panel"
              className="text-felt-gray hover:text-paper transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] px-2 py-1.5 text-[12px] font-[400] hidden sm:block"
            >
              🛡️
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
              className="text-red-400/60 hover:text-red-400 transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] px-2 py-1.5 text-[12px] font-[400] hidden sm:block"
            >
              🗑️
            </button>
          )}

          {/* Leave */}
          <button
            onClick={() => {
              leaveRoom();
              navigate("/");
            }}
            title="Leave room"
            className="flex items-center gap-1 px-3 py-1.5 rounded-[75px] border border-white/15 text-felt-gray hover:text-paper hover:border-white/30 transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] text-[12px]"
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

      {/* Tauri-only feature modal (web version) */}
      {showTauriModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80 animate-fade-in"
          onClick={() => setShowTauriModal(false)}
        >
          <div
            className="relative w-full max-w-md mx-4 p-[34px] bg-inkstone border border-white/15 rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowTauriModal(false)}
              className="absolute top-5 right-5 w-6 h-6 flex items-center justify-center text-felt-gray hover:text-paper transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]"
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
      <div className="flex flex-1 overflow-hidden relative">
        {/* ──────── LEFT: VIDEO AREA ──────── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Player Type Toggle (compact) */}
          <div className="flex items-center gap-2 px-4 sm:px-[34px] pt-3 pb-2">
            <button
              onClick={() => switchPlayerType("youtube")}
              className={`px-4 py-1.5 text-[11px] font-[400] rounded-[75px] border transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] ${
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
              className={`px-4 py-1.5 text-[11px] font-[400] rounded-[75px] border transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] ${
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

          {/* ── YouTube Player ── */}
          {playerType === "youtube" && (
            <div className="flex-1 flex flex-col min-h-0 px-4 sm:px-[34px] pb-3">
              {hasVideo ? (
                /* Video is loaded — show player */
                <div className="flex-1 w-full min-h-0 bg-black rounded-2xl overflow-hidden mb-3">
                  <VideoPlayer roomId={currentRoomId} />
                </div>
              ) : (
                /* No video — show empty state */
                <div className="flex-1 flex flex-col min-h-0">
                  <EmptyPlayerState
                    onShowInput={() => document.getElementById("room-video-input")?.focus()}
                  />
                </div>
              )}

              {/* Video URL Input + Load (YouTube mode) */}
              <div className="flex gap-2 shrink-0">
                <input
                  id="room-video-input"
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
                <div className="text-[10px] text-felt-gray mt-2 font-mono">
                  ID: <span className="text-ash-mist">{extractedId}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Browser Player ── */}
          {playerType === "browser" && (
            <div className="flex-1 flex flex-col min-h-0 px-4 sm:px-[34px] pb-3">
              <div className="flex-1 w-full min-h-0 rounded-2xl overflow-hidden mb-3">
                <BrowserPlayer roomId={currentRoomId} />
              </div>
            </div>
          )}

          {/* Debug Panel (collapsible) */}
          <div className="px-4 sm:px-[34px] pb-4">
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

        {/* ──────── RIGHT DRAWERS ──────── */}
        {/* Overlay for mobile when drawer is open */}
        {(showParticipants || showChat) && (
          <div
            className="fixed inset-0 z-10 bg-obsidian/40 lg:hidden"
            onClick={() => {
              setShowParticipants(false);
              setShowChat(false);
            }}
          />
        )}

        {/* Participants Drawer */}
        <div
          className={`${
            showParticipants
              ? "translate-x-0 lg:relative"
              : "translate-x-full pointer-events-none lg:absolute"
          } fixed inset-y-0 right-0 z-20 lg:z-0 w-[300px] lg:w-[320px] border-l border-white/10 bg-obsidian flex flex-col shrink-0 transition-transform duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]`}
        >
          {showParticipants && (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between px-[26px] py-3 border-b border-white/5 shrink-0">
                <h3 className="text-[11px] font-mono font-medium text-felt-gray uppercase tracking-[0.15em]">
                  Participants — <span className="text-paper">{membersCount}</span>
                </h3>
                <button
                  onClick={() => setShowParticipants(false)}
                  className="text-felt-gray hover:text-paper transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              {/* List */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <UserList />
              </div>
            </div>
          )}
        </div>

        {/* Chat Drawer */}
        <div
          className={`${
            showChat
              ? "translate-x-0 lg:relative"
              : "translate-x-full pointer-events-none lg:absolute"
          } fixed inset-y-0 right-0 z-20 lg:z-0 w-[300px] lg:w-[340px] border-l border-white/10 bg-inkstone flex flex-col shrink-0 transition-transform duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]`}
        >
          {showChat && (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between px-[26px] py-3 border-b border-white/5 shrink-0">
                <h3 className="text-[11px] font-mono font-medium text-felt-gray uppercase tracking-[0.15em]">
                  Chat
                </h3>
                <button
                  onClick={() => setShowChat(false)}
                  className="text-felt-gray hover:text-paper transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              {/* Chat component */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <Chat />
              </div>
            </div>
          )}
        </div>
      </div>
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
