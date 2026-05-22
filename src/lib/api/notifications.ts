"use client";

import { apiBrowser } from "./browser";
import type { NotificationListResponse } from "@/types/notifications";

export function fetchNotifications(limit = 20): Promise<NotificationListResponse> {
  return apiBrowser<NotificationListResponse>("/v1/notifications", {
    searchParams: { limit },
  });
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await apiBrowser<{ count: number }>("/v1/notifications/unread-count");
  return res.count;
}

export function markNotificationRead(id: string): Promise<{ updated: boolean }> {
  return apiBrowser(`/v1/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return apiBrowser("/v1/notifications/read-all", { method: "POST" });
}
