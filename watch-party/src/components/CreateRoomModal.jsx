import { useState } from "react";
import { ref, set, serverTimestamp } from "firebase/database";
import { database } from "../lib/firebase";
import { generateRoomId } from "../lib/roomUtils";

/**
 * CreateRoomModal — модальное окно создания комнаты.
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

  const reset = () => {
    setRoomName("");
    setIsPublic(true);
    setPassword("");
    setCreating(false);
    setError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80 animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-md mx-4 border border-white/15 p-[34px] bg-inkstone backdrop-blur-md rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-felt-gray hover:text-paper transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]"
        >
          ✕
        </button>

        {/* Title */}
        <h2 className="text-white text-[12px] font-semibold uppercase tracking-[0.2em] mb-6">
          Create Room
        </h2>

        {/* Room Name */}
        <label className="block mb-5">
          <span className="text-[11px] text-felt-gray uppercase tracking-[0.15em] font-[400] block mb-2">
            Room Name
          </span>
          <input
            type="text"
            value={roomName}
            onChange={(e) => {
              setRoomName(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="e.g. Movie Night"
            maxLength={32}
            className="editorial-input text-sm w-full"
            autoFocus
          />
        </label>

        {/* Visibility toggle */}
        <label className="block mb-5">
          <span className="text-[11px] text-felt-gray uppercase tracking-[0.15em] font-[400] block mb-2">
            Visibility
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => { setIsPublic(true); setError(""); }}
              className={`px-[20px] py-[9px] text-body-sm font-[400] rounded-[75px] border transition-all
                duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] ${
                  isPublic
                    ? "bg-paper text-obsidian border-paper"
                    : "bg-transparent text-felt-gray border-white/30 hover:text-paper hover:border-white/60"
                }`}
            >
              Public
            </button>
            <button
              onClick={() => { setIsPublic(false); setError(""); }}
              className={`px-[20px] py-[9px] text-body-sm font-[400] rounded-[75px] border transition-all
                duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] ${
                  !isPublic
                    ? "bg-paper text-obsidian border-paper"
                    : "bg-transparent text-felt-gray border-white/30 hover:text-paper hover:border-white/60"
                }`}
            >
              Private
            </button>
          </div>
        </label>

        {/* Password (only for private rooms) */}
        {!isPublic && (
          <label className="block mb-5 animate-fade-in">
            <span className="text-[11px] text-felt-gray uppercase tracking-[0.15em] font-[400] block mb-2">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Enter a room password..."
              className="editorial-input text-sm w-full"
            />
          </label>
        )}

        {/* Error */}
        {error && (
          <p className="text-red-400 text-[11px] mb-4 animate-fade-in">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 mt-6">
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
            {creating ? "Creating..." : "Create Room"}
          </button>
        </div>
      </div>
    </div>
  );
}
