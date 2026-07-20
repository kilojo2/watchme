import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import useBrowserSync from "../hooks/useBrowserSync";
import QuickAccess from "../components/QuickAccess";

// @ts-ignore — Vite raw import
import BROWSER_PRELOAD from "../../electron/browser-preload.js?raw";
// @ts-ignore — Vite raw import
import VIDEO_SNIFFER from "../../electron/video-sniffer.js?raw";

/**
 * BrowserPlayer — in-app browser with monopo saigon editorial styling.
 *
 * @param {{ roomId: string }} props
 */
export default function BrowserPlayer({ roomId }) {
  // ── Refs ──
  const webviewRef = useRef(null);
  const currentUrlRef = useRef("");
  const roomStateRef = useRef(null);
  const pollTimerRef = useRef(null);

  // ── State ──
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [videoFound, setVideoFound] = useState(false);
  const [playerInfo, setPlayerInfo] = useState("");
  const [frames, setFrames] = useState([]);
  const [showFrames, setShowFrames] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);

  const [sniffedUrls, setSniffedUrls] = useState([]);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState("");
  const [isVideoMode, setIsVideoMode] = useState(false);

  const { roomState, updatePlayerState, setRoomVideo, lastSentTimestamp } =
    useBrowserSync(roomId);

  roomStateRef.current = roomState;

  const updatePlayerStateRef = useRef(updatePlayerState);
  updatePlayerStateRef.current = updatePlayerState;

  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  // ── Navigation ──
  const navigateTo = useCallback((targetUrl) => {
    currentUrlRef.current = targetUrl;
    setUrl(targetUrl);
  }, []);

  const handleGo = useCallback(() => {
    let targetUrl = url.trim();
    if (!targetUrl) return;

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

  const handleQuickAccessNavigate = useCallback(
    (siteUrl) => {
      navigateTo(siteUrl);
      setRoomVideo(siteUrl);
    },
    [navigateTo, setRoomVideo],
  );

  const handleGoBack = useCallback(() => {
    webviewRef.current?.goBack();
  }, []);

  const handleGoForward = useCallback(() => {
    webviewRef.current?.goForward();
  }, []);

  const handleRefresh = useCallback(() => {
    webviewRef.current?.reload();
  }, []);

  // ── Webview event subscriptions ──
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
    };

    const onPageTitleUpdated = (e) => {
      // silently track
    };

    const onDomReady = () => {
      try {
        wv.executeJavaScript(BROWSER_PRELOAD).catch((err) => {
          console.warn("[BrowserPlayer] Preload injection failed:", err);
        });
      } catch (e) {
        console.warn("[BrowserPlayer] Preload injection error:", e);
      }
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

      try {
        const parsed = JSON.parse(msg);
        if (parsed.source === "watchme-sniffer") {
          if (parsed.event === "fullscreen") {
            try {
              const { ipcRenderer } = window.require("electron");
              ipcRenderer.send("toggle-fullscreen");
            } catch (_) {}
            return;
          }
          const status = parsed.event === "play" ? "playing" : "paused";
          updatePlayerStateRef.current(status, parsed.time);
          return;
        }
      } catch (_) {}

      if (msg.includes("[BrowserPreload]")) {
        const entry = {
          level: e.level === 2 ? "error" : e.level === 1 ? "warn" : "info",
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

  // ── Polling ──
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

          if (data.video && data.video.found) {
            setVideoFound(true);
            setPlayerInfo("Video detected");
          }

          if (data.iframeAccess && data.iframeAccess.length > 0) {
            setFrames(data.iframeAccess);
          }

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

          if (data.corsBlocked) {
            console.warn("[BrowserPlayer] CORS blocking detected in webview!");
          }
        } catch (e) {
          // ignore
        }
      }).catch(() => {});
    }, 1500);

    pollTimerRef.current = pollInterval;

    return () => {
      clearInterval(pollInterval);
    };
  }, []);

  // ── React to Firebase video URL changes ──
  useEffect(() => {
    const fbUrl = roomState.currentVideoId;
    if (!fbUrl) return;
    if (fbUrl === currentUrlRef.current) return;

    currentUrlRef.current = fbUrl;
    setUrl(fbUrl);

    const isStreamUrl = /\.(m3u8|mp4|webm)(\?|#|$)/i.test(fbUrl) ||
                        fbUrl.includes("videoplayback") ||
                        fbUrl.includes("/hls/") ||
                        fbUrl.includes("/manifest/");

    if (isStreamUrl) {
      setSelectedVideoUrl(fbUrl);
      setIsVideoMode(true);
      setPlayerInfo("Starting stream playback...");
    }
  }, [roomState.currentVideoId]);

  // ── Delayed re-sync ──
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

  // ── Sync Player ──
  const handleSyncPlayer = useCallback(() => {
    setPlayerInfo("Re-scanning for video...");
    const wv = webviewRef.current;
    if (!wv) return;
    wv.executeJavaScript(
      "if(window.__WATCHME_PLAYER){" +
      "  window.__WATCHME_PLAYER.dispatchEvent(new Event('play'));" +
      "  window.__WATCHME_PLAYER.dispatchEvent(new Event('pause'));" +
      "} void 0;"
    ).catch(() => {});
  }, []);

  const toggleFrames = useCallback(() => {
    setShowFrames((prev) => !prev);
  }, []);

  const handleSelectVideoUrl = useCallback(
    (videoUrl) => {
      setSelectedVideoUrl(videoUrl);
      setIsVideoMode(true);
      setPlayerInfo("Starting stream playback...");
      setRoomVideo(videoUrl);
    },
    [setRoomVideo],
  );

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

  // ── HLS.js init ──
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
      setPlayerInfo("Loading HLS stream...");
    } else if (!isHls) {
      video.src = selectedVideoUrl;
      video.load();
      video.play().catch((err) => {
        console.warn("[BrowserPlayer] Autoplay blocked:", err);
      });
      setPlayerInfo("Loading direct video...");
    } else {
      video.src = selectedVideoUrl;
      video.load();
    }
  }, [selectedVideoUrl]);

  // ── Video sync events ──
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

  // ── Remote commands from Firebase ──
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

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* ── Address Bar (monopo saigon: sharp 0px, transparent, 12px uppercase) ── */}
      <div className="flex items-center gap-2 mb-3 shrink-0">
        {/* Back / Forward / Refresh — 12px uppercase text links */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleGoBack}
            title="Back"
            className="px-2 py-1.5 text-[11px] font-medium text-felt-gray uppercase tracking-wider
                       hover:text-paper transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]"
          >
            ←
          </button>
          <button
            onClick={handleGoForward}
            title="Forward"
            className="px-2 py-1.5 text-[11px] font-medium text-felt-gray uppercase tracking-wider
                       hover:text-paper transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]"
          >
            →
          </button>
          <button
            onClick={handleRefresh}
            title="Refresh"
            className="px-2 py-1.5 text-[11px] font-medium text-felt-gray uppercase tracking-wider
                       hover:text-paper transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]"
          >
            ↻
          </button>
        </div>

        {/* URL Input — sharp 0px, inkstone bg */}
        <div className="flex-1 flex items-center px-3 py-2 bg-inkstone border border-white/5
                        focus-within:border-white/20 transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]">
          <svg
            className="w-3.5 h-3.5 shrink-0 text-felt-gray mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter movie URL..."
            className="flex-1 bg-transparent text-sm text-paper outline-none placeholder:text-felt-gray"
          />
        </div>

        <button
          onClick={handleGo}
          disabled={isLoading || !url.trim()}
          className="ghost-pill-sm"
        >
          {isLoading ? (
            <>
              <span className="w-3 h-3 border border-white/30 border-t-white animate-spin" />
              Loading
            </>
          ) : (
            "Go"
          )}
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={handleSyncPlayer}
          className="ghost-pill-sm flex items-center gap-1.5"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Sync Player
        </button>

        {frames.length > 0 && (
          <button
            onClick={toggleFrames}
            className="ghost-pill-sm flex items-center gap-1.5"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            {showFrames ? "Hide Frames" : `${frames.length} Frame(s)`}
          </button>
        )}

        {isVideoMode && (
          <button
            onClick={handleBackToBrowsing}
            className="ghost-pill-sm flex items-center gap-1.5 ml-auto"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Browser
          </button>
        )}
      </div>

      {/* ── Webview / Video Player (0px radius, no shadow) ── */}
      <div className="w-full flex-1 min-h-0 bg-obsidian mb-3 relative">
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
            {/* Loading overlay */}
            {showLoadingOverlay && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-obsidian/90 z-10 transition-opacity duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] pointer-events-none">
                <div className="w-8 h-8 border border-white/20 border-t-white animate-spin mb-3" />
                <span className="text-xs text-felt-gray uppercase tracking-wider">Loading page...</span>
              </div>
            )}
          </>
        ) : (
          <QuickAccess onNavigate={handleQuickAccessNavigate} />
        )}
      </div>

      {/* ── Sniffed Video Streams (monochrome) ── */}
      {sniffedUrls.length > 0 && (
        <div className="mb-3 p-[18px] bg-inkstone border border-white/5">
          <div className="text-[11px] text-ash-mist font-medium mb-2 flex items-center gap-2 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 bg-paper/50" />
            Detected Video Streams ({sniffedUrls.length})
            {isVideoMode && (
              <span className="text-[10px] text-felt-gray ml-auto">
                Now playing in player above
              </span>
            )}
          </div>
          {sniffedUrls.map((entry, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 py-2 px-2
                         border-b border-white/5 last:border-b-0
                         ${entry.url === selectedVideoUrl
                           ? "bg-paper/5"
                           : "hover:bg-paper/5"}`}
            >
              <div className="min-w-0 flex-1">
                <div
                  className={`text-xs truncate font-mono ${
                    entry.url === selectedVideoUrl
                      ? "text-paper"
                      : "text-ash-mist"
                  }`}
                  title={entry.url}
                >
                  {entry.url}
                </div>
                <div className="text-[10px] text-felt-gray mt-0.5">
                  Sniffed at {entry.time}
                  {entry.url === selectedVideoUrl && " • Currently playing"}
                </div>
              </div>
              {entry.url !== selectedVideoUrl && (
                <button
                  onClick={() => handleSelectVideoUrl(entry.url)}
                  className="ghost-pill-sm text-[10px]"
                >
                  Play
                </button>
              )}
              {entry.url === selectedVideoUrl && (
                <span className="shrink-0 text-[10px] px-2 py-0.5 border border-white/20 text-ash-mist">
                  Playing
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Player Info / Status (monochrome) ── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {playerInfo && (
            <span className="text-[10px] text-felt-gray font-mono uppercase tracking-wider">{playerInfo}</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {videoFound && (
            <span className="flex items-center gap-1.5 text-[10px] text-ash-mist font-medium px-2.5 py-1 border border-white/10">
              <span className="w-1.5 h-1.5 bg-paper/50" />
              Video detected
            </span>
          )}
          {isVideoMode && (
            <span className="flex items-center gap-1.5 text-[10px] text-ash-mist font-medium px-2.5 py-1 border border-white/10">
              Stream mode
            </span>
          )}
          {frames.length > 0 && (
            <span className="text-[10px] text-felt-gray">
              {frames.length} frame{frames.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* ── Frame List ── */}
      {showFrames && frames.length > 0 && (
        <div className="mb-3 p-[18px] bg-inkstone border border-white/5 max-h-48 overflow-y-auto">
          <div className="text-[11px] text-felt-gray font-medium mb-2 uppercase tracking-wider">
            Discovered iframes ({frames.length})
          </div>
          {frames.map((frame, i) => (
            <div
              key={i}
              className="flex items-start gap-2 py-1.5 border-b border-white/5 last:border-b-0"
            >
              <span className="text-felt-gray text-xs font-mono w-6 shrink-0">
                #{i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-ash-mist truncate" title={frame.src}>
                  {frame.src || "(no src)"}
                </div>
                {(frame.hostname) && (
                  <span className="text-[10px] text-felt-gray">
                    {frame.hostname}
                    {frame.hasVideo ? " • video" : ""}
                    {frame.corsError ? " • CORS blocked" : ""}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Debug Log ── */}
      {logs.length > 0 && (
        <details className="mb-2">
          <summary className="text-[10px] text-felt-gray cursor-pointer hover:text-ash-mist select-none uppercase tracking-wider">
            Preload log ({logs.length} entries)
          </summary>
          <div className="mt-1 p-2 bg-obsidian border border-white/5 max-h-32 overflow-y-auto font-mono text-[10px] leading-relaxed">
            {logs.slice(0, 10).map((entry, i) => (
              <div
                key={i}
                className={`${
                  entry.level === "error"
                    ? "text-ash-mist"
                    : entry.level === "warn"
                      ? "text-felt-gray"
                      : "text-felt-gray/70"
                }`}
              >
                <span className="text-felt-gray/40">[{entry.time}]</span>{" "}
                {entry.level.toUpperCase()}: {entry.msg}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
