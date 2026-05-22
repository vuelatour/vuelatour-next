"use client";

import { useEffect, useState } from "react";
import { UsersIcon } from "@heroicons/react/24/outline";
import { useNotifications } from "@/components/admin/notifications/notifications-provider";

interface Editor {
  userId: string;
  nombre: string;
}

interface PresencePayload {
  quoteId: string;
  editores: Editor[];
}

/**
 * Indica si otro admin está viendo/editando esta misma cotización (presencia en
 * vivo vía Socket.IO). Evita ediciones en paralelo sin darse cuenta.
 */
export function QuotePresenceIndicator({ quoteId }: { quoteId: string }) {
  const { socket, currentUserId } = useNotifications();
  const [others, setOthers] = useState<Editor[]>([]);

  useEffect(() => {
    if (!socket) return;

    const onPresence = (payload: PresencePayload) => {
      if (payload.quoteId !== quoteId) return;
      setOthers(payload.editores.filter((e) => e.userId !== currentUserId));
    };

    socket.on("quote:presence", onPresence);
    const join = () => socket.emit("quote:join", { quoteId });
    join();
    socket.on("connect", join); // re-anunciar presencia al reconectar

    return () => {
      socket.emit("quote:leave", { quoteId });
      socket.off("quote:presence", onPresence);
      socket.off("connect", join);
    };
  }, [socket, quoteId, currentUserId]);

  if (others.length === 0) return null;

  const nombres = others.map((e) => e.nombre).join(", ");
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
      <UsersIcon className="h-4 w-4 shrink-0" />
      <span>
        {others.length === 1
          ? `${nombres} también está viendo esta cotización`
          : `${nombres} también están viendo esta cotización`}
      </span>
    </div>
  );
}
