import { useState } from "react";

/**
 * PasswordGate — экран ввода пароля для приватных комнат.
 *
 * Props:
 *   roomId    — ID комнаты (для sessionStorage ключа)
 *   roomName  — название комнаты для отображения
 *   password  — правильный пароль (сравнение на клиенте)
 *   onVerified — callback после успешного ввода пароля
 */
export default function PasswordGate({ roomId, roomName, password, onVerified }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = () => {
    if (input === password) {
      onVerified();
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen bg-obsidian flex items-center justify-center font-roobert">
      <div className="border border-white/15 p-[34px] bg-black/10 backdrop-blur-md rounded-3xl flex flex-col gap-6 max-w-md w-full mx-4 animate-fade-in">
        {/* Lock icon */}
        <div className="text-center">
          <span className="text-3xl">🔒</span>
        </div>

        <h2 className="text-white text-[12px] font-semibold uppercase tracking-[0.2em] text-center">
          Private Room
        </h2>

        <p className="text-body-sm text-white/70 leading-[1.15] font-[400] text-center">
          &ldquo;{roomName}&rdquo; requires a password to join.
        </p>

        <input
          type="password"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (error) setError(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Enter password..."
          className={`editorial-input text-sm w-full ${
            error ? "border-red-500/70" : ""
          }`}
          autoFocus
        />

        <button
          onClick={handleSubmit}
          className="ghost-pill self-start"
        >
          Join Room
        </button>

        {error && (
          <p className="text-red-400 text-[11px] animate-fade-in">
            Incorrect password. Please try again.
          </p>
        )}
      </div>
    </div>
  );
}
