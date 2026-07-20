import { HashRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Room from "./pages/Room";

/**
 * Корневой компонент приложения.
 *
 * Маршруты:
 *   /              — домашняя страница (создание / вход в комнату)
 *   /room/:roomId  — комната просмотра
 *
 * ⚠️  Используем HashRouter вместо BrowserRouter, потому что
 *     в packaged Electron-сборке файл загружается через
 *     win.loadFile(), и window.location.pathname содержит
 *     полный путь файловой системы (C:/.../dist/index.html).
 *     BrowserRouter пытается сопоставить этот путь с маршрутами
 *     и выбрасывает "No routes matched location".
 *     HashRouter использует #/path, что корректно работает
 *     с file:// протоколом.
 */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<Room />} />
      </Routes>
    </HashRouter>
  );
}
