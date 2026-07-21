import { useState, useEffect, useCallback } from "react";
import { ref, set, serverTimestamp } from "firebase/database";
import { database } from "../lib/firebase";
import { generateRoomId } from "../lib/roomUtils";

/**
 * CreateRoomModal — модальное окно создания комнаты с редизайном.
 *
 * Позволяет задать:
 *   - название комнаты (name)
 *   - видимость: публичная / приватная (isPublic)
 *   - пароль (только для приватных комнат)
 *
 * При создании записывает комнату в Firebase RTDB:
 *   rooms/{roomId} — полные данные комнаты
 *   publicRooms/{roomId} — индекс для отображения на главной
 */
export default function CreateRoomModal({ isOpen, onClose, onCreate }) {
  const [roomName, setRoomName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const reset = useCallback(() => {
    setRoomName("");
    setIsPublic(true);
    setPassword("");
    setCreating(false);
    setError("");
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // ─── Keyboard: Escape closes ─────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, handleClose]);

  const handleCreate = async () => {
    // Validation
    const trimmedName = roomName.trim();
    if (!trimmedName) {
      setError("Please enter a room name.");
      return;
    }
    if (trimmedName.length > 32) {
      setError("Room name must be 32 characters or fewer.");
      return;
    }
    if (!isPublic && !password.trim()) {
      setError("Please enter a password for the private room.");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const roomId = generateRoomId();
      const now = serverTimestamp();

      // Write room data
      const roomRef = ref(database, `rooms/${roomId}`);
      await set(roomRef, {
        hostId: null, // will be set by useRoom when host joins
        name: trimmedName,
        isPublic,
        password: isPublic ? null : password.trim(),
        currentVideoId: "",
        status: "idle",
        lastPosition: 0,
        memberCount: 0,
        createdAt: now,
      });

      // Write publicRooms index if public
      if (isPublic) {
        const publicRef = ref(database, `publicRooms/${roomId}`);
        await set(publicRef, {
          name: trimmedName,
          memberCount: 0,
          status: "idle",
          createdAt: now,
        });
      }

      reset();
      onCreate(roomId);
    } catch (err) {
      console.error("CreateRoomModal: failed to create room", err);
      setError("Failed to create room. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleCreate();
      }
    },
    [handleCreate],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80 backdrop-blur-sm animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-md mx-4 border border-white/15 p-[34px] bg-inkstone rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-5 right-5 w-6 h-6 flex items-center justify-center text-felt-gray hover:text-paper transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        {/* Header */}
        <h2 className="text-[11px] font-mono font-medium text-felt-gray uppercase tracking-[0.2em] mb-7">
          CREATE ROOM
        </h2>

        {/* Room Name */}
        <label className="block mb-6">
          <span className="text-[11px] text-felt-gray uppercase tracking-[0.15em] font-[400] block mb-2">
            Room Name
          </span>
          <input
            type="text"
            value={roomName}
            onChange={(e) => {
              setRoomName(e.target.value);
              if (error) setError("");
            }}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Movie Night"
            maxLength={32}
            className="editorial-input text-sm w-full"
            autoFocus
          />
        </label>

        {/* Visibility — segmented control */}
        <label className="block mb-6">
          <span className="text-[11px] text-felt-gray uppercase tracking-[0.15em] font-[400] block mb-3">
            Visibility
          </span>
          <div className="flex bg-inkstone border border-white/10 rounded-[75px] p-[3px]">
            <button
              onClick={() => { setIsPublic(true); if (error) setError(""); }}
              className={`flex-1 px-5 py-[9px] text-body-sm font-[400] rounded-[75px] transition-all
                duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] ${
                  isPublic
                    ? "bg-paper text-obsidian shadow-sm"
                    : "bg-transparent text-felt-gray hover:text-paper"
                }`}
            >
              Public
            </button>
            <button
              onClick={() => { setIsPublic(false); if (error) setError(""); }}
              className={`flex-1 px-5 py-[9px] text-body-sm font-[400] rounded-[75px] transition-all
                duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] ${
                  !isPublic
                    ? "bg-paper text-obsidian shadow-sm"
                    : "bg-transparent text-felt-gray hover:text-paper"
                }`}
            >
              Private
            </button>
          </div>
        </label>

        {/* Password (only for private rooms) — animated */}
        <div
          className={`overflow-hidden transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] ${
            !isPublic ? "max-h-32 opacity-100 mb-6" : "max-h-0 opacity-0 mb-0"
          }`}
        >
          <label className="block">
            <span className="text-[11px] text-felt-gray uppercase tracking-[0.15em] font-[400] block mb-2">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError("");
              }}
              onKeyDown={handleKeyDown}
              placeholder="Enter a room password..."
              className="editorial-input text-sm w-full"
              disabled={isPublic}
            />
          </label>
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-[11px] mb-4 animate-fade-in">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={handleClose}
            className="ghost-pill"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="ghost-pill"
          >
            {creating ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border border-white/30 border-t-white animate-spin rounded-full" />
                Creating...
              </span>
            ) : (
              "Create Room"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
