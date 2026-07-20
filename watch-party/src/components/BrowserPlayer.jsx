import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import useBrowserSync from "../hooks/useBrowserSync";

/**
 * Загружаем preload-скрипт как строку (raw import Vite).
 * Injecting via executeJavaScript() on dom-ready avoids preload path issues.
 */
// @ts-ignore — Vite raw import
import BROWSER_PRELOAD from "../../electron/browser-preload.js?raw";
// @ts-ignore — Vite raw import
import VIDEO_SNIFFER from "../../electron/video-sniffer.js?raw";

/**
 * BrowserPlayer — компонент встроенного браузера (Electron <webview>).
 *
 * ## Архитектура
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │                   BrowserPlayer (Electron)                    │
 * │  ┌─── Address Bar ───────────────────────────────────────┐   │
 * │  │ https://example.com/movie              [Go] [🔄]      │   │
 * │  └───────────────────────────────────────────────────────┘   │
 * │  ┌─── Toolbar ───────────────────────────────────────────┐   │
 * │  │ [🔍 Sync Player]  [📋 Show Frames]                    │   │
 * │  └───────────────────────────────────────────────────────┘   │
 * │  ┌─── <webview> (Electron In-App Browser) ───────────────┐   │
 * │  │  Загружает внешний сайт; preload-скрипт              │   │
 * │  │  сканирует top-level + все iframe на                  │   │
 * │  │  наличие <video> (даже кросс-доменные)               │   │
 * │  └───────────────────────────────────────────────────────┘   │
 * │                                                              │
 * │  [📺 Video detected] — [3 frames found] — status line       │
 * └──────────────────────────────────────────────────────────────┘
 *
 * ## Cross-frame scanning
 * С флагом disablewebsecurity на <webview> отключается Same-Origin Policy,
 * что позволяет из top-frame скрипта получать доступ к contentDocument
 * любого iframe.
 *
 * ## Preload-скрипт
 * В отличие от Tauri (initialization_script), Electron <webview> injects
 * preload-скрипт через атрибут preload (file:// URL). Мы используем
 * executeJavaScript() на dom-ready, что равнозначно.
 *
 * @param {{ roomId: string }} props
 */
export default function BrowserPlayer({ roomId }) {
  // ── Refs ────────────────────────────────────────────────────
  const webviewRef = useRef(null);
  const currentUrlRef = useRef("");
  const roomStateRef = useRef(null);
  const pollTimerRef = useRef(null);

  // ── State ───────────────────────────────────────────────────
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [videoFound, setVideoFound] = useState(false);
  const [playerInfo, setPlayerInfo] = useState("");
  const [frames, setFrames] = useState([]);
  const [showFrames, setShowFrames] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);

  // ── Sniffed video URLs ──────────────────────────────────────
  const [sniffedUrls, setSniffedUrls] = useState([]);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState("");
  const [isVideoMode, setIsVideoMode] = useState(false);

  // ── Firebase sync hook ──────────────────────────────────────
  const { roomState, updatePlayerState, setRoomVideo, lastSentTimestamp } =
    useBrowserSync(roomId);

  roomStateRef.current = roomState;

  // Ref for updatePlayerState to avoid stale closures in event handlers
  const updatePlayerStateRef = useRef(updatePlayerState);
  updatePlayerStateRef.current = updatePlayerState;

  // ── Video element refs (for HLS.js playback) ────────────────
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  // ================================================================
  // 1. Управление <webview> (навигация)
  // ================================================================
  const navigateTo = useCallback((targetUrl) => {
    currentUrlRef.current = targetUrl;
    setUrl(targetUrl);
    // <webview> автоматически загрузится при изменении src
  }, []);

  const handleGo = useCallback(() => {
    let targetUrl = url.trim();
    if (!targetUrl) return;

    // Добавляем https:// если нет протокола
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = "https://" + targetUrl;
    }

    currentUrlRef.current = targetUrl;
    setRoomVideo(targetUrl);
  }, [url, setRoomVideo]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") handleGo();
    },
    [handleGo],
  );

  // ================================================================
  // 2. Навигация: Назад / Вперёд / Обновить
  // ================================================================
  const handleGoBack = useCallback(() => {
    webviewRef.current?.goBack();
  }, []);

  const handleGoForward = useCallback(() => {
    webviewRef.current?.goForward();
  }, []);

  const handleRefresh = useCallback(() => {
    webviewRef.current?.reload();
  }, []);

  // ================================================================
  // 3. Подписка на события <webview>
  // ================================================================
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    let loadingTimeout = null;

    const onStartLoading = () => {
      setIsLoading(true);
      setShowLoadingOverlay(true);
      clearTimeout(loadingTimeout);
      loadingTimeout = setTimeout(() => {
        setShowLoadingOverlay(false);
      }, 3000);
    };

    const onStopLoading = () => {
      setIsLoading(false);
      setShowLoadingOverlay(false);
      clearTimeout(loadingTimeout);
    };

    const onDidNavigate = (e) => {
      currentUrlRef.current = e.url;
      setUrl(e.url);
      console.log("[BrowserPlayer] Navigated to:", e.url);
    };

    const onPageTitleUpdated = (e) => {
      console.log("[BrowserPlayer] Title:", e.title);
    };

    const onDomReady = () => {
      console.log("[BrowserPlayer] <webview> DOM ready — injecting preload + sniffer");
      // Inject preload script (video/frame scanner) on every dom-ready
      try {
        wv.executeJavaScript(BROWSER_PRELOAD).catch((err) => {
          console.warn("[BrowserPlayer] Preload injection failed:", err);
        });
      } catch (e) {
        console.warn("[BrowserPlayer] Preload injection error:", e);
      }
      // Inject video sniffer — attaches play/pause/seeked listeners
      // and sends real-time events via console.log
      try {
        wv.executeJavaScript(VIDEO_SNIFFER).catch((err) => {
          console.warn("[BrowserPlayer] Sniffer injection failed:", err);
        });
      } catch (e) {
        console.warn("[BrowserPlayer] Sniffer injection error:", e);
      }
    };
    const onConsoleMessage = (e) => {
      const msg = e.message;
      const level = e.level;

      // ── Parse video-sniffer JSON events ──────────────────
      try {
        const parsed = JSON.parse(msg);
        if (parsed.source === "watchme-sniffer") {
          const status = parsed.event === "play" ? "playing" : "paused";
          // Use ref to avoid stale closure issues
          updatePlayerStateRef.current(status, parsed.time);
          return;
        }
      } catch (_) {
        // not JSON — fall through to normal log handling
      }

      // ── BrowserPreload logs ───────────────────────────────
      if (msg.includes("[BrowserPreload]")) {
        const entry = {
          level: level === 2 ? "error" : level === 1 ? "warn" : "info",
          msg: msg,
          time: new Date().toLocaleTimeString(),
        };
        setLogs((prev) => [entry, ...prev].slice(0, 50));
      }
    };


    wv.addEventListener("did-start-loading", onStartLoading);
    wv.addEventListener("did-stop-loading", onStopLoading);
    wv.addEventListener("did-navigate", onDidNavigate);
    wv.addEventListener("did-navigate-in-page", onDidNavigate);
    wv.addEventListener("page-title-updated", onPageTitleUpdated);
    wv.addEventListener("dom-ready", onDomReady);
    wv.addEventListener("console-message", onConsoleMessage);

    return () => {
      wv.removeEventListener("did-start-loading", onStartLoading);
      wv.removeEventListener("did-stop-loading", onStopLoading);
      wv.removeEventListener("did-navigate", onDidNavigate);
      wv.removeEventListener("did-navigate-in-page", onDidNavigate);
      wv.removeEventListener("page-title-updated", onPageTitleUpdated);
      wv.removeEventListener("dom-ready", onDomReady);
      wv.removeEventListener("console-message", onConsoleMessage);
      clearTimeout(loadingTimeout);
    };
  }, []);

  // ================================================================
  // 4. Поллинг: читаем __browserData из <webview> (URLs + frames only)
  //    Видео-события теперь приходят через sniffer → console-message.
  // ================================================================
  useEffect(() => {
    const pollInterval = setInterval(() => {
      const wv = webviewRef.current;
      if (!wv) return;

      wv.executeJavaScript(`
        (function() {
          var d = window.__browserData;
          if (!d) return JSON.stringify({ alive: false });
          return JSON.stringify({
            alive: true,
            initDone: d.initDone,
            video: d.video,
            frameCount: d.frameCount,
            title: d.title,
            corsBlocked: d.corsBlocked,
            iframeAccess: d.iframeAccess ? d.iframeAccess.slice(0, 10) : [],
            videoUrls: d.videoUrls ? d.videoUrls.slice(0, 20) : [],
          });
        })();
      `).then((result) => {
        try {
          const data = JSON.parse(result);
          if (!data.alive) return;

          // ── Video detection (indicator only — sync is via sniffer) ──
          if (data.video && data.video.found) {
            setVideoFound(true);
            setPlayerInfo("📺 Video detected & synced");
          }

          // ── Frame info ──
          if (data.iframeAccess && data.iframeAccess.length > 0) {
            setFrames(data.iframeAccess);
          }

          // ── Sniffed video URLs ──
          if (data.videoUrls && data.videoUrls.length > 0) {
            setSniffedUrls((prev) => {
              const existing = new Set(prev.map((u) => u.url));
              const newUrls = data.videoUrls.filter((url) => !existing.has(url));
              if (newUrls.length === 0) return prev;
              return [
                ...prev,
                ...newUrls.map((url) => ({
                  url,
                  time: new Date().toLocaleTimeString(),
                })),
              ];
            });
          }

          // ── CORS diagnostic ──
          if (data.corsBlocked) {
            console.warn("[BrowserPlayer] ⚠️ CORS blocking detected in webview!");
          }
        } catch (e) {
          // ignore parse errors
        }
      }).catch(() => {
        // webview may not be ready yet
      });
    }, 1500);

    pollTimerRef.current = pollInterval;

    return () => {
      clearInterval(pollInterval);
    };
  }, []); // Empty deps — sniffer handles real-time sync via console-message

  // ================================================================
  // 5. Реагируем на изменение currentVideoId из Firebase
  // ================================================================
  useEffect(() => {
    const fbUrl = roomState.currentVideoId;
    if (!fbUrl) return;
    if (fbUrl === currentUrlRef.current) return;

    currentUrlRef.current = fbUrl;
    setUrl(fbUrl);

    // Проверяем, является ли URL прямым видео-потоком
    const isStreamUrl = /\.(m3u8|mp4|webm)(\?|#|$)/i.test(fbUrl) ||
                        fbUrl.includes("videoplayback") ||
                        fbUrl.includes("/hls/") ||
                        fbUrl.includes("/manifest/");

    if (isStreamUrl) {
      setSelectedVideoUrl(fbUrl);
      setIsVideoMode(true);
      setPlayerInfo("🎬 Starting stream playback...");
    }
    // Для обычных URL <webview> загрузится автоматически
    // через изменение src
  }, [roomState.currentVideoId]);

  // ================================================================
  // 6. Отложенная повторная синхронизация
  // ================================================================
  useEffect(() => {
    if (!roomState.currentVideoId) return;

    const timer = setTimeout(() => {
      const { status, lastPosition } = roomStateRef.current;
      const wv = webviewRef.current;
      if (!wv) return;

      if (status === "playing") {
        wv.executeJavaScript(
          "window.__WATCHME_PLAYER?.play()"
        ).catch(() => {});
        if (lastPosition > 0) {
          wv.executeJavaScript(
            "if(window.__WATCHME_PLAYER)window.__WATCHME_PLAYER.currentTime=" + lastPosition
          ).catch(() => {});
        }
      } else if (status === "paused") {
        wv.executeJavaScript(
          "window.__WATCHME_PLAYER?.pause()"
        ).catch(() => {});
        if (lastPosition > 0) {
          wv.executeJavaScript(
            "if(window.__WATCHME_PLAYER)window.__WATCHME_PLAYER.currentTime=" + lastPosition
          ).catch(() => {});
        }
      }
    }, 2000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomState.currentVideoId]);

  // ================================================================
  // 7. Sync Player — ручная синхронизация
  // ================================================================
  const handleSyncPlayer = useCallback(() => {
    setPlayerInfo("🔄 Re-scanning for video...");
    const wv = webviewRef.current;
    if (!wv) return;
    wv.executeJavaScript(
      "if(window.__WATCHME_PLAYER){" +
      "  window.__WATCHME_PLAYER.dispatchEvent(new Event('play'));" +
      "  window.__WATCHME_PLAYER.dispatchEvent(new Event('pause'));" +
      "} void 0;"
    ).catch(() => {});
  }, []);

  // ================================================================
  // 8. Show/Hide Frames
  // ================================================================
  const toggleFrames = useCallback(() => {
    setShowFrames((prev) => !prev);
  }, []);

  // ================================================================
  // 9. Выбор sniffed video URL
  // ================================================================
  const handleSelectVideoUrl = useCallback(
    (videoUrl) => {
      console.log("[BrowserPlayer] 🎬 Selected video URL:", videoUrl);
      setSelectedVideoUrl(videoUrl);
      setIsVideoMode(true);
      setPlayerInfo("🎬 Starting stream playback...");
      setRoomVideo(videoUrl);
    },
    [setRoomVideo],
  );

  // ================================================================
  // 10. Возврат к режиму браузера
  // ================================================================
  const handleBackToBrowsing = useCallback(() => {
    setIsVideoMode(false);
    setSelectedVideoUrl("");
    setPlayerInfo("");

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
  }, []);

  // ================================================================
  // 11. Инициализация HLS.js / video при выборе URL
  // ================================================================
  useEffect(() => {
    if (!selectedVideoUrl || !videoRef.current) return;

    const video = videoRef.current;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHls = selectedVideoUrl.includes(".m3u8");

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hls.loadSource(selectedVideoUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch((err) => {
          console.warn("[BrowserPlayer] Autoplay blocked:", err);
        });
      });
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.warn("[BrowserPlayer] HLS error:", data.type, data.details);
      });
      hlsRef.current = hls;
      setPlayerInfo("🎬 Loading HLS stream...");
    } else if (!isHls) {
      video.src = selectedVideoUrl;
      video.load();
      video.play().catch((err) => {
        console.warn("[BrowserPlayer] Autoplay blocked:", err);
      });
      setPlayerInfo("🎬 Loading direct video...");
    } else {
      console.warn("[BrowserPlayer] HLS not supported, falling back to direct src");
      video.src = selectedVideoUrl;
      video.load();
    }
  }, [selectedVideoUrl]);

  // ================================================================
  // 12. Синхронизация <video> событий с Firebase
  // ================================================================
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideoMode) return;

    let guardTimer = 0;

    const onPlay = () => {
      if (Date.now() - guardTimer < 300) return;
      guardTimer = Date.now();
      updatePlayerState("playing", video.currentTime);
    };

    const onPause = () => {
      if (Date.now() - guardTimer < 300) return;
      guardTimer = Date.now();
      updatePlayerState("paused", video.currentTime);
    };

    const onTimeUpdate = () => {
      if (video.paused) return;
      if (Date.now() - guardTimer < 2000) return;
      guardTimer = Date.now();
      updatePlayerState("playing", video.currentTime);
    };

    const onSeeked = () => {
      if (Date.now() - guardTimer < 300) return;
      guardTimer = Date.now();
      const status = video.paused ? "paused" : "playing";
      updatePlayerState(status, video.currentTime);
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeked", onSeeked);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("seeked", onSeeked);
    };
  }, [isVideoMode, updatePlayerState]);

  // ================================================================
  // 13. Обработка remote-команд (из Firebase) для video/webview
  // ================================================================
  useEffect(() => {
    const { status, lastPosition } = roomState;

    if (Date.now() - lastSentTimestamp.current < 500) return;

    if (!isVideoMode) {
      const wv = webviewRef.current;
      if (!wv) return;

      if (status === "playing") {
        wv.executeJavaScript(
          "window.__WATCHME_PLAYER?.play()"
        ).catch(() => {});
        if (lastPosition > 0) {
          wv.executeJavaScript(
            "if(window.__WATCHME_PLAYER)window.__WATCHME_PLAYER.currentTime=" + lastPosition
          ).catch(() => {});
        }
      } else if (status === "paused") {
        wv.executeJavaScript(
          "window.__WATCHME_PLAYER?.pause()"
        ).catch(() => {});
        if (lastPosition > 0) {
          wv.executeJavaScript(
            "if(window.__WATCHME_PLAYER)window.__WATCHME_PLAYER.currentTime=" + lastPosition
          ).catch(() => {});
        }
      }
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    if (status === "playing") {
      if (lastPosition > 0 && Math.abs(video.currentTime - lastPosition) > 2) {
        video.currentTime = lastPosition;
      }
      video.play().catch((err) => {
        console.warn("[BrowserPlayer] Remote play failed:", err);
      });
    } else if (status === "paused") {
      video.pause();
      if (lastPosition > 0 && Math.abs(video.currentTime - lastPosition) > 2) {
        video.currentTime = lastPosition;
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomState.status, roomState.lastPosition, isVideoMode, lastSentTimestamp]);

  // ================================================================
  // Render
  // ================================================================
  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* ── Address Bar (Nav buttons + URL input + Go) ───────── */}
      <div className="flex items-center gap-1.5 mb-2 shrink-0">
        {/* Back / Forward / Refresh */}
        <div className="flex items-center gap-0.5 shrink-0 bg-zinc-900 rounded-xl border border-zinc-800 px-1 py-1">
          <button
            onClick={handleGoBack}
            title="Back"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800
                       transition-all duration-150"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={handleGoForward}
            title="Forward"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800
                       transition-all duration-150"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={handleRefresh}
            title="Refresh"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800
                       transition-all duration-150"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* URL Input */}
        <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-zinc-900 rounded-xl border border-zinc-800 focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-500/50 transition-all duration-200">
          <svg
            className="w-4 h-4 shrink-0 text-zinc-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter movie URL (e.g. https://example.com/movie)..."
            className="flex-1 bg-transparent text-zinc-200 text-sm outline-none placeholder:text-zinc-600"
          />
        </div>

        <button
          onClick={handleGo}
          disabled={isLoading || !url.trim()}
          className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium
                     hover:bg-indigo-500 active:bg-indigo-700
                     disabled:opacity-40 disabled:cursor-not-allowed
                     transition-all duration-200 shrink-0 flex items-center gap-1.5"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Loading
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
              Go
            </>
          )}
        </button>
      </div>

      {/* ── Toolbar (Sync Player + Show Frames + Back to Browser) ── */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={handleSyncPlayer}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                     bg-zinc-800/80 text-zinc-300 border border-zinc-700
                     hover:bg-zinc-700 hover:text-white
                     transition-all duration-200"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Sync Player
        </button>

        {frames.length > 0 && (
          <button
            onClick={toggleFrames}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                       bg-zinc-800/80 text-zinc-300 border border-zinc-700
                       hover:bg-zinc-700 hover:text-white
                       transition-all duration-200"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
            {showFrames ? "Hide Frames" : `${frames.length} Frame(s)`}
          </button>
        )}

        {isVideoMode && (
          <button
            onClick={handleBackToBrowsing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                       bg-indigo-900/50 text-indigo-300 border border-indigo-700/50
                       hover:bg-indigo-800/50 hover:text-indigo-200
                       transition-all duration-200 ml-auto"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Browser
          </button>
        )}
      </div>

      {/* ── Webview / Video Player ──────────────────────────────── */}
      <div className="w-full flex-1 min-h-0 rounded-xl overflow-hidden bg-zinc-900 shadow-lg shadow-black/30 mb-3 relative">
        {isVideoMode && selectedVideoUrl ? (
          <video
            ref={videoRef}
            controls
            crossOrigin="anonymous"
            className="w-full h-full object-contain"
            playsInline
          />
        ) : currentUrlRef.current ? (
          <>
            <webview
              ref={webviewRef}
              src={currentUrlRef.current}
              className="w-full h-full"
              disablewebsecurity="true"
              allowpopups="false"
            />
            {/* ── Loading overlay ── */}
            {showLoadingOverlay && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/90 z-10 backdrop-blur-sm transition-opacity duration-300 pointer-events-none">
                <div className="w-10 h-10 border-[3px] border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin mb-3" />
                <span className="text-sm text-zinc-400 font-medium">Loading page...</span>
                <span className="text-xs text-zinc-600 mt-1">WebView starting up</span>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 gap-3">
            <svg
              className="w-12 h-12 opacity-30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
              />
            </svg>
            <span className="text-sm">Enter a URL to start browsing</span>
          </div>
        )}
      </div>

      {/* ── Sniffed Video Streams ── */}
      {sniffedUrls.length > 0 && (
        <div className="mb-3 p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/30">
          <div className="text-xs text-emerald-400 font-medium mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Detected Video Streams ({sniffedUrls.length})
            {isVideoMode && (
              <span className="text-[10px] text-emerald-600/60 ml-auto">
                Now playing in player above
              </span>
            )}
          </div>
          {sniffedUrls.map((entry, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 py-2 px-2 rounded-lg
                         transition-colors duration-150
                         border-b border-emerald-800/20 last:border-b-0
                         ${entry.url === selectedVideoUrl
                           ? "bg-emerald-500/15"
                           : "hover:bg-emerald-500/10"}`}
            >
              <div className="min-w-0 flex-1">
                <div
                  className={`text-xs truncate font-mono ${
                    entry.url === selectedVideoUrl
                      ? "text-emerald-200"
                      : "text-emerald-300/80"
                  }`}
                  title={entry.url}
                >
                  {entry.url}
                </div>
                <div className="text-[10px] text-emerald-600/60 mt-0.5">
                  Sniffed at {entry.time}
                  {entry.url === selectedVideoUrl && " * Currently playing"}
                </div>
              </div>
              {entry.url !== selectedVideoUrl && (
                <button
                  onClick={() => handleSelectVideoUrl(entry.url)}
                  className="shrink-0 text-[10px] px-2 py-0.5 rounded-full
                             bg-emerald-500/20 text-emerald-300
                             hover:bg-emerald-500/30 transition-colors cursor-pointer"
                >
                  Play
                </button>
              )}
              {entry.url === selectedVideoUrl && (
                <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200">
                  Playing
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Player Info / Status ── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {playerInfo && (
            <span className="text-xs text-zinc-500 font-mono">{playerInfo}</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {videoFound && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Video detected
            </span>
          )}
          {isVideoMode && (
            <span className="flex items-center gap-1.5 text-xs text-indigo-400 font-medium px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
              Stream mode
            </span>
          )}
          {frames.length > 0 && (
            <span className="text-xs text-zinc-600">
              {frames.length} frame{frames.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* ── Frame List (collapsible) ── */}
      {showFrames && frames.length > 0 && (
        <div className="mb-3 p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 max-h-48 overflow-y-auto">
          <div className="text-xs text-zinc-400 font-medium mb-2">
            Discovered iframes ({frames.length})
          </div>
          {frames.map((frame, i) => (
            <div
              key={i}
              className="flex items-start gap-2 py-1.5 border-b border-zinc-800/50 last:border-b-0"
            >
              <span className="text-zinc-700 text-xs font-mono w-6 shrink-0">
                #{i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-zinc-300 truncate" title={frame.src}>
                  {frame.src || "(no src)"}
                </div>
                {(frame.hostname) && (
                  <span className="text-[10px] text-zinc-600">
                    {frame.hostname}
                    {frame.hasVideo ? " • 🎬 video" : ""}
                    {frame.corsError ? " • 🚫 CORS" : ""}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Debug Log (collapsible) ── */}
      {logs.length > 0 && (
        <details className="mb-2">
          <summary className="text-[10px] text-zinc-700 cursor-pointer hover:text-zinc-500 select-none">
            Preload log ({logs.length} entries)
          </summary>
          <div className="mt-1 p-2 rounded-lg bg-black/40 border border-zinc-800 max-h-32 overflow-y-auto font-mono text-[10px] leading-relaxed">
            {logs.slice(0, 10).map((entry, i) => (
              <div
                key={i}
                className={`${
                  entry.level === "error"
                    ? "text-red-400"
                    : entry.level === "warn"
                      ? "text-yellow-400"
                      : entry.level === "info"
                        ? "text-zinc-400"
                        : "text-zinc-600"
                }`}
              >
                <span className="text-zinc-700">[{entry.time}]</span>{" "}
                {entry.level.toUpperCase()}: {entry.msg}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
