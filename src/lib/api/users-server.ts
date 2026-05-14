import { apiServer } from "./server";
import type { User, UserListResponse } from "@/types/users";

export interface ListUsersQuery {
  q?: string;
  rol?: string;
  estado?: string;
  limit?: number;
  offset?: number;
}

export function listUsers(query: ListUsersQuery = {}) {
  return apiServer<UserListResponse>("/v1/users", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getUser(id: string) {
  return apiServer<User>(`/v1/users/${id}`, { cache: "no-store" });
}
