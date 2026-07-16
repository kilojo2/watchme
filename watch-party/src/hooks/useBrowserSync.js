import { useEffect, useRef, useState, useCallback } from "react";
import { ref, onValue, update, serverTimestamp } from "firebase/database";
import { database, getRoomRef } from "../lib/firebase";

/**
 * useBrowserSync — синхронизация HTML5 <video> через Tauri Event System.
 *
 * ## Отличие от useVideoSync (YouTube)
 *
 * YouTube IFrame API предоставляет getCurrentTime(), playVideo(), pauseVideo()
 * — всё управление идёт через JS API.
 *
 * Для встроенного браузера (child webview):
 * 1. <video> управляется нативно в дочернем webview
 * 2. Preload-скрипт шлёт события (browser-video-*) в главное окно
 * 3. Мы шлём remote-события (remote-*) обратно в дочерний webview
 * 4. Firebase остаётся единым источником истины
 *
 * ## Loop Guard
 *
 * Чтобы избежать цикла (remote-play → video.play() → play event → Firebase → remote-play),
 * preload-скрипт использует timestamp-based guard. На стороне этого хука мы
 * также игнорируем входящие Tauri-события, если они совпадают с только что
 * отправленными нами (по времени).
 *
 * @param {string} roomId — ID комнаты в Firebase RTDB
 * @returns {{
 *   roomState: object,          // текущее состояние комнаты из Firebase
 *   updatePlayerState: (status: string, position: number) => void,
 *   setRoomVideo: (videoId: string) => void,
 *   lastAppliedUpdate: number,  // timestamp последнего применённого remote-события (для loop guard)
 * }}
 */
export default function useBrowserSync(roomId) {
  // ── Состояние комнаты ────────────────────────────────────────
  const [roomState, setRoomState] = useState({
    currentVideoId: "",
    status: "idle",
    lastPosition: 0,
    updatedAt: 0,
    players: {},
  });

  // ── Loop Guard: когда мы отправили последний remote-сигнал ────
  const lastSentTimestamp = useRef(0);

  // ── Смещение часов клиента относительно сервера ──────────────
  const serverTimeOffset = useRef(0);

  // ================================================================
  // 1. Получаем serverTimeOffset для точного расчёта elapsed time
  // ================================================================
  useEffect(() => {
    const offsetRef = ref(database, ".info/serverTimeOffset");

    const unsubscribe = onValue(offsetRef, (snapshot) => {
      const offset = snapshot.val();
      if (typeof offset === "number") {
        serverTimeOffset.current = offset;
      }
    });

    return () => unsubscribe();
  }, []);

  // ================================================================
  // 2. Подписка на изменения комнаты в Firebase RTDB
  // ================================================================
  useEffect(() => {
    if (!roomId) return;
    const roomRef = getRoomRef(roomId);

    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      setRoomState({
        currentVideoId: data.currentVideoId || "",
        status: data.status || "idle",
        lastPosition: data.lastPosition || 0,
        updatedAt: data.updatedAt || 0,
        players: data.players || {},
        playerType: data.playerType || "youtube",
      });
    });

    return () => unsubscribe();
  }, [roomId]);

  // ================================================================
  // 3. Функция отправки локального события в Firebase
  // ================================================================
  const updatePlayerState = useCallback(
    (status, position) => {
      if (!roomId) return;

      const roomRef = getRoomRef(roomId);
      update(roomRef, {
        status,
        lastPosition: position,
        updatedAt: serverTimestamp(),
      });

      // Запоминаем, когда мы отправили это событие (для loop guard)
      lastSentTimestamp.current = Date.now();
    },
    [roomId],
  );

  // ================================================================
  // 4. Функция смены "видео" (URL) в комнате
  // ================================================================
  const setRoomVideo = useCallback(
    (url) => {
      if (!roomId) return;

      const roomRef = getRoomRef(roomId);
      update(roomRef, {
        currentVideoId: url,
        lastPosition: 0,
        status: "idle",
        updatedAt: serverTimestamp(),
      });
    },
    [roomId],
  );

  // ================================================================
  // 5. Функция смены типа плеера (youtube / browser)
  // ================================================================
  const setPlayerType = useCallback(
    (playerType) => {
      if (!roomId) return;

      const roomRef = getRoomRef(roomId);
      update(roomRef, {
        playerType,
        // При переключении сбрасываем статус
        status: "idle",
        lastPosition: 0,
        updatedAt: serverTimestamp(),
      });
    },
    [roomId],
  );

  return {
    roomState,
    updatePlayerState,
    setRoomVideo,
    setPlayerType,
    lastSentTimestamp,
  };
}
