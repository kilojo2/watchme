import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Hls from "hls.js";
import useBrowserSync from "../hooks/useBrowserSync";

/**
 * Константа — уникальный label дочернего Webview.
 */
const WEBVIEW_LABEL = "browser-player";

/**
 * Runtime detection — проверяем, запущено ли приложение в Tauri.
 *
 * В Tauri v2 `window.__TAURI_INTERNALS__` инжектируется в главное окно
 * через initialization-скрипт. В обычном браузере (Railway) этого нет.
 *
 * @returns {boolean} `true` если внутри Tauri webview
 */
function isTauriRuntime() {
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ != null;
}

/**
 * BrowserPlayer — компонент встроенного браузера (child webview).
 *
 * ## Архитектура
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │                   BrowserPlayer (главное окно)                │
 * │  ┌─── Address Bar ───────────────────────────────────────┐   │
 * │  │ https://example.com/movie              [Go] [🔄]      │   │
 * │  └───────────────────────────────────────────────────────┘   │
 * │  ┌─── Toolbar ───────────────────────────────────────────┐   │
 * │  │ [🔍 Sync Player]  [📋 Show Frames]                    │   │
 * │  └───────────────────────────────────────────────────────┘   │
 * │  ┌─── #webview-placeholder ──────────────────────────────┐   │
 * │  │   ╔══ Дочерний Webview (child webview) ═══════╗       │   │
 * │  │   ║  Загружает внешний сайт; preload-скрипт   ║       │   │
 * │  │   ║  сканирует top-level + все iframe на      ║       │   │
 * │  │   ║  наличие <video> (даже кросс-доменные)    ║       │   │
 * │  │   ╚═══════════════════════════════════════════╝       │   │
 * │  └───────────────────────────────────────────────────────┘   │
 * │                                                              │
 * │  [📺 Video detected] — [3 frames found] — status line       │
 * └──────────────────────────────────────────────────────────────┘
 *
 * ## Cross-frame scanning
 *
 * Preload-скрипт использует --disable-web-security (установлен в lib.rs)
 * для доступа к содержимому кросс-доменных iframe. MutationObserver
 * устанавливается на каждый iframe, чтобы ловить динамически создаваемые
 * <video>-элементы внутри плееров (Bazon, Collaps и др.).
 *
 * ## Ручной режим синхронизации
 *
 * Кнопка "Sync Player" отправляет IPC-событие scan-video в дочерний
 * webview, что вызывает полное пересканирование всех фреймов.
 * Это нужно, когда пользователь вручную кликнул по плееру,
 * закрыл рекламу и запустил видео.
 *
 * ## Browser-only mode (Railway)
 *
 * When deployed to Railway (plain browser), the Tauri backend is not
 * available. The component detects this via `isTauriRuntime()` and
 * shows a placeholder message instead of the address bar / webview.
 * All `invoke()` calls safely become no-ops via the Tauri API stub.
 *
 * @param {{ roomId: string }} props
 */
export default function BrowserPlayer({ roomId }) {
  // ── Runtime detection ──────────────────────────────────────
  const isTauri = isTauriRuntime();

  // Если не в Tauri — показываем сообщение и ничего не рендерим
  if (!isTauri) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-zinc-500">
        <svg className="w-16 h-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        <div className="text-center max-w-md">
          <p className="text-base font-medium text-zinc-400 mb-1">
            In-App Browser
          </p>
          <p className="text-sm text-zinc-600 leading-relaxed">
            This feature requires the <strong className="text-zinc-500">Tauri desktop app</strong>.
            It is not available in the browser version.
          </p>
          <p className="text-xs text-zinc-700 mt-3">
            Download the desktop app or use the YouTube player instead.
          </p>
        </div>
      </div>
    );
  }

  // ── Refs ────────────────────────────────────────────────────
  // ── Refs ────────────────────────────────────────────────────
  const placeholderRef = useRef(null);
  const containerRef = useRef(null);
  const currentUrlRef = useRef("");
  const roomStateRef = useRef(null);
  const isWebviewReady = useRef(false);

  // ── State ───────────────────────────────────────────────────
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [videoFound, setVideoFound] = useState(false);
  const [playerInfo, setPlayerInfo] = useState("");
  const [frames, setFrames] = useState([]); // информация об iframe
  const [showFrames, setShowFrames] = useState(false); // показать список iframe
  const [logs, setLogs] = useState([]); // последние логи из preload

  // ── Loading overlay — скрывает placeholder пока webview грузится,
  //    автоматически убирается через 3 секунды (fallback).
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const loadingOverlayTimerRef = useRef(null);

  // ── Sniffed video URLs (from Rust network sniffer) ──────────
  const [sniffedUrls, setSniffedUrls] = useState([]);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState("");
  const [isVideoMode, setIsVideoMode] = useState(false);

  // ── Firebase sync hook ──────────────────────────────────────
  const { roomState, updatePlayerState, setRoomVideo, lastSentTimestamp } =
    useBrowserSync(roomId);

  // Храним актуальный roomState в ref (для setTimeout и IPC-листенеров)
  roomStateRef.current = roomState;

  // ── Video element refs (for HLS.js playback) ────────────────
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  // Скрывает loading overlay и очищает таймер.
  // Вызывается при первом полезном IPC-событии от webview.
  const dismissLoadingOverlay = useCallback(() => {
    setShowLoadingOverlay(false);
    if (loadingOverlayTimerRef.current) {
      clearTimeout(loadingOverlayTimerRef.current);
      loadingOverlayTimerRef.current = null;
    }
  }, []);

  // ================================================================
  // 1. Создание / обновление дочернего webview
  // ================================================================
  const createWebview = useCallback(async (targetUrl) => {
    const placeholder = placeholderRef.current;
    if (!placeholder) return;

    const rect = placeholder.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    setIsLoading(true);
    setVideoFound(false);
    setPlayerInfo("Loading...");
    setFrames([]);
    setLogs([]);

    // Показываем loading overlay над placeholder
    setShowLoadingOverlay(true);

    // Fallback: принудительно убираем overlay через 3 секунды,
    // даже если on_page_load / polling не сработали.
    if (loadingOverlayTimerRef.current) {
      clearTimeout(loadingOverlayTimerRef.current);
    }
    loadingOverlayTimerRef.current = setTimeout(() => {
      setShowLoadingOverlay(false);
    }, 3000);

    try {
      // Закрываем существующий webview (если есть)
      try {
        await invoke("close_browser_webview", {
          label: WEBVIEW_LABEL,
        });
      } catch {
        // Если webview нет — игнорируем
      }

      // Создаём новый
      await invoke("create_browser_webview", {
        url: targetUrl,
        label: WEBVIEW_LABEL,
        x: rect.left * dpr,
        y: rect.top * dpr,
        w: rect.width * dpr,
        h: rect.height * dpr,
      });

      isWebviewReady.current = true;
      setPlayerInfo("Page loaded — looking for video...");
    } catch (err) {
      console.error("[BrowserPlayer] Failed to create webview:", err);
      setPlayerInfo(`Error: ${err}`);
      isWebviewReady.current = false;
      // При ошибке сразу убираем overlay
      setShowLoadingOverlay(false);
      if (loadingOverlayTimerRef.current) {
        clearTimeout(loadingOverlayTimerRef.current);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ================================================================
  // 2. Изменение позиции/размера webview при resize
  // ================================================================
  const repositionWebview = useCallback(() => {
    if (!isWebviewReady.current) return;

    const placeholder = placeholderRef.current;
    if (!placeholder) return;

    const rect = placeholder.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    invoke("resize_browser_webview", {
      label: WEBVIEW_LABEL,
      x: rect.left * dpr,
      y: rect.top * dpr,
      w: rect.width * dpr,
      h: rect.height * dpr,
    }).catch(() => {
      // webview может быть закрыт к моменту выполнения
    });
  }, []);

  // ================================================================
  // 3. Навигация (Go button / Enter)
  // ================================================================
  const handleGo = useCallback(() => {
    let targetUrl = url.trim();
    if (!targetUrl) return;

    // Добавляем https:// если нет протокола
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = "https://" + targetUrl;
    }

    currentUrlRef.current = targetUrl;
    setRoomVideo(targetUrl);
    createWebview(targetUrl);
  }, [url, createWebview, setRoomVideo]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") handleGo();
    },
    [handleGo],
  );

  // ================================================================
  // 3b. Навигация: Назад / Вперёд / Обновить
  // ================================================================
  const handleGoBack = useCallback(() => {
    invoke("eval_in_browser", {
      label: WEBVIEW_LABEL,
      js: "window.history.back()",
    }).catch(() => {});
  }, []);

  const handleGoForward = useCallback(() => {
    invoke("eval_in_browser", {
      label: WEBVIEW_LABEL,
      js: "window.history.forward()",
    }).catch(() => {});
  }, []);

  const handleRefresh = useCallback(() => {
    invoke("eval_in_browser", {
      label: WEBVIEW_LABEL,
      js: "window.location.reload()",
    }).catch(() => {});
  }, []);

  // ================================================================
  // 4. Слушаем Tauri IPC события от дочернего webview
  // ================================================================
  useEffect(() => {
    const unlisteners = [];

    async function setupListeners() {
      console.log("[BrowserPlayer:D] Setting up event listeners...");

      // play — первое признак, что webview жив и работает
      const unsubPlay = await listen(
        "browser-video-play",
        (event) => {
          dismissLoadingOverlay();
          console.log("[BrowserPlayer:D] Received browser-video-play:", event.payload);
          setVideoFound(true);
          setPlayerInfo("▶ Playing");
          updatePlayerState("playing", event.payload.currentTime);
        },
      );
      unlisteners.push(unsubPlay);

      // pause
      const unsubPause = await listen(
        "browser-video-pause",
        (event) => {
          console.log("[BrowserPlayer:D] Received browser-video-pause:", event.payload);
          setPlayerInfo("⏸ Paused");
          updatePlayerState("paused", event.payload.currentTime);
        },
      );
      unlisteners.push(unsubPause);

      // seek
      const unsubSeek = await listen(
        "browser-video-seek",
        (event) => {
          console.log("[BrowserPlayer:D] Received browser-video-seek:", event.payload);
          setPlayerInfo(`⏩ Seeking to ${event.payload.currentTime.toFixed(1)}s`);
          updatePlayerState(
            roomStateRef.current.status === "playing" ? "playing" : "paused",
            event.payload.currentTime,
          );
        },
      );
      unlisteners.push(unsubSeek);

      // timeupdate (периодическая синхронизация позиции)
      const unsubTime = await listen(
        "browser-video-timeupdate",
        (event) => {
          console.log("[BrowserPlayer:D] Received browser-video-timeupdate:", event.payload);
          setVideoFound(true);
          if (roomStateRef.current.status === "playing") {
            updatePlayerState("playing", event.payload.currentTime);
          }
        },
      );
      unlisteners.push(unsubTime);

      // video-found / video-lost
      const unsubFound = await listen(
        "browser-video-found",
        (event) => {
          dismissLoadingOverlay();
          console.log("[BrowserPlayer:D] Received browser-video-found:", event.payload);
          if (event.payload?.found) {
            setVideoFound(true);
            setPlayerInfo("📺 Video detected & synced");
          } else {
            setVideoFound(false);
            setPlayerInfo("Video element lost — click Sync Player");
          }
        },
      );
      unlisteners.push(unsubFound);

      // frame-info — структура iframe на странице
      const unsubFrames = await listen(
        "browser-frame-info",
        (event) => {
          dismissLoadingOverlay();
          const frameList = event.payload?.frames || [];
          console.log("[BrowserPlayer:D] Received browser-frame-info:", frameList.length, "frames");
          setFrames(frameList);
          if (frameList.length > 0 && !videoFound) {
            setPlayerInfo(
              `Page loaded — ${frameList.length} frame(s) found, waiting for video...`,
            );
          }
        },
      );
      unlisteners.push(unsubFrames);

      // log — сообщения от preload-скрипта
      const unsubLog = await listen(
        "browser-log",
        (event) => {
          const { level, msg, data } = event.payload || {};
          console.log("[BrowserPlayer:D] Received browser-log:", level, msg, data);
          const entry = {
            level,
            msg,
            data,
            time: new Date().toLocaleTimeString(),
          };
          setLogs((prev) => [entry, ...prev].slice(0, 50)); // храним последние 50
        },
      );
      unlisteners.push(unsubLog);

      // browser-video-url — sniffed video URLs от Rust network sniffer
      const unsubVideoUrl = await listen(
        "browser-video-url",
        (event) => {
          dismissLoadingOverlay();
          const { url } = event.payload || {};
          if (!url) return;
          console.log("[BrowserPlayer:D] 🎬 Sniffed video URL:", url);
          setSniffedUrls((prev) => {
            if (prev.some((u) => u.url === url)) return prev;
            return [...prev, { url, time: new Date().toLocaleTimeString() }];
          });
          if (!videoFound) {
            setVideoFound(true);
            setPlayerInfo(`🎬 Stream detected — click to play`);
          }
        },
      );
      unlisteners.push(unsubVideoUrl);

      // diagnostic — сообщения от Rust диагностики (timeout on_page_load и т.д.)
      const unsubDiag = await listen(
        "browser-diagnostic",
        (event) => {
          console.warn("[BrowserPlayer:D] ⚠️ Diagnostic event:", event.payload);
          setPlayerInfo(`⚠️ ${event.payload?.message || "Diagnostic event"}`);
          setLogs((prev) => [
            {
              level: "warn",
              msg: `[DIAG] ${event.payload?.message || ""}`,
              data: event.payload,
              time: new Date().toLocaleTimeString(),
            },
            ...prev,
          ].slice(0, 50));
        },
      );
      unlisteners.push(unsubDiag);

      console.log("[BrowserPlayer:D] All event listeners registered");
    }

    setupListeners().catch(e => console.error("[BrowserPlayer:D] Failed to setup listeners:", e));

    return () => {
      console.log("[BrowserPlayer:D] Cleaning up event listeners");
      if (loadingOverlayTimerRef.current) {
        clearTimeout(loadingOverlayTimerRef.current);
        loadingOverlayTimerRef.current = null;
      }
      unlisteners.forEach((fn) => fn());
    };
  }, [updatePlayerState]);

  // ================================================================
  // 6. Реагируем на изменение currentVideoId из Firebase
  //    (webpage URL → webview; stream URL → video mode)
  // ================================================================
  useEffect(() => {
    const fbUrl = roomState.currentVideoId;
    if (!fbUrl || fbUrl === currentUrlRef.current) return;

    currentUrlRef.current = fbUrl;
    setUrl(fbUrl);

    // Проверяем, является ли URL прямым видео-потоком (от network sniffer)
    const isStreamUrl = /\.(m3u8|mp4|webm)(\?|#|$)/i.test(fbUrl) ||
                        fbUrl.includes("videoplayback") ||
                        fbUrl.includes("/hls/") ||
                        fbUrl.includes("/manifest/");

    if (isStreamUrl) {
      // Прямой стрим — запускаем видео-режим (hls.js / direct video)
      setSelectedVideoUrl(fbUrl);
      setIsVideoMode(true);
      setPlayerInfo("🎬 Starting stream playback...");
    } else {
      // Обычная веб-страница — создаём webview
      createWebview(fbUrl);
    }
  }, [roomState.currentVideoId, createWebview]);

  // ================================================================
  // 7. Отложенная повторная синхронизация
  // ================================================================
  useEffect(() => {
    if (!roomState.currentVideoId) return;

    const timer = setTimeout(() => {
      const { status, lastPosition } = roomStateRef.current;

      if (status === "playing") {
        invoke("eval_in_browser", {
          label: WEBVIEW_LABEL,
          js: "(window.__browserData?.video || document.querySelector('video'))?.play()",
        }).catch(() => {});
        if (lastPosition > 0) {
          invoke("eval_in_browser", {
            label: WEBVIEW_LABEL,
            js: "var v=window.__browserData?.video||document.querySelector('video');if(v)v.currentTime=" + lastPosition,
          }).catch(() => {});
        }
      } else if (status === "paused") {
        invoke("eval_in_browser", {
          label: WEBVIEW_LABEL,
          js: "(window.__browserData?.video || document.querySelector('video'))?.pause()",
        }).catch(() => {});
        if (lastPosition > 0) {
          invoke("eval_in_browser", {
            label: WEBVIEW_LABEL,
            js: "var v=window.__browserData?.video||document.querySelector('video');if(v)v.currentTime=" + lastPosition,
          }).catch(() => {});
        }
      }
    }, 2000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomState.currentVideoId]);

  // ================================================================
  // 8. Следим за изменением размеров окна (ResizeObserver)
  // ================================================================
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId = null;
    const observer = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        repositionWebview();
      });
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [repositionWebview]);

  // ================================================================
  // 9. Cleanup при размонтировании
  // ================================================================
  useEffect(() => {
    return () => {
      isWebviewReady.current = false;
      invoke("close_browser_webview", {
        label: WEBVIEW_LABEL,
      }).catch(() => {});
    };
  }, []);

  // ================================================================
  // 10. Sync Player — ручная синхронизация
  // ================================================================
  const handleSyncPlayer = useCallback(() => {
    setPlayerInfo("🔄 Re-scanning for video...");
    // Trigger re-scan via eval (the polling loop will pick up changes)
    invoke("eval_in_browser", {
      label: WEBVIEW_LABEL,
      js: "window.__browserData = window.__browserData || {}; document.querySelectorAll('video').forEach(function(v){v.dispatchEvent(new Event('play')); v.dispatchEvent(new Event('pause'));}); void 0;",
    }).catch(() => {});
  }, []);

  // ================================================================
  // 11. Show/Hide Frames — отображение iframe
  // ================================================================
  const toggleFrames = useCallback(() => {
    if (showFrames) {
      setShowFrames(false);
    } else {
      // Показываем последние полученные данные о фреймах (поллинг обновляет их каждые 500мс)
      setShowFrames(true);
    }
  }, [showFrames]);

  // ================================================================
  // 12. Выбор sniffed video URL для воспроизведения
  // ================================================================
  const handleSelectVideoUrl = useCallback(
    (videoUrl) => {
      console.log("[BrowserPlayer:D] 🎬 Selected video URL:", videoUrl);
      setSelectedVideoUrl(videoUrl);
      setIsVideoMode(true);
      setPlayerInfo("🎬 Starting stream playback...");

      // Обновляем Firebase, чтобы другие участники могли подключиться
      setRoomVideo(videoUrl);
    },
    [setRoomVideo],
  );

  // ================================================================
  // 13. Возврат к режиму браузера
  // ================================================================
  const handleBackToBrowsing = useCallback(() => {
    setIsVideoMode(false);
    setSelectedVideoUrl("");
    setPlayerInfo("");

    // Очищаем HLS
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Очищаем video element
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
  }, []);

  // ================================================================
  // 14. Инициализация HLS.js / video при выборе URL
  // ================================================================
  useEffect(() => {
    if (!selectedVideoUrl || !videoRef.current) return;

    const video = videoRef.current;

    // Очищаем предыдущий HLS инстанс
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
      // .mp4, .webm, direct video
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
  // 15. Синхронизация <video> событий с Firebase
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
      // Throttle time updates to every 2 seconds
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
  // 16. Обработка remote-команд (из Firebase) для video/webview
  // ================================================================
  useEffect(() => {
    const { status, lastPosition } = roomState;

    // Loop Guard: не реагируем на собственные изменения
    if (Date.now() - lastSentTimestamp.current < 500) return;

    if (!isVideoMode) {
      // Отправляем remote-команды в child webview через eval_in_browser
      if (status === "playing") {
        invoke("eval_in_browser", {
          label: WEBVIEW_LABEL,
          js: "(window.__browserData?.video || document.querySelector('video'))?.play()",
        }).catch(() => {});
        if (lastPosition > 0) {
          invoke("eval_in_browser", {
            label: WEBVIEW_LABEL,
            js: "var v=window.__browserData?.video||document.querySelector('video');if(v)v.currentTime=" + lastPosition,
          }).catch(() => {});
        }
      } else if (status === "paused") {
        invoke("eval_in_browser", {
          label: WEBVIEW_LABEL,
          js: "(window.__browserData?.video || document.querySelector('video'))?.pause()",
        }).catch(() => {});
        if (lastPosition > 0) {
          invoke("eval_in_browser", {
            label: WEBVIEW_LABEL,
            js: "var v=window.__browserData?.video||document.querySelector('video');if(v)v.currentTime=" + lastPosition,
          }).catch(() => {});
        }
      }
      return;
    }

    // Видео-режим: управляем локальным <video> элементом
    const video = videoRef.current;
    if (!video) return;

    if (status === "playing") {
      // Синхронизируем позицию, если сильно расходится (>2s)
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
    <div ref={containerRef} className="flex flex-col min-h-0 flex-1">
      {/* ── Address Bar (Nav buttons + URL input + Go) ───────── */}
      <div className="flex items-center gap-1.5 mb-2 shrink-0">
        {/* Back / Forward / Refresh */}
        <div className="flex items-center gap-0.5 shrink-0 bg-zinc-900 rounded-xl border border-zinc-800 px-1 py-1">
          <button
            onClick={handleGoBack}
            disabled={!isWebviewReady.current}
            title="Back"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800
                       disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-150"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={handleGoForward}
            disabled={!isWebviewReady.current}
            title="Forward"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800
                       disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-150"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={handleRefresh}
            disabled={!isWebviewReady.current}
            title="Refresh"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800
                       disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-150"
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
          disabled={!isWebviewReady.current}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                     bg-zinc-800/80 text-zinc-300 border border-zinc-700
                     hover:bg-zinc-700 hover:text-white
                     disabled:opacity-30 disabled:cursor-not-allowed
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

      {/* ── Webview Placeholder / Video Player ──────────────── */}
      <div
        id="webview-placeholder"
        ref={placeholderRef}
        className="w-full flex-1 min-h-0 rounded-xl overflow-hidden bg-zinc-900 shadow-lg shadow-black/30 mb-3 relative"
      >
        {isVideoMode && selectedVideoUrl ? (
          <video
            ref={videoRef}
            controls
            crossOrigin="anonymous"
            className="w-full h-full object-contain"
            playsInline
          />
        ) : (!currentUrlRef.current || isLoading) ? (
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
        ) : null}

        {/* ── Loading overlay — скрывает placeholder пока webview
              загружается. Автоматически убирается через 3s (fallback)
              или при первом IPC-событии от polling/sniffer.         */}
        {showLoadingOverlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/90 z-10 backdrop-blur-sm transition-opacity duration-300">
            <div className="w-10 h-10 border-[3px] border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin mb-3" />
            <span className="text-sm text-zinc-400 font-medium">Loading page...</span>
            <span className="text-xs text-zinc-600 mt-1">WebView starting up</span>
          </div>
        )}
      </div>

      {/* ── Sniffed Video Streams (from Rust network sniffer) ── */}
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

      {/* ── Player Info / Status ─────────────────────────────── */}
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

      {/* ── Frame List (collapsible) ─────────────────────────── */}
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
                {frame.depth > 0 && (
                  <span className="text-[10px] text-zinc-600">
                    nested (depth {frame.depth})
                  </span>
                )}
              </div>
              {(frame.width || frame.height) && (
                <span className="text-[10px] text-zinc-600 shrink-0">
                  {frame.width || "auto"}×{frame.height || "auto"}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Debug Log (collapsible, last 5 entries) ──────────── */}
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
