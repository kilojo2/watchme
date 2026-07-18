use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, WebviewBuilder};

/// Shared state between polling iterations and their callbacks.
#[derive(Default)]
struct BrowserSnapshot {
    last_video_found: bool,
    last_is_playing: bool,
    last_current_time: f64,
    last_video_urls: Vec<String>,
    last_frame_count: usize,
}

// ── Commands ─────────────────────────────────────────────────────

/// Создаёт дочерний Webview (встроенный браузер) внутри главного окна.
///
/// Вместо `on_web_resource_request` (не работает для внешних URL в Tauri v2)
/// использует `on_page_load` + `eval_with_callback` для периодического
/// опроса состояния страницы (видео-элементы, URL запросов).
#[tauri::command]
async fn create_browser_webview(
    app: tauri::AppHandle,
    url: String,
    label: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(), String> {
    println!(
        "[Rust] create_browser_webview: url={}, label={}, pos=({},{}), size=({},{})",
        url, label, x, y, w, h
    );

    // Preload-скрипт
    let preload = include_str!("../preload/browser-preload.js");
    println!("[Rust] Preload script length: {} bytes", preload.len());

    // Получаем главное окно
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let parsed_url =
        url::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;

    // Флаг остановки поллинга (устанавливается при уничтожении webview)
    let stop_polling = Arc::new(AtomicBool::new(false));

    // Флаг: запущен ли уже поллинг? (on_page_load может вызваться многократно)
    let poll_started = Arc::new(AtomicBool::new(false));
    let app_for_poll = app.clone();
    let label_for_poll = label.clone();
    let stop_polling_clone = stop_polling.clone();
    let poll_started_clone = poll_started.clone();

    // Флаг для диагностики: был ли вызван on_page_load
    let page_loaded = Arc::new(AtomicBool::new(false));
    let page_loaded_diag = page_loaded.clone();

    println!(
        "[Rust] Building webview '{}' with on_page_load callback", label
    );

    // ── Строим WebviewBuilder ──────────────────────────────────────
    let mut builder = WebviewBuilder::new(&label, tauri::WebviewUrl::External(parsed_url))
        .initialization_script(preload);

    // ═══════════════════════════════════════════════════════════════
    // Windows: отключаем веб-защиту для доступа к кросс-доменным iframe
    // ═══════════════════════════════════════════════════════════════
    //
    // Без этих флагов WebView2 блокирует доступ к contentDocument
    // iframe, загружающих контент с другого origin (CORS).
    // Это необходимо для парсинга <video>-элементов внутри сторонних
    // плееров (Bazon, Collaps, VideoDB и т.д.).
    //
    // Флаги:
    //   --disable-web-security           — отключает Same-Origin Policy
    //   --disable-site-isolation-trials  — отключает изоляцию сайтов
    //   --user-data-dir                  — отдельный профиль (обязателен
    //                                      при отключении безопасности)
    //   --allow-running-insecure-content — разрешает mixed content
    //
    // Каждый экземпляр браузера получает свою директорию профиля
    // (watchme-browser-{label}) внутри временной папки ОС.
    #[cfg(target_os = "windows")]
    {
        let mut data_dir = std::env::temp_dir();
        data_dir.push(format!("watchme-browser-{}", label));
        let _ = std::fs::create_dir_all(&data_dir);

        let args = format!(
            "--disable-web-security --disable-site-isolation-trials --allow-running-insecure-content --user-data-dir=\"{}\"",
            data_dir.display()
        );
        println!("[Rust] 🛡️ Browser webview additional args: {}", args);
        builder = builder.additional_browser_args(&args);
    }

    // ═══════════════════════════════════════════════════════════════
    // on_page_load — запускает поллинг и инжект сниффера
    // ═══════════════════════════════════════════════════════════════
    let builder = builder.on_page_load(move |webview, payload| {
            page_loaded_diag.store(true, Ordering::Relaxed);
            println!("[Rust] 🔥 Page load event FIRED: {}", payload.url());

            // Запускаем sniffer + поллинг ТОЛЬКО один раз (при первой загрузке)
            if poll_started_clone.swap(true, Ordering::Relaxed) {
                return; // Уже запущено — игнорируем повторные вызовы
            }

            // 1. Инжектим JS для перехвата fetch/XHR (network sniffing на JS-уровне)
            let sniff_js = r#"
                (function() {
                    if (window.__browserSnifferInstalled) return;
                    window.__browserSnifferInstalled = true;
                    window.__browserData = window.__browserData || {};
                    window.__browserData.videoUrls = window.__browserData.videoUrls || [];

                    var VIDEO_PATTERNS = [
                        '.m3u8', '.mp4', '.webm', 'videoplayback',
                        '.m3u8?', '/hls/', '/manifest/', '/playlist.',
                        'dash.', '.mpd', '/master', 'playlist_url',
                        'video_url', 'stream', '/player', '.m3u',
                        'media/', 'content/', '/embed'
                    ];

                    function isVideoUrl(urlStr) {
                        if (!urlStr || typeof urlStr !== 'string') return false;
                        for (var i = 0; i < VIDEO_PATTERNS.length; i++) {
                            if (urlStr.indexOf(VIDEO_PATTERNS[i]) !== -1) return true;
                        }
                        return false;
                    }

                    function addVideoUrl(urlStr) {
                        if (isVideoUrl(urlStr) && window.__browserData.videoUrls.indexOf(urlStr) === -1) {
                            window.__browserData.videoUrls.push(urlStr);
                            console.log('[BrowserSniffer] 🎬', urlStr.slice(0, 120));
                        }
                    }

                    // Override fetch
                    var origFetch = window.fetch;
                    window.fetch = function(url, init) {
                        var urlStr = (typeof url === 'string' ? url : (url && url.url) || '').toString();
                        addVideoUrl(urlStr);
                        return origFetch.call(this, url, init);
                    };

                    // Override XMLHttpRequest
                    var origOpen = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function(method, url) {
                        var urlStr = (typeof url === 'string' ? url : url.toString());
                        addVideoUrl(urlStr);
                        return origOpen.apply(this, arguments);
                    };

                    console.log('[BrowserSniffer] Network sniffing installed');
                })();
            "#;
            let _ = webview.eval(sniff_js);

            // 2. Запускаем поллинг с eval_with_callback (с задержкой для загрузки страницы)
            let app_poll = app_for_poll.clone();
            let label_poll = label_for_poll.clone();
            let stop = stop_polling_clone.clone();

            std::thread::spawn(move || {
                // Даём странице время на загрузку + выполнение preload-скрипта
                std::thread::sleep(std::time::Duration::from_secs(2));

                let shared = Arc::new(Mutex::new(BrowserSnapshot::default()));

                println!("[Rust] Polling started for webview: {}", label_poll);

                loop {
                    // Проверяем, не пора ли остановиться
                    if stop.load(Ordering::Relaxed) {
                        break;
                    }

                    std::thread::sleep(std::time::Duration::from_millis(500));

                    // Проверяем, жив ли ещё webview
                    let window = match app_poll.get_window("main") {
                        Some(w) => w,
                        None => {
                            println!("[Rust] Main window gone, stopping poll for {}", label_poll);
                            break;
                        }
                    };
                    let webview = match window.get_webview(&label_poll) {
                        Some(w) => w,
                        None => {
                            println!("[Rust] Webview '{}' gone, stopping poll", label_poll);
                            break;
                        }
                    };

                    let poll_js = r#"
                        (function() {
                            var d = window.__browserData || {};
                            var videos = document.querySelectorAll('video');
                            var videoInfo = null;
                            if (videos.length > 0) {
                                var v = videos[0];
                                videoInfo = {
                                    found: true,
                                    src: v.src || v.currentSrc || '',
                                    duration: v.duration || 0,
                                    currentTime: v.currentTime || 0,
                                    paused: v.paused,
                                    readyState: v.readyState
                                };
                            }
                            var frames = [];
                            var allIframes = document.querySelectorAll('iframe');
                            for (var i = 0; i < allIframes.length; i++) {
                                var f = allIframes[i];
                                frames.push({
                                    src: f.src || '',
                                    id: f.id || '',
                                    className: (f.className || '').slice(0, 100),
                                    width: f.width,
                                    height: f.height
                                });
                            }
                            // ── Iframe access diagnostics (CORS test) ──
                            // Заполняется preload-скриптом в testIframeAccess()
                            // Если --disable-web-security работает, все iframe
                            // должны быть accessible: true
                            var iframeAccess = d.iframeAccess || [];
                            var corsBlocked = d.corsBlocked || false;

                            return JSON.stringify({
                                videoUrls: d.videoUrls || [],
                                video: videoInfo,
                                frames: frames,
                                title: document.title || '',
                                iframeAccess: iframeAccess,
                                corsBlocked: corsBlocked
                            });
                        })();
                    "#;

                    let state = shared.clone();
                    let app_emit = app_poll.clone();

                    let _ = webview.eval_with_callback(poll_js.to_string(), move |result| {
                        if result.is_empty() || result == "null" || result == "undefined" {
                            return;
                        }

                        let data: serde_json::Value = match serde_json::from_str(&result) {
                            Ok(v) => v,
                            Err(_) => return,
                        };

                        let mut snap = match state.lock() {
                            Ok(s) => s,
                            Err(_) => return,
                        };

                        // ── Video URLs (network sniffing) ──
                        if let Some(urls) = data.get("videoUrls").and_then(|u| u.as_array()) {
                            let current: Vec<String> = urls
                                .iter()
                                .filter_map(|u| u.as_str().map(String::from))
                                .collect();

                            for url_str in &current {
                                if !snap.last_video_urls.contains(url_str) {
                                    println!("[Rust] 🎬 Video URL: {}", url_str);
                                    let _ = app_emit.emit(
                                        "browser-video-url",
                                        serde_json::json!({"url": url_str}),
                                    );
                                }
                            }
                            snap.last_video_urls = current;
                        }

                        // ── Video element state ──
                        if let Some(video) = data.get("video") {
                            let found = video
                                .get("found")
                                .and_then(|f| f.as_bool())
                                .unwrap_or(false);
                            let paused = video
                                .get("paused")
                                .and_then(|p| p.as_bool())
                                .unwrap_or(true);
                            let current_time = video
                                .get("currentTime")
                                .and_then(|c| c.as_f64())
                                .unwrap_or(0.0);
                            let src = video
                                .get("src")
                                .and_then(|s| s.as_str())
                                .unwrap_or("")
                                .to_string();

                            let is_playing = found && !paused;

                            // Video appeared
                            if found && !snap.last_video_found {
                                println!("[Rust] 🎥 Video found (src={})", src);
                                let _ = app_emit.emit(
                                    "browser-video-found",
                                    serde_json::json!({"found": true, "src": src}),
                                );
                            }
                            // Video disappeared
                            if !found && snap.last_video_found {
                                println!("[Rust] 🎥 Video lost");
                                let _ = app_emit.emit(
                                    "browser-video-found",
                                    serde_json::json!({"found": false}),
                                );
                            }

                            if found {
                                // Started playing
                                if is_playing && !snap.last_is_playing {
                                    println!("[Rust] ▶ Play at {}", current_time);
                                    let _ = app_emit.emit(
                                        "browser-video-play",
                                        serde_json::json!({"currentTime": current_time}),
                                    );
                                }
                                // Paused
                                if !is_playing && snap.last_is_playing {
                                    println!("[Rust] ⏸ Pause at {}", current_time);
                                    let _ = app_emit.emit(
                                        "browser-video-pause",
                                        serde_json::json!({"currentTime": current_time}),
                                    );
                                }
                                // Seek (time jump > 2s)
                                if found
                                    && (current_time - snap.last_current_time).abs() > 2.0
                                    && is_playing == snap.last_is_playing
                                {
                                    println!("[Rust] ⏩ Seek to {}", current_time);
                                    let _ = app_emit.emit(
                                        "browser-video-seek",
                                        serde_json::json!({"currentTime": current_time}),
                                    );
                                }

                                snap.last_current_time = current_time;
                            }

                            snap.last_video_found = found;
                            snap.last_is_playing = is_playing;
                        }

                        // ── Frame info ──
                        if let Some(frames) = data.get("frames").and_then(|f| f.as_array()) {
                            if frames.len() != snap.last_frame_count {
                                let _ = app_emit.emit(
                                    "browser-frame-info",
                                    serde_json::json!({"frames": frames}),
                                );
                                snap.last_frame_count = frames.len();
                            }
                        }

                        // ── Iframe access diagnostic (CORS test) ──
                        if let Some(access) = data.get("iframeAccess").and_then(|a| a.as_array()) {
                            let cors_blocked = data
                                .get("corsBlocked")
                                .and_then(|c| c.as_bool())
                                .unwrap_or(false);
                            if cors_blocked {
                                // Если CORS всё ещё блокирует — выводим детали
                                let blocked: Vec<&str> = access
                                    .iter()
                                    .filter_map(|entry| {
                                        let acc = entry.get("accessible").and_then(|a| a.as_bool()).unwrap_or(false);
                                        if !acc {
                                            entry.get("src").and_then(|s| s.as_str())
                                        } else {
                                            None
                                        }
                                    })
                                    .collect();
                                if !blocked.is_empty() {
                                    println!("[Rust] ⚠️ CORS still blocking {} iframe(s): {:?}", blocked.len(), blocked);
                                }
                            } else if access.len() > 0 {
                                let accessible_count = access
                                    .iter()
                                    .filter(|entry| entry.get("accessible").and_then(|a| a.as_bool()).unwrap_or(false))
                                    .count();
                                println!(
                                    "[Rust] 🔓 Iframe access: {}/{} accessible (CORS disabled)",
                                    accessible_count,
                                    access.len()
                                );
                            }
                        }
                    });
                }

                println!("[Rust] Polling stopped for webview: {}", label_poll);
            });
        });

    // Позиционируем
    let position = tauri::LogicalPosition::new(x, y);
    let size = tauri::LogicalSize::new(w, h);

    println!("[Rust] Calling window.add_child()...");
    window
        .add_child(builder, position, size)
        .map_err(|e| format!("Failed to create child webview: {}", e))?;
    println!("[Rust] Child webview created successfully!");

    // ── Diagnostic: таймаут 10s для проверки, сработал ли on_page_load ──
    let app_diag = app.clone();
    let label_diag = label.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(10));

        if !page_loaded.load(Ordering::Relaxed) {
            println!(
                "[Rust] ⚠️ DIAGNOSTIC: on_page_load did NOT fire for '{}' within 10s!",
                label_diag
            );
            let _ = app_diag.emit(
                "browser-diagnostic",
                serde_json::json!({
                    "type": "on_page_load_timeout",
                    "label": label_diag,
                    "message": "on_page_load callback never fired. This may mean Tauri v2 doesn't fire page load events for child webviews with external URLs."
                }),
            );
        } else {
            println!(
                "[Rust] ✓ DIAGNOSTIC: on_page_load fired for '{}' within 10s",
                label_diag
            );
        }
    });

    Ok(())
}

/// Выполняет JavaScript в дочернем webview (для remote-команд).
#[tauri::command]
async fn eval_in_browser(
    app: tauri::AppHandle,
    label: String,
    js: String,
) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let webview = window
        .get_webview(&label)
        .ok_or_else(|| format!("Webview '{}' not found", &label))?;

    webview
        .eval(js)
        .map_err(|e| format!("Failed to eval JS: {}", e))
}

/// Закрывает (уничтожает) дочерний Webview по его label.
#[tauri::command]
async fn close_browser_webview(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let webview = window
        .get_webview(&label)
        .ok_or_else(|| format!("Webview '{}' not found", &label))?;

    webview.close().map_err(|e| format!("Failed to close webview: {}", e))?;

    Ok(())
}

/// Изменяет позицию и/или размер дочернего Webview.
#[tauri::command]
async fn resize_browser_webview(
    app: tauri::AppHandle,
    label: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let webview = window
        .get_webview(&label)
        .ok_or_else(|| format!("Webview '{}' not found", &label))?;

    webview
        .set_position(tauri::LogicalPosition::new(x, y))
        .map_err(|e| format!("Failed to reposition: {}", e))?;

    webview
        .set_size(tauri::LogicalSize::new(w, h))
        .map_err(|e| format!("Failed to resize: {}", e))?;

    Ok(())
}

/// Загружает новый URL в дочернем Webview.
#[tauri::command]
async fn navigate_browser_webview(
    app: tauri::AppHandle,
    label: String,
    url: String,
) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let webview = window
        .get_webview(&label)
        .ok_or_else(|| format!("Webview '{}' not found", &label))?;

    let parsed_url = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;

    webview
        .navigate(parsed_url)
        .map_err(|e| format!("Failed to navigate: {}", e))?;

    Ok(())
}

// ── App entry point ───────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            create_browser_webview,
            close_browser_webview,
            resize_browser_webview,
            navigate_browser_webview,
            eval_in_browser,
        ])
        .setup(|app| {
            // ── Флаги безопасности для дочернего webview ─────────────
            //
            // Флаги WebView2 (--disable-web-security, --disable-site-isolation-trials)
            // теперь устанавливаются через WebviewBuilder::additional_browser_args()
            // в create_browser_webview() для каждого дочернего webview индивидуально.
            //
            // Это предпочтительнее глобальной env-переменной
            // WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS, так как:
            //   1. Действует ТОЛЬКО на дочерний browser webview, не затрагивая главное окно
            //   2. Каждый экземпляр получает отдельный --user-data-dir
            //   3. Не зависит от времени создания WebView2 Environment

            #[cfg(debug_assertions)]
            {
                let webview_window = app.get_webview_window("main").unwrap();
                webview_window.open_devtools();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
