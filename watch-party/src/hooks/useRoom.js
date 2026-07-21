import { useEffect, useCallback } from "react";
import { ref, onValue, set, update, serverTimestamp, increment } from "firebase/database";
import { database, getRoomRef } from "../lib/firebase";

/**
 * Получает публичный IP-адрес пользователя через бесплатное API.
 * При ошибке возвращает "unknown".
 */
async function getPublicIp() {
  try {
    const resp = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(5000),
    });
    const data = await resp.json();
    return data.ip || "unknown";
  } catch (err) {
    console.warn("[useRoom] Failed to fetch public IP:", err);
    return "unknown";
  }
}

/**
 * useRoom — управление комнатой: создание, вступление, выход.
 *
 * ## Логика
 *
 * - **Создание комнаты**: записывает hostId + участника в Firebase.
 * - **Вступление**: добавляет { uid: { name, joinedAt } } в members.
 * - **Выход**: удаляет участника из members.
 * - **Подписка**: слушает изменения комнаты (статус, участники).
 *
 * @param {string} roomId — ID комнаты
 * @param {object} user — Firebase auth user (uid)
 * @param {string} displayName — отображаемое имя (из useAuth, не из user.displayName)
 * @param {function} onRoomData — callback с данными комнаты
 * @returns {{
 *   createRoom: () => Promise<void>,
 *   joinRoom: () => Promise<void>,
 *   leaveRoom: () => Promise<void>,
 * }}
 */
export default function useRoom(roomId, user, displayName, onRoomData) {
  // ================================================================
  // Подписка на данные комнаты
  // ================================================================
  useEffect(() => {
    if (!roomId) return;

    const roomRef = getRoomRef(roomId);

    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (onRoomData) {
        onRoomData(data);
      }
    });

    return () => unsubscribe();
  }, [roomId, onRoomData]);

  // ================================================================
  // Создание комнаты (создатель становится host)
  // ================================================================
  const createRoom = useCallback(async () => {
    if (!user || !roomId) return;

    const roomRef = getRoomRef(roomId);
    const ip = await getPublicIp();

    const roomData = {
      hostId: user.uid,
      currentVideoId: "",
      playerType: "youtube",
      status: "idle",
      lastPosition: 0,
      updatedAt: serverTimestamp(),
      members: {
        [user.uid]: {
          name: displayName || "Anonymous",
          ip: ip,
          joinedAt: serverTimestamp(),
        },
      },
    };

    // Используем set() — если комната уже существует, перезапишем
    await set(roomRef, roomData);
  }, [roomId, user, displayName]);

  // ================================================================
  // Вступление в существующую комнату
  // ================================================================
  const joinRoom = useCallback(async () => {
    if (!user || !roomId) return;

    const memberRef = ref(database, `rooms/${roomId}/members/${user.uid}`);
    const ip = await getPublicIp();

    await set(memberRef, {
      name: displayName || "Anonymous",
      ip: ip,
      joinedAt: serverTimestamp(),
    });

    // Increment memberCount in room data
    await update(ref(database, `rooms/${roomId}`), {
      memberCount: increment(1),
    });

    // Increment memberCount in publicRooms index if it exists
    await update(ref(database, `publicRooms/${roomId}`), {
      memberCount: increment(1),
    });
  }, [roomId, user, displayName]);

  // ================================================================
  // Выход из комнаты (удаляем себя из members)
  // ================================================================
  const leaveRoom = useCallback(async () => {
    if (!user || !roomId) return;

    const memberRef = ref(database, `rooms/${roomId}/members/${user.uid}`);
    await set(memberRef, null); // удаляем узел

    // Decrement memberCount in room data
    await update(ref(database, `rooms/${roomId}`), {
      memberCount: increment(-1),
    });

    // Decrement memberCount in publicRooms index if it exists
    await update(ref(database, `publicRooms/${roomId}`), {
      memberCount: increment(-1),
    });
  }, [roomId, user]);

  return { createRoom, joinRoom, leaveRoom };
}
