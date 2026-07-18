import { useRef, useEffect } from "react";
import YouTube from "react-youtube";
import useVideoSync from "../hooks/useVideoSync";

/**
 * Опции плеера YouTube.
 * controls=1 — показываем стандартные контроллы (любой может управлять).
 * rel=0 — не показывать похожие видео в конце.
 * modestbranding=1 — минимальный логотип YouTube.
 */
const YT_OPTS = {
  height: "100%",
  width: "100%",
  playerVars: {
    autoplay: 0,       // автовоспроизведение запрещено — управляем сами
    controls: 1,       // контроллы доступны всем участникам
    rel: 0,
    modestbranding: 1,
    enablejsapi: 1,    // обязательно для программного управления
  },
};

/**
 * VideoPlayer — компонент-обёртка над YouTube плеером.
 *
 * ## Схема интеграции useVideoSync + react-youtube
 *
 * 1. Создаём playerRef (useRef), передаём его в useVideoSync.
 *    Пока плеер не загружен — playerRef.current === null,
 *    useVideoSync просто копит данные из Firebase в pendingSyncData.
 *
 * 2. YouTube компонент монтируется, загружает IFrame API.
 *    Когда плеер готов — вызывается onReady:
 *      - Сохраняем event.target (внутренний плеер) в playerRef.current
 *      - Вызываем handlePlayerReady()
 *        → useVideoSync устанавливает playerReady = true
 *        → применяет pendingSyncData (синхронизация опоздавших)
 *
 * 3. Пользователь нажимает Play/Pause:
 *      - YouTube IFrame API вызывает onStateChange
 *      - Вызываем handlePlayerStateChange(event)
 *      - useVideoSync проверяет Loop Guard (флаг не установлен — это UI-действие)
 *      - Пишет { status, lastPosition, updatedAt } в Firebase (updatePlayerState)
 *
 * 4. Другие участники получают изменения через onValue в Firebase:
 *      - useVideoSync вызывает applyRemoteSync(data)
 *      - Устанавливает Loop Guard (isApplyingRemoteUpdate = true)
 *      - Вызывает player.seekTo(), player.playVideo() / player.pauseVideo()
 *      - YouTube плеер генерирует onStateChange
 *      - handlePlayerStateChange видит Loop Guard → игнорирует событие
 *
 * 5. При смене videoId — YouTube компонент пересоздаётся (key={videoId}),
 *    что гарантирует чистый плеер для нового видео.
 *
 * @param {{ roomId: string }} props
 */
export default function VideoPlayer({ roomId }) {
  // Ref к внутреннему плееру YouTube (заполняется в onReady)
  const playerRef = useRef(null);

  // Хук синхронизации — вся магия здесь
  const {
    roomState,
    handlePlayerStateChange,
    handlePlayerReady,
    setRoomVideo,
  } = useVideoSync(roomId, playerRef);

  // ================================================================
  // Обработчик готовности плеера (react-youtube onReady)
  // event.target — это внутренний объект YT.Player
  // ================================================================
  const onReady = (event) => {
    // Сохраняем ссылку на внутренний плеер YouTube
    playerRef.current = event.target;

    // Уведомляем хук, что плеер готов к синхронизации
    handlePlayerReady();
  };

  // ================================================================
  // Обработчик изменения состояния плеера (react-youtube onStateChange)
  // event.data — числовой код состояния (YT.PlayerState)
  //
  // ВАЖНО: react-youtube также предоставляет onPlay и onPause как
  // отдельные пропсы, но мы используем onStateChange, чтобы
  // работать напрямую с handlePlayerStateChange из хука,
  // где уже реализован Loop Guard.
  // ================================================================
  const onStateChange = (event) => {
    handlePlayerStateChange(event);
  };

  // ================================================================
  // Если videoId не задан — показываем placeholder (растягивается flex-1)
  // ================================================================
  if (!roomState.currentVideoId) {
    return (
      <div
        style={{
          width: "100%",
          flex: 1,
          minHeight: 0,
          background: "#1a1a2e",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#888",
          fontSize: 18,
          borderRadius: 8,
        }}
      >
        🔗 Вставьте ссылку на YouTube видео, чтобы начать
      </div>
    );
  }

  return (
    <div style={{ width: "100%", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/*
       * key={roomState.currentVideoId} — принудительно пересоздаёт
       * компонент YouTube при смене видео, чтобы избежать проблем
       * с загрузкой нового ролика в том же плеере.
       */}
      <YouTube
        key={roomState.currentVideoId}
        videoId={roomState.currentVideoId}
        opts={YT_OPTS}
        onReady={onReady}
        onStateChange={onStateChange}
        style={{ borderRadius: 8, overflow: "hidden" }}
      />
    </div>
  );
}
