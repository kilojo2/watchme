# 🖥️ Tauri v2 Desktop Integration — WatchMe Setup Guide

> Превращает Vite + React + Firebase веб-приложение в нативное десктопное приложение
> для Windows, macOS и Linux с единой кодовой базой.

---

## 1. System Dependencies

### 1.1 Rust & rustup

Tauri v2 требует **Rust** (стабильный канал, версия ≥ 1.77).

```powershell
# Скачать и запустить rustup-init.exe:
# https://rustup.rs/
# Или через winget:
winget install --id Rustlang.Rustup

# После установки проверить:
rustc --version    # >= 1.77
cargo --version
rustup --version
```

> **Примечание:** После установки rustup может попросить перезапустить терминал,
> чтобы PATH обновился. Если `rustc` не найден — перезапустите VS Code / терминал.

### 1.2 Microsoft C++ Build Tools

На **Windows** Tauri требует компилятор MSVC (Microsoft Visual C++).

```powershell
# Вариант A — через Visual Studio Installer (рекомендуется):
# 1. Скачать Visual Studio Community: https://visualstudio.microsoft.com/downloads/
# 2. В установщике выбрать workload:
#    "Desktop development with C++" (Разработка классических приложений на C++)
# 3. В правой панели убедиться, что выбраны:
#    - MSVC v143 - VS 2022 C++ x64/x86 build tools
#    - Windows 10/11 SDK
#    - C++ CMake tools for Windows

# Вариант B — через winget (только Build Tools, без IDE):
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

> **Проверка:** В терминале должна работать команда `cl` (MSVC compiler).
> Если нет — запустите `Developer Command Prompt for VS 2022` из меню Пуск.

### 1.3 WebView2

На **Windows 10/11** WebView2 уже встроен в систему.

- **Windows 11**: предустановлен
- **Windows 10**: предустановлен (поставляется с обновлениями)
- **Windows 10 (старые сборки)**: [Evergreen WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)

Проверить установку:

```powershell
# Открыть любое приложение, использующее WebView2 (например, Microsoft Teams),
# или просто запустить edge WebView2 из меню Пуск.
```

### 1.4 Проверка macOS / Linux

Если вы собираете приложение **только для Windows** — шаги 1.2–1.3 достаточны.
Для кросс-платформенной сборки дополнительно:

```bash
# macOS — требуется Xcode CLI Tools:
xcode-select --install

# Linux — зависимости (Ubuntu/Debian):
sudo apt update && sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

---

## 2. Добавление Tauri в проект

```powershell
# Перейти в директорию проекта
cd e:\WatchMe\watch-party

# Установить Tauri CLI как dev-зависимость
npm install --save-dev @tauri-apps/cli@latest

# Установить Tauri API для фронтенда
npm install @tauri-apps/api@latest
```

> **Альтернатива:** Можно использовать `npm create tauri-app@latest` для интерактивного
> создания, но ручная установка даёт больше контроля над структурой.

---

## 3. Структура src-tauri

После установки CLI создайте вручную следующую структуру:

```
watch-party/
├── src-tauri/
│   ├── capabilities/
│   │   └── default.json          # Разрешения для окон
│   ├── src/
│   │   ├── main.rs                # Точка входа (Windows subsystem)
│   │   └── lib.rs                 # Логика Tauri Builder
│   ├── build.rs                   # Сборочный скрипт Cargo
│   ├── Cargo.toml                 # Rust-зависимости
│   └── tauri.conf.json            # Конфигурация Tauri
├── package.json
├── vite.config.js
└── ...
```

Все файлы генерируются автоматически ниже.  
После их создания выполните:

```powershell
# Убедиться, что всё скомпилируется
npx tauri info

# Запустить десктопное приложение в режиме разработки
npx tauri dev
```

---

## 4. Конфигурация (tauri.conf.json)

Основные настройки:

| Параметр | Значение | Описание |
|----------|----------|----------|
| `identifier` | `com.watchparty.app` | Уникальный ID приложения |
| `build.devUrl` | `http://localhost:5173` | URL Vite dev-сервера |
| `build.frontendDist` | `../dist` | Папка со сборкой для продакшена |
| `build.beforeDevCommand` | `npm run dev` | Команда перед dev-режимом |
| `build.beforeBuildCommand` | `npm run build` | Команда перед prod-сборкой |
| `app.windows[0].title` | `WatchMe — Watch Party` | Заголовок окна |

---

## 5. Скрипты в package.json

После установки добавьте в `package.json`:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "tauri": "tauri",
  "desktop:dev": "tauri dev",
  "desktop:build": "tauri build"
}
```

Использование:

```powershell
npm run desktop:dev      # Запустить десктоп-разработку (Vite + Tauri)
npm run desktop:build    # Собрать установщик (.exe / .msi / .AppImage / .dmg)
```

---

## 6. React + WebView2 — нужны ли изменения в коде?

**Нет, React-код не требует изменений для работы в WebView2.**

Причина: WebView2 использует **Chromium** (тот же движок, что и Chrome/Edge).
Все современные React-хуки, Firebase SDK, Tailwind CSS и Vite работают в WebView2
«из коробки» — никаких полифиллов или адаптации не требуется.

**Что нужно учесть:**

| Аспект | Статус |
|--------|--------|
| `useState`, `useEffect`, `useCallback` | ✅ Работают без изменений |
| Firebase Auth (anon sign-in) | ✅ Работает (WebView2 хранит cookies/IndexedDB) |
| Firebase Realtime Database | ✅ Работает (WebSocket / long-polling) |
| YouTube IFrame API | ✅ Работает (WebView2 загружает iframe) |
| Tailwind CSS | ✅ Работает (чистый CSS, без изменений) |
| Local Storage | ✅ Доступен (как в браузере) |
| Vite HMR | ✅ Работает через devServer |
| `window.open()` / `window.location` | ⚠️ Ведите через Tauri Shell API |
| Файловая система | ⚠️ Используйте `@tauri-apps/plugin-fs` |
| Нативные диалоги | ⚠️ Используйте `@tauri-apps/plugin-dialog` |

**Когда могут понадобиться изменения (не для MVP):**

- **Глубокие ссылки**: открытие `watchme://room/abc123` — потребуется Deep Link API
- **Уведомления**: нативные toast/notification — потребуется Notification API
- **Оффлайн-кеш**: Service Workers работают, но требуют настройки
- **Системный трей**: иконка в трее — потребуется Tray API

**Рекомендация:** Для MVP React-код остаётся без изменений.
Всю нативную функциональность можно добавить позже через Tauri плагины.

---

## 7. Сборка установщика

```powershell
# Продакшен-сборка (создаст .exe/.msi в src-tauri/target/release/bundle/)
npm run desktop:build
```

Артефакты сборки:

| Платформа | Формат | Путь |
|-----------|--------|------|
| Windows | `.msi` | `src-tauri/target/release/bundle/msi/` |
| Windows | `.exe` (NSIS) | `src-tauri/target/release/bundle/nsis/` |
| macOS | `.dmg` | `src-tauri/target/release/bundle/dmg/` |
| Linux | `.AppImage` | `src-tauri/target/release/bundle/appimage/` |
| Linux | `.deb` | `src-tauri/target/release/bundle/deb/` |

---

## 8. Полезные команды

```powershell
npx tauri --help            # Справка по CLI
npx tauri info              # Информация о системе и зависимостях
npx tauri dev               # Запуск в режиме разработки
npx tauri build             # Сборка установщика
npx tauri icon ./icon.png   # Генерация иконок из PNG
npx tauri plugin add        # Добавление плагина
```

---

## 9. Troubleshooting

### "MSVC toolchain is not installed"

```powershell
# Установите Visual Studio Build Tools с C++ workload
# Или запустите из "Developer Command Prompt for VS 2022"
```

### "WebView2 runtime is not found"

```powershell
# На Windows 10/11 — установите Evergreen WebView2 Runtime:
# https://developer.microsoft.com/microsoft-edge/webview2/
```

### "Cargo build failed"

```powershell
# Очистить кеш Cargo и пересобрать
cd src-tauri && cargo clean && cd ..
npx tauri build
```

### "Permission denied" на Linux

```bash
sudo apt update && sudo apt install -y libwebkit2gtk-4.1-dev
```
