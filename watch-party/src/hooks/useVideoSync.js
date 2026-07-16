import { useEffect, useRef, useState, useCallback } from "react";
import { ref, onValue, update, serverTimestamp } from "firebase/database";
import { database, getRoomRef } from "../lib/firebase";

/**
 * Порог рассинхрона в секундах.
 * Если разница между актуальной позицией (рассчитанной через elapsed time)
 * и текущей позицией плеера превышает это значение — делаем seekTo().
 */
const SYNC_THRESHOLD_SEC = 1.5;

/**
 * Возможные статусы плеера YouTube IFrame API.
 * См. https://developers.google.com/youtube/iframe_api_reference#onStateChange
 */
const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
};

/**
 * useVideoSync — ключевой хук синхронизации YouTube Player через Firebase RTDB.
 *
 * ## Архитектура (Event-driven, без heartbeat)
 *
 * - **Любой участник** комнаты может управлять плеером (play/pause/seek).
 * - При локальном действии пользователя хук пишет { status, lastPosition, updatedAt }
 *   в Firebase RTDB. updatedAt — это firebase.database.ServerTimestamp, единый для всех.
 * - Все остальные участники подписаны на изменения через onValue.
 * - При получении события "playing" хост рассчитывает актуальную позицию:
 *     targetPosition = lastPosition + elapsedSeconds
 *   где elapsedSeconds = (серверное_сейчас - updatedAt) / 1000
 * - Если |targetPosition - player.getCurrentTime()| > SYNC_THRESHOLD → seekTo().
 * - При "paused" → player.pauseVideo() + seekTo(lastPosition).
 *
 * ## Обработка опоздавших участников
 *
 * onValue() в Firebase RTDB возвращает текущее состояние узла СРАЗУ при подписке,
 * до того как произойдут последующие изменения. Таким образом, любой участник,
 * вошедший в комнату, немедленно получает актуальные { status, lastPosition, updatedAt }
 * и синхронизируется. Никакого отдельного .once() не требуется.
 *
 * ## Loop Guard (защита от петель)
 *
 * Без loop guard программный вызов player.playVideo() (из-за remote-события) вызовет
 * onStateChange, который попытается отправить то же событие обратно в Firebase,
 * создавая бесконечный цикл.
 *
 * Решение: перед применением remote-изменений устанавливаем флаг
 * isApplyingRemoteUpdate в true. В handlePlayerStateChange проверяем этот флаг:
 * если true — игнорируем событие (оно вызвано нами же) и сбрасываем флаг.
 *
 * @param {string} roomId — ID комнаты в Firebase RTDB
 * @param {React.MutableRefObject} playerRef — React ref к объекту YouTube Player
 * @returns {{
 *   roomState: { currentVideoId: string, status: string, lastPosition: number, updatedAt: number, members: object },
 *   handlePlayerStateChange: (event: object) => void,
 *   handlePlayerReady: () => void,
 *   updatePlayerState: (status: string, position: number) => void,
 *   setRoomVideo: (videoId: string) => void,
 * }}
 */
export default function useVideoSync(roomId, playerRef) {
  // --- Состояние комнаты ---
  const [roomState, setRoomState] = useState({
    currentVideoId: "",    // текущий YouTube Video ID
    status: "idle",        // "playing" | "paused" | "idle"
    lastPosition: 0,       // время видео на момент последнего события (сек)
    updatedAt: 0,          // serverTimestamp последнего события (мс, unix)
    members: {},           // { uid: { name, joinedAt } }
    playerType: "youtube", // "youtube" | "browser"
  });

  // --- Loop Guard: флаг, блокирующий отправку событий от remote-синхронизации ---
  const isApplyingRemoteUpdate = useRef(false);

  // --- Смещение часов клиента относительно сервера Firebase ---
  const serverTimeOffset = useRef(0);

  // --- Флаг готовности плеера (YouTube IFrame API загружен и готов) ---
  const playerReady = useRef(false);

  // --- Храним последние данные из Firebase для отложенной синхронизации ---
  //    Нужно для случая: onValue пришёл до того, как плеер загрузился.
  //    Когда плеер станет готов, применим эти данные.
  const pendingSyncData = useRef(null);

  // ================================================================
  // 1. Получаем serverTimeOffset для точного расчёта elapsed time
  //    Подписываемся на .info/serverTimeOffset — Firebase сам публикует
  //    разницу между серверным и клиентским временем (в миллисекундах).
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
  // 2. Применяем remote-изменения к локальному плееру
  // ================================================================
  const applyRemoteSync = useCallback(
    (data) => {
      const { status, lastPosition, updatedAt } = data;

      // Если updatedAt нет — не можем рассчитать дельту
      if (!updatedAt) return;

      const player = playerRef.current;
      if (!player || !playerReady.current) return;

      // ---- Включаем Loop Guard ----
      // Все последующие программные вызовы плеера будут игнорироваться
      // в handlePlayerStateChange.
      isApplyingRemoteUpdate.current = true;

      if (status === "playing") {
        // === Расчёт актуальной позиции через elapsed time ===
        // updatedAt — серверное время (мс), когда было записано lastPosition
        // Серверное "сейчас" = Date.now() + serverTimeOffset
        const serverNowMs = Date.now() + serverTimeOffset.current;
        const elapsedSeconds = (serverNowMs - updatedAt) / 1000;
        const targetPosition = lastPosition + elapsedSeconds;

        // Проверяем, насколько сильно разошлись позиции
        const currentPosition = player.getCurrentTime();
        const delta = Math.abs(targetPosition - currentPosition);

        if (delta > SYNC_THRESHOLD_SEC) {
          player.seekTo(targetPosition);
        }

        // Запускаем видео, если оно ещё не играет
        if (player.getPlayerState() !== YT_STATE.PLAYING) {
          player.playVideo();
        }
      } else if (status === "paused") {
        // Ставим на паузу и корректируем позицию
        player.pauseVideo();

        const currentPosition = player.getCurrentTime();
        const delta = Math.abs(lastPosition - currentPosition);

        if (delta > SYNC_THRESHOLD_SEC) {
          player.seekTo(lastPosition);
        }
      }

      // Сбрасываем Loop Guard через requestAnimationFrame.
      // YouTube IFrame API вызывает onStateChange асинхронно (на следующем тике).
      // Если onStateChange сработает — он сам сбросит флаг (см. handlePlayerStateChange).
      // Если по какой-то причине onStateChange не вызовется — сбросим здесь.
      requestAnimationFrame(() => {
        if (isApplyingRemoteUpdate.current) {
          isApplyingRemoteUpdate.current = false;
        }
      });
    },
    [playerRef],
  );

  // ================================================================
  // 3. Подписка на изменения комнаты в Firebase RTDB
  //    onValue() сразу возвращает текущие данные при подписке,
  //    поэтому опоздавшие участники получают состояние мгновенно.
  // ================================================================
  useEffect(() => {
    const roomRef = getRoomRef(roomId);

    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();

      // Если комната ещё не создана — игнорируем
      if (!data) return;

      // Обновляем состояние комнаты для UI
      setRoomState({
        currentVideoId: data.currentVideoId || "",
        status: data.status || "idle",
        lastPosition: data.lastPosition || 0,
        updatedAt: data.updatedAt || 0,
        members: data.members || {},
        playerType: data.playerType || "youtube",
      });

      // Сохраняем данные для возможной отложенной синхронизации
      pendingSyncData.current = data;

      // Если плеер готов — синхронизируем сразу
      if (playerReady.current) {
        applyRemoteSync(data);
      }
      // Иначе данные будут применены, когда плеер станет готов
      // (см. handlePlayerReady)
    });

    return () => unsubscribe();
  }, [roomId, applyRemoteSync]);

  // ================================================================
  // 4. Обработчик событий YouTube Player (onStateChange)
  //    Вызывается плеером при каждом изменении состояния.
  // ================================================================
  const handlePlayerStateChange = useCallback(
    (event) => {
      // === Loop Guard ===
      // Если флаг установлен — это событие вызвано программным
      // управлением плеером из applyRemoteSync. Игнорируем его и
      // сбрасываем флаг, чтобы следующие (уже пользовательские)
      // события обрабатывались нормально.
      if (isApplyingRemoteUpdate.current) {
        isApplyingRemoteUpdate.current = false;
        return;
      }

      const player = playerRef.current;
      if (!player || !playerReady.current) return;

      const state = event.data;
      const currentTime = player.getCurrentTime();

      // Отправляем новое состояние в Firebase только для значимых событий
      switch (state) {
        case YT_STATE.PLAYING:
          updatePlayerStateRef.current("playing", currentTime);
          break;
        case YT_STATE.PAUSED:
          updatePlayerStateRef.current("paused", currentTime);
          break;
        // BUFFERING (3), CUED (5), ENDED (0) — игнорируем
        default:
          break;
      }
    },
    [playerRef],
  );

  // ================================================================
  // 5. Функция отправки локального события в Firebase
  //    Используем ref, чтобы избежать проблем с замыканиями.
  // ================================================================
  const updatePlayerStateRef = useRef(() => {});

  const updatePlayerState = useCallback((status, position) => {
    // Дополнительная страховка Loop Guard
    if (isApplyingRemoteUpdate.current) return;

    const roomRef = getRoomRef(roomId);
    update(roomRef, {
      status,
      lastPosition: position,
      updatedAt: serverTimestamp(),
    });
  }, [roomId]);

  // Синхронизируем ref и callback
  updatePlayerStateRef.current = updatePlayerState;

  // ================================================================
  // 6. Обработчик готовности плеера
  //    Вызывается из VideoPlayer, когда YouTube IFrame API
  //    загружен и player готов к работе.
  //
  //    Здесь же применяем отложенные данные: если onValue уже получил
  //    состояние комнаты до того, как плеер был готов, — применяем его.
  // ================================================================
  const handlePlayerReady = useCallback(() => {
    playerReady.current = true;

    // Применяем отложенные данные синхронизации (если есть)
    if (pendingSyncData.current) {
      applyRemoteSync(pendingSyncData.current);
    }
  }, [applyRemoteSync]);

  // ================================================================
  // 7. Функция смены видео в комнате
  //    Записывает новый videoId в Firebase и сбрасывает состояние.
  // ================================================================
  const setRoomVideo = useCallback((videoId) => {
    const roomRef = getRoomRef(roomId);
    update(roomRef, {
      currentVideoId: videoId,
      lastPosition: 0,
      status: "idle",
      updatedAt: serverTimestamp(),
    });
  }, [roomId]);

  return {
    roomState,
    handlePlayerStateChange,
    handlePlayerReady,
    updatePlayerState,
    setRoomVideo,
  };
}
