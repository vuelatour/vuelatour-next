"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import { env } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api/notifications";
import type { AppNotification } from "@/types/notifications";

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  connected: boolean;
  socket: Socket | null;
  currentUserId: string;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications debe usarse dentro de NotificationsProvider");
  return ctx;
}

export function NotificationsProvider({
  currentUserId,
  children,
}: {
  currentUserId: string;
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchNotifications(20);
      setNotifications(res.data);
      setUnreadCount(res.data.filter((n) => !n.leida).length);
    } catch {
      // Silencioso: el badge no debe romper la UI si el API no responde.
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, leida: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await markNotificationRead(id);
    } catch {
      void refresh();
    }
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, leida: true })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch {
      void refresh();
    }
  }, [refresh]);

  useEffect(() => {
    let active = true;
    // Carga inicial (async: el setState ocurre dentro del callback de la promesa).
    fetchNotifications(20)
      .then((res) => {
        if (!active) return;
        setNotifications(res.data);
        setUnreadCount(res.data.filter((n) => !n.leida).length);
      })
      .catch(() => {});

    const supabase = createSupabaseBrowserClient();
    const sock = io(env.API_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      // Token fresco en cada (re)conexión.
      auth: (cb) => {
        void supabase.auth.getSession().then(({ data }) => {
          cb({ token: data.session?.access_token ?? "" });
        });
      },
    });
    // Publica el socket al contexto fuera del cuerpo síncrono del efecto.
    queueMicrotask(() => {
      if (active) setSocket(sock);
    });

    sock.on("connect", () => setConnected(true));
    sock.on("disconnect", () => setConnected(false));
    sock.on("notification", (payload: Partial<AppNotification>) => {
      if (payload?.titulo) {
        toast(payload.titulo, { description: payload.cuerpo ?? undefined });
      }
      void refresh();
    });

    return () => {
      active = false;
      sock.removeAllListeners();
      sock.disconnect();
      setSocket(null);
    };
  }, [refresh]);

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        connected,
        socket,
        currentUserId,
        refresh,
        markRead,
        markAllRead,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
