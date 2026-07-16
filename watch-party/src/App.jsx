import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Room from "./pages/Room";

/**
 * Корневой компонент приложения.
 *
 * Маршруты:
 *   /              — домашняя страница (создание / вход в комнату)
 *   /room/:roomId  — комната просмотра
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<Room />} />
      </Routes>
    </BrowserRouter>
  );
}
