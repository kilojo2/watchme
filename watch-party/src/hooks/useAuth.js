import { useEffect, useState, useCallback } from "react";
import {
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { auth } from "../lib/firebase";

const STORAGE_KEY = "watchparty_displayName";

/**
 * Генерирует случайное читаемое имя для анонимного пользователя.
 * Формат: Прилагательное + Существительное, например "BravePanda42"
 */
function generateGuestName() {
  const adjectives = [
    "Brave", "Cool", "Fast", "Happy", "Lucky", "Smart", "Wild",
    "Bold", "Calm", "Epic", "Funky", "Gold", "Jolly", "Neon",
    "Pixel", "Sharp", "Swift", "Turbo", "Vivid", "Zen",
  ];
  const nouns = [
    "Panda", "Tiger", "Eagle", "Fox", "Wolf", "Bear", "Hawk",
    "Lynx", "Owl", "Deer", "Falcon", "Phoenix", "Raven", "Lion",
    "Dolphin", "Koala", "Badger", "Viper", "Moose", "Otter",
  ];

  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 100);

  return `${adj}${noun}${num}`;
}

/**
 * useAuth — управление анонимной аутентификацией через Firebase.
 *
 * ## Логика
 *
 * 1. При монтировании подписываемся на onAuthStateChanged.
 * 2. Если пользователь не авторизован — автоматически входим анонимно.
 * 3. При первом входе генерируем случайное имя (displayName)
 *    через updateProfile и сохраняем в localStorage.
 * 4. displayName возвращается как отдельное поле (не полагаемся на
 *    user.displayName из Firebase Auth, т.к. анонимные юзеры могут
 *    не сохранять displayName между сессиями).
 * 5. updateDisplayName(newName) синхронизирует имя в Firebase Auth,
 *    localStorage и возвращает управление.
 *
 * @returns {{
 *   user: import("firebase/auth").User | null,
 *   loading: boolean,
 *   displayName: string,
 *   login: () => Promise<void>,
 *   logout: () => Promise<void>,
 *   updateDisplayName: (name: string) => Promise<void>,
 * }}
 */
export default function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Локальное состояние имени — инициализируем из localStorage
  const [displayName, setDisplayName] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });

  // ================================================================
  // Подписка на изменение статуса аутентификации
  // ================================================================
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
      } else {
        setUser(null);
        // При выходе чистим локальное имя — при следующем входе
        // будет сгенерировано новое (или восстановлено из localStorage)
        setDisplayName(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ================================================================
  // Автоматический анонимный вход + генерация имени
  // ================================================================
  useEffect(() => {
    if (!loading && !user) {
      signInAnonymously(auth)
        .then(async (cred) => {
          const fbUser = cred.user;

          // Пробуем восстановить имя из localStorage
          let savedName = null;
          try {
            savedName = localStorage.getItem(STORAGE_KEY);
          } catch {
            // ignore
          }

          if (savedName) {
            // Имя уже есть в localStorage — применяем к Firebase Auth
            // (на случай, если это новый аккаунт после удаления старого)
            if (fbUser.displayName !== savedName) {
              await updateProfile(fbUser, { displayName: savedName });
            }
            setDisplayName(savedName);
          } else {
            // Первый вход — генерируем новое имя
            const generatedName = generateGuestName();
            await updateProfile(fbUser, { displayName: generatedName });
            try {
              localStorage.setItem(STORAGE_KEY, generatedName);
            } catch {
              // ignore
            }
            setDisplayName(generatedName);
          }
        })
        .catch((err) => {
          console.error("useAuth: anonymous sign-in failed", err);
        });
    }
  }, [loading, user]);

  // ================================================================
  // Явный вход (если нужна кнопка «Войти»)
  // ================================================================
  const login = useCallback(async () => {
    try {
      const cred = await signInAnonymously(auth);
      const fbUser = cred.user;

      // Аналогичная логика генерации имени при явном входе
      let savedName = null;
      try {
        savedName = localStorage.getItem(STORAGE_KEY);
      } catch {
        // ignore
      }

      if (savedName) {
        if (fbUser.displayName !== savedName) {
          await updateProfile(fbUser, { displayName: savedName });
        }
        setDisplayName(savedName);
      } else {
        const generatedName = generateGuestName();
        await updateProfile(fbUser, { displayName: generatedName });
        try {
          localStorage.setItem(STORAGE_KEY, generatedName);
        } catch {
          // ignore
        }
        setDisplayName(generatedName);
      }
    } catch (err) {
      console.error("useAuth: login failed", err);
      throw err;
    }
  }, []);

  // ================================================================
  // Выход
  // ================================================================
  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("useAuth: logout failed", err);
      throw err;
    }
  }, []);

  // ================================================================
  // Обновление имени пользователя
  //   — обновляет Firebase Auth profile (updateProfile)
  //   — сохраняет в localStorage
  //   — обновляет локальное состояние displayName
  // ================================================================
  const updateDisplayNameFn = useCallback(
    async (newName) => {
      const trimmed = newName?.trim();
      if (!trimmed || !user) return;

      await updateProfile(user, { displayName: trimmed });
      try {
        localStorage.setItem(STORAGE_KEY, trimmed);
      } catch {
        // ignore
      }
      setDisplayName(trimmed);
    },
    [user],
  );

  // Отображаемое имя: сначала из localStorage, потом из user.displayName
  const resolvedDisplayName = displayName || user?.displayName || "Anonymous";

  return {
    user,
    loading,
    displayName: resolvedDisplayName,
    login,
    logout,
    updateDisplayName: updateDisplayNameFn,
  };
}
