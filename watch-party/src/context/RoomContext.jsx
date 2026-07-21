import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { ref, set, push, serverTimestamp, onValue } from "firebase/database";
import { database } from "../lib/firebase";
import useAuth from "../hooks/useAuth";
import useRoom from "../hooks/useRoom";

/**
 * RoomContext — провайдер состояния комнаты для всего дерева компонентов.
 *
 * Предоставляет:
 * - user (auth)
 * - displayName (отображаемое имя из useAuth)
 * - roomData (текущее состояние комнаты из Firebase)
 * - createRoom / joinRoom / leaveRoom
 * - messages (чат)
 * - sendMessage
 * - updateDisplayName (синхронизирует в Firebase Auth + localStorage + RTDB)
 *
 * Использование:
 *   const { user, displayName, roomData, messages, sendMessage } = useRoomContext();
 */
const RoomContext = createContext(null);

export function RoomProvider({ roomId, children }) {
  // Auth — получаем displayName и updateDisplayName (для Firebase Auth + localStorage)
  const {
    user,
    displayName,
    loading: authLoading,
    updateDisplayName: updateAuthDisplayName,
  } = useAuth();

  // State для данных комнаты
  const [roomData, setRoomData] = useState(null);

  // State для сообщений чата
  const [messages, setMessages] = useState([]);

  // Callback для получения данных из useRoom
  const handleRoomData = useCallback((data) => {
    setRoomData(data);
  }, []);

  // Room management — передаём displayName отдельно (не полагаемся на user.displayName)
  const { createRoom, joinRoom, leaveRoom, deleteRoom } = useRoom(
    roomId,
    user,
    displayName,
    handleRoomData,
  );

  // ================================================================
  // Автоматически создаём/вступаем в комнату после авторизации
  // ================================================================
  const hasJoined = useRef(false);

  useEffect(() => {
    if (authLoading || !user || !roomId || hasJoined.current) return;

    // Пытаемся создать комнату. Если она уже существует — set перезапишет.
    // Но нам нужно проверить, существует ли она, и если да — просто вступить.
    const joinOrCreate = async () => {
      try {
        // Сначала проверяем, есть ли уже комната
        const roomRef = ref(database, `rooms/${roomId}`);

        // Используем разовое чтение через onValue (onlyOnce auto-unsubscribes)
        const checkRoom = new Promise((resolve) => {
          onValue(roomRef, (snap) => {
            resolve(snap.exists());
          }, { onlyOnce: true });
        });

        const exists = await checkRoom;

        if (!exists) {
          await createRoom();
        } else {
          await joinRoom();
        }

        hasJoined.current = true;
      } catch (err) {
        console.error("RoomContext: failed to join/create room", err);
      }
    };

    joinOrCreate();
  }, [authLoading, user, roomId, createRoom, joinRoom]);

  // ================================================================
  // Подписка на сообщения чата
  // ================================================================
  useEffect(() => {
    if (!roomId) return;

    const messagesRef = ref(database, `rooms/${roomId}/messages`);

    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setMessages([]);
        return;
      }

      const messagesList = Object.entries(data).map(([key, msg]) => ({
        id: key,
        ...msg,
      }));

      messagesList.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      setMessages(messagesList);
    });

    return () => unsubscribe();
  }, [roomId]);

  // ================================================================
  // Отправка сообщения (используем displayName из useAuth)
  // ================================================================
  const sendMessage = useCallback(
    async (text) => {
      if (!user || !roomId || !text.trim()) return;

      const messagesRef = ref(database, `rooms/${roomId}/messages`);

      await push(messagesRef, {
        uid: user.uid,
        name: displayName, // берём из useAuth, а не user.displayName
        text: text.trim(),
        timestamp: serverTimestamp(),
      });
    },
    [roomId, user, displayName],
  );

  // ================================================================
  // Обновление имени пользователя
  //   — обновляет Firebase Auth profile (через useAuth)
  //   — сохраняет в localStorage (через useAuth)
  //   — обновляет узел в Firebase RTDB: /rooms/{roomId}/members/{uid}/name
  // ================================================================
  const updateDisplayName = useCallback(
    async (newName) => {
      if (!user || !roomId || !newName?.trim()) return;

      const trimmed = newName.trim();

      // 1. Обновляем Firebase Auth + localStorage
      await updateAuthDisplayName(trimmed);

      // 2. Обновляем Firebase RTDB
      const memberRef = ref(database, `rooms/${roomId}/members/${user.uid}/name`);
      await set(memberRef, trimmed);
    },
    [roomId, user, updateAuthDisplayName],
  );

  const value = {
    user,
    displayName,
    authLoading,
    roomData,
    messages,
    createRoom,
    joinRoom,
    leaveRoom,
    deleteRoom,
    sendMessage,
    updateDisplayName,
    hasJoined: hasJoined.current,
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

/**
 * Хук для доступа к контексту комнаты.
 */
export function useRoomContext() {
  const ctx = useContext(RoomContext);
  if (!ctx) {
    throw new Error("useRoomContext must be used within a RoomProvider");
  }
  return ctx;
}

export default RoomContext;
