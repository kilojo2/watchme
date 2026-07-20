/**
 * browser-preload.js — Preload-скрипт для <webview> (Electron In-App Browser).
 *
 * Внедряется через атрибут preload на теге <webview>.
 *
 * ## Архитектура IPC
 *
 * В отличие от Tauri v2, Electron <webview> поддерживает:
 * - `preload` — скрипт, выполняющийся в контексте webview до загрузки страницы
 * - `executeJavaScript()` — из главного окна
 * - События: `did-navigate`, `did-navigate-in-page`, `page-title-updated` и др.
 *
 * Вместо Rust polling + emit используется следующий механизм:
 *
 *   1. Preload сохраняет всё состояние в глобальной переменной `window.__browserData`
 *   2. Главное окно (React) периодически вызывает `webviewRef.current.executeJavaScript()`
 *      для чтения `window.__browserData`
 *   3. Или preload сам отправляет IPC-сообщения через `postMessage`
 *
 * ┌─────────────────────┐   executeJavaScript()     ┌──────────────┐
 * │  <webview>           │ ◄─────────────────────   │  Main Window │
 * │  window.__browserData│ ──────────────────────►   │  React App   │
 * │  = { video, ... }    │   JSON.stringify(data)    │              │
 * └─────────────────────┘                            └──────────────┘
 *
 * ## Cross-frame scanning
 *
 * С флагом disablewebsecurity на теге <webview> отключается Same-Origin Policy,
 * что позволяет из top-frame скрипта получать доступ к contentDocument/contentWindow
 * любого iframe.
 *
 * MutationObserver устанавливается как на top-level document.body, так и
 * на body каждого найденного iframe для отслеживания динамически создаваемых
 * <video>-элементов внутри плееров (Bazon, Collaps, etc.).
 */
(function () {
  "use strict";

  // ═══════════════════════════════════════════════════════════════════
  // DIAGNOSTIC
  // ═══════════════════════════════════════════════════════════════════
  console.log("[BrowserPreload:D] Script loaded");

  // ═══════════════════════════════════════════════════════════════════
  // Инициализация глобального хранилища данных
  // ═══════════════════════════════════════════════════════════════════
  // Главное окно читает эту переменную через executeJavaScript()
  window.__browserData = {
    video: null,       // текущее состояние <video>: { found, src, currentTime, paused, ... }
    frameCount: 0,     // количество iframe на странице
    title: document.title || "",
    initDone: false,   // true когда preload завершил инициализацию
  };

  // ═══════════════════════════════════════════════════════════════════
  // Конфигурация
  // ═══════════════════════════════════════════════════════════════════
  const POLL_INTERVAL_MS = 3000; // интервал периодической проверки видео (резервный)

  // ═══════════════════════════════════════════════════════════════════
  // Состояние
  // ═══════════════════════════════════════════════════════════════════
  let video = null;
  let activeVideoFrame = null; // Document, в котором найден <video>
  const observers = [];     // Все активные MutationObserver'ы
  let pollTimer = null;
  const scannedFrames = new WeakSet(); // Уже просканированные Document'ы

  // ═══════════════════════════════════════════════════════════════════
  // Обновление глобального состояния (читается React-поллингом)
  // ═══════════════════════════════════════════════════════════════════
  function updateBrowserData() {
    var data = {
      found: video !== null,
      src: video ? (video.src || video.currentSrc || "") : "",
      duration: video ? video.duration : 0,
      currentTime: video ? video.currentTime : 0,
      paused: video ? video.paused : true,
      readyState: video ? video.readyState : 0,
    };
    window.__browserData.video = data;
    window.__browserData.title = document.title || "";
  }

  // ═══════════════════════════════════════════════════════════════════
  // Логирование (только в консоль webview)
  // ═══════════════════════════════════════════════════════════════════
  function log(level, msg, data) {
    if (level === "error") console.error("[BrowserPreload]", msg, data || "");
    else if (level === "warn") console.warn("[BrowserPreload]", msg, data || "");
    else console.log("[BrowserPreload]", msg, data || "");
  }

  // ═══════════════════════════════════════════════════════════════════
  // Привязка событий к <video>
  // ═══════════════════════════════════════════════════════════════════
  function attachVideoEvents(videoEl) {
    if (video === videoEl) return;

    detachVideoEvents();

    video = videoEl;
    activeVideoFrame = videoEl.ownerDocument;
    if (!video) {
      updateBrowserData();
      return;
    }

    log("info", "Attached to <video>", {
      src: video.src || "(no src)",
      duration: video.duration,
      readyState: video.readyState,
      frameOrigin: activeVideoFrame?.location?.hostname || "unknown",
    });

    video.addEventListener("play", onVideoPlay);
    video.addEventListener("pause", onVideoPause);
    video.addEventListener("seeked", onVideoSeeked);
    video.addEventListener("timeupdate", onVideoTimeUpdate);

    // Обновляем глобальное состояние
    updateBrowserData();
  }

  function detachVideoEvents() {
    if (!video) return;
    video.removeEventListener("play", onVideoPlay);
    video.removeEventListener("pause", onVideoPause);
    video.removeEventListener("seeked", onVideoSeeked);
    video.removeEventListener("timeupdate", onVideoTimeUpdate);
    video = null;
    activeVideoFrame = null;
    updateBrowserData();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Обработчики video-событий — обновляют window.__browserData
  // ═══════════════════════════════════════════════════════════════════
  function onVideoPlay() {
    log("info", "▶ Video play", { currentTime: video?.currentTime });
    updateBrowserData();
  }

  function onVideoPause() {
    log("info", "⏸ Video pause", { currentTime: video?.currentTime });
    updateBrowserData();
  }

  function onVideoSeeked() {
    log("info", "⏩ Video seek", { currentTime: video?.currentTime });
    updateBrowserData();
  }

  function onVideoTimeUpdate() {
    updateBrowserData();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Сканирование документа на <video>
  // ═══════════════════════════════════════════════════════════════════
  function scanDocumentForVideo(doc) {
    if (!doc || scannedFrames.has(doc)) return false;
    scannedFrames.add(doc);

    var videos = doc.querySelectorAll("video");
    if (videos.length > 0) {
      var found = videos[0];
      log("info", "Found <video> in frame " + (doc.location?.hostname || "unknown"), {
        count: videos.length,
        src: found.src || "(no src)",
      });
      attachVideoEvents(found);
      return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Рекурсивное сканирование всех iframe
  // ═══════════════════════════════════════════════════════════════════
  function scanAllFrames() {
    // Сначала top-level
    var found = scanDocumentForVideo(document);

    // Затем все iframe (рекурсивно)
    var iframes = document.querySelectorAll("iframe");
    for (var i = 0; i < iframes.length; i++) {
      if (found) break;
      var iframe = iframes[i];

      try {
        var doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
        if (doc) {
          // Nested iframe внутри этого iframe
          var nestedIframes = doc.querySelectorAll("iframe");
          for (var j = 0; j < nestedIframes.length; j++) {
            if (found) break;
            var nested = nestedIframes[j];
            try {
              var nestedDoc = nested.contentDocument || (nested.contentWindow && nested.contentWindow.document);
              if (nestedDoc) {
                found = scanDocumentForVideo(nestedDoc) || found;
              }
            } catch (e) {
              log("warn", "Cannot access nested iframe: " + (nested.src || ""), { error: e.message });
            }
          }

          // Сканируем сам iframe
          if (!found) {
            found = scanDocumentForVideo(doc);
          }
        }
      } catch (e) {
        log("warn", "Cannot access iframe: " + (iframe.src || ""), { error: e.message });
      }
    }

    // Обновляем количество фреймов
    window.__browserData.frameCount = iframes.length;

    return found;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Установка MutationObserver на документ
  // ═══════════════════════════════════════════════════════════════════
  function setupObserverOnDoc(doc, label) {
    if (!doc || !doc.body) return null;

    var observer = new MutationObserver(function () {
      // Если видео уже привязано — проверяем, что оно всё ещё в DOM
      if (video && !document.body.contains(video) && (!activeVideoFrame || !activeVideoFrame.body || !activeVideoFrame.body.contains(video))) {
        log("warn", "Video element removed from DOM, re-scanning");
        detachVideoEvents();
        scanAllFrames();
        return;
      }

      // Если видео ещё не найдено — сканируем
      if (!video) {
        scanAllFrames();
      }
    });

    observer.observe(doc.body, { childList: true, subtree: true });
    observers.push(observer);
    log("debug", "MutationObserver set up on " + (label || "unknown frame"));
    return observer;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Установка MutationObserver на все iframe
  // ═══════════════════════════════════════════════════════════════════
  function setupObserversOnAllFrames() {
    setupObserverOnDoc(document, "top-level");

    var iframes = document.querySelectorAll("iframe");
    for (var i = 0; i < iframes.length; i++) {
      var iframe = iframes[i];
      try {
        var doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
        if (doc && doc.body) {
          setupObserverOnDoc(doc, "iframe: " + (iframe.src || "").slice(0, 80));

          // Nested iframe внутри этого iframe
          var nestedIframes = doc.querySelectorAll("iframe");
          for (var j = 0; j < nestedIframes.length; j++) {
            var nested = nestedIframes[j];
            try {
              var nestedDoc = nested.contentDocument || (nested.contentWindow && nested.contentWindow.document);
              if (nestedDoc && nestedDoc.body) {
                setupObserverOnDoc(nestedDoc, "nested iframe: " + (nested.src || "").slice(0, 80));
              }
            } catch (e) {
              // ignore
            }
          }
        }
      } catch (e) {
        // ignore cross-origin iframe without --disable-web-security
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Диагностика доступа к iframe (CORS test)
  // ═══════════════════════════════════════════════════════════════════════
  function testIframeAccess() {
    var results = [];
    var iframes = document.querySelectorAll("iframe");
    for (var i = 0; i < iframes.length; i++) {
      var iframe = iframes[i];
      var result = {
        src: (iframe.src || "").slice(0, 120),
        accessible: false,
        hasVideo: false,
        error: null,
      };
      try {
        var doc =
          iframe.contentDocument ||
          (iframe.contentWindow && iframe.contentWindow.document);
        if (doc) {
          result.accessible = true;
          var videos = doc.querySelectorAll("video");
          result.hasVideo = videos.length > 0;
          result.videoCount = videos.length;
          result.hostname = doc.location?.hostname || "unknown";
        } else {
          result.error = "contentDocument is null";
        }
      } catch (e) {
        result.error = e.message || String(e);
        if (result.error.indexOf("Blocked") !== -1) {
          result.corsError = true;
        }
      }
      results.push(result);
    }

    window.__browserData.iframeAccess = results;
    window.__browserData.corsBlocked = results.some(function (r) {
      return r.corsError === true;
    });

    var accessible = results.filter(function (r) {
      return r.accessible;
    }).length;
    var withVideo = results.filter(function (r) {
      return r.hasVideo;
    }).length;
    log(
      "info",
      "Iframe access test: " +
        results.length +
        " iframes, " +
        accessible +
        " accessible, " +
        withVideo +
        " with video" +
        (window.__browserData.corsBlocked ? " (CORS BLOCKED!)" : " (CORS disabled)"),
    );

    if (window.__browserData.corsBlocked) {
      results.forEach(function (r) {
        if (r.corsError) {
          log("warn", "CORS blocked iframe: " + r.src, { error: r.error });
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Очистка всех Observer'ов
  // ═══════════════════════════════════════════════════════════════════
  function cleanupObservers() {
    for (var i = 0; i < observers.length; i++) {
      observers[i].disconnect();
    }
    observers.length = 0;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Инициализация
  // ═══════════════════════════════════════════════════════════════════
  function init() {
    log("info", "Preload script initializing");
    console.log("[BrowserPreload:D] init() called, readyState:", document.readyState);

    // Устанавливаем MutationObserver'ы на все фреймы
    setupObserversOnAllFrames();

    // Первичное сканирование
    var found = scanAllFrames();
    console.log("[BrowserPreload:D] Initial scan: video found =", found);

    // Обновляем title
    window.__browserData.title = document.title || "";

    if (found) {
      log("info", "Video found during initial scan");
    } else {
      log("info", "No video found during initial scan, waiting for dynamic changes");
    }

    // Диагностика доступа к iframe (CORS test)
    testIframeAccess();

    // Периодическая проверка (резервный механизм)
    pollTimer = setInterval(function () {
      if (!video) {
        log("debug", "Periodic re-scan (no video attached)");
        scanAllFrames();
      }
      // Обновляем состояние в любом случае
      updateBrowserData();
      window.__browserData.title = document.title || "";
    }, POLL_INTERVAL_MS);

    // Отмечаем, что инициализация завершена
    window.__browserData.initDone = true;
    log("info", "Preload script initialized");
  }

  // Стартуем, когда DOM готов
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
