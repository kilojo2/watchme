import { useEffect, useCallback } from "react";
import { ref, onValue, set, update, get, serverTimestamp, increment } from "firebase/database";
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
 * useRoom — управление комнатой: создание, вступление, выход, удаление.
 *
 * ## Логика
 *
 * - **Создание комнаты**: записывает hostId + участника в Firebase.
 * - **Вступление**: добавляет { uid: { name, joinedAt } } в members.
 * - **Выход**: удаляет участника из members; если он был последним — комнату.
 * - **Удаление**: стирает всю комнату и запись в publicRooms.
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
 *   deleteRoom: () => Promise<void>,
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

    // Increment memberCount in publicRooms index (silently skip if room is private)
    try {
      await update(ref(database, `publicRooms/${roomId}`), {
        memberCount: increment(1),
      });
    } catch {
      // private room — no publicRooms node exists
    }
  }, [roomId, user, displayName]);

  // ================================================================
  // Удаление комнаты (хоcт или авто-очистка)
  // ================================================================
  const deleteRoom = useCallback(async () => {
    if (!roomId) return;

    // Удаляем основные данные комнаты
    const roomRef = ref(database, `rooms/${roomId}`);
    await set(roomRef, null);

    // Удаляем запись из publicRooms, если есть
    try {
      const publicRef = ref(database, `publicRooms/${roomId}`);
      await set(publicRef, null);
    } catch {
      // private room — нет записи в publicRooms
    }
  }, [roomId]);

  // ================================================================
  // Выход из комнаты (удаляем себя из members)
  // Если после выхода в комнате никого не осталось — удаляем её.
  // ================================================================
  const leaveRoom = useCallback(async () => {
    if (!user || !roomId) return;

    const memberRef = ref(database, `rooms/${roomId}/members/${user.uid}`);
    await set(memberRef, null); // удаляем узел участника

    // Decrement memberCount in room data
    await update(ref(database, `rooms/${roomId}`), {
      memberCount: increment(-1),
    });

    // Decrement memberCount in publicRooms index (silently skip if room is private)
    try {
      await update(ref(database, `publicRooms/${roomId}`), {
        memberCount: increment(-1),
      });
    } catch {
      // private room — no publicRooms node exists
    }

    // Проверяем, остались ли ещё участники в комнате
    try {
      const membersSnapshot = await get(ref(database, `rooms/${roomId}/members`));
      if (!membersSnapshot.exists()) {
        // Последний вышел — удаляем комнату целиком
        await deleteRoom();
      }
    } catch {
      // Если комната уже удалена или ошибка чтения — игнорируем
    }
  }, [roomId, user, deleteRoom]);

  return { createRoom, joinRoom, leaveRoom, deleteRoom };
}
