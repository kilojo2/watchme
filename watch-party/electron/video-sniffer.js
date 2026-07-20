/**
 * Video Sniffer — injected into <webview> via executeJavaScript() on dom-ready.
 *
 * Recursively scans the page (top-level + all cross-origin iframes) for
 * <video> elements and attaches listeners for play / pause / seeked.
 * Event data is sent back to the React layer through console.log()
 * as JSON strings tagged with source: "watchme-sniffer".
 *
 * webSecurity is disabled on the <webview>, so contentWindow.document
 * of cross-origin iframes is accessible.
 */
(function () {
  'use strict';

  /**
   * Find all <video> elements inside `root` that haven't been
   * tagged yet, tag them and return the list.
   */
  function findUntaggedVideos(root) {
    var videos = [];
    try {
      root.querySelectorAll('video:not([data-wms])').forEach(function (v) {
        v.setAttribute('data-wms', '1');
        videos.push(v);
      });
    } catch (_) {
      /* document not ready / cross-origin */
    }
    return videos;
  }

  /**
   * Scan the top-level document + all iframes recursively.
   */
  function scanAllFrames() {
    var found = [];
    try {
      found = found.concat(findUntaggedVideos(document));
    } catch (_) {}

    try {
      document.querySelectorAll('iframe').forEach(function (iframe) {
        try {
          if (iframe.contentWindow && iframe.contentWindow.document) {
            found = found.concat(
              findUntaggedVideos(iframe.contentWindow.document),
            );
          }
        } catch (_) {
          /* cross-origin iframe – shouldn't happen with webSecurity off */
        }
      });
    } catch (_) {}

    return found;
  }

  /**
   * Attach play / pause / seeked listeners and send events
   * back to the host via console.log.
   */
  function attachListeners(video) {
    // Store a direct reference on the top-level window so that
    // remote commands (play/pause/seek from React via executeJavaScript)
    // can find the <video> even when it lives inside a cross-origin iframe.
    try {
      window.top.__WATCHME_PLAYER = video;
    } catch (_) {}

    var send = function (eventName) {
      try {
        console.log(
          JSON.stringify({
            source: 'watchme-sniffer',
            event: eventName,
            time: video.currentTime,
            duration: video.duration,
            paused: video.paused,
          }),
        );
      } catch (_) {}
    };

    video.addEventListener('play', function () {
      send('play');
    });
    video.addEventListener('pause', function () {
      send('pause');
    });
    video.addEventListener('seeked', function () {
      send('seeked');
    });
  }

  // ── Global Keyboard Hotkeys ───────────────────────────────────────
  // These work even when the <webview> has focus, because they are
  // registered at the document level inside the webview itself.
  document.addEventListener('keydown', function (e) {
    var video = window.__WATCHME_PLAYER;
    if (!video) return;

    // Ignore if user is typing in an input / textarea / contenteditable
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement && document.activeElement.isContentEditable) {
      return;
    }

    switch (e.key) {
      case ' ': // Space → play / pause
        e.preventDefault();
        if (video.paused) { video.play(); } else { video.pause(); }
        break;

      case 'ArrowLeft': // ← → seek -5 s
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 5);
        // Fire the seeked event manually so the sniffer sends it
        // (setting currentTime triggers 'seeked' natively)
        break;

      case 'ArrowRight': // → → seek +5 s
        e.preventDefault();
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5);
        break;

      case 'f':
      case 'F': // F → fullscreen toggle
        e.preventDefault();
        try {
          console.log(JSON.stringify({
            source: 'watchme-sniffer',
            event: 'fullscreen',
          }));
        } catch (_) {}
        break;
    }
  });

  // ── Initial scan ─────────────────────────────────────────────────
  scanAllFrames().forEach(attachListeners);

  // ── Periodic re-scan (catches SPA navigations, dynamic inserts) ──
  setInterval(function () {
    scanAllFrames().forEach(attachListeners);
  }, 2000);
})();
