import type {
  AdminUser,
  CreateUserRequest,
  UpdateUserRequest,
  UsersListResponse,
} from "@emc2/shared";
import { api } from "@/lib/api";

export interface AdminSummary {
  users: { total: number; active: number; admins: number };
}

export const adminApi = {
  getSummary: () => api.get<AdminSummary>("/api/admin/summary"),
  listUsers: () => api.get<UsersListResponse>("/api/admin/users").then((r) => r.users),
  createUser: (body: CreateUserRequest) =>
    api.post<{ user: AdminUser }>("/api/admin/users", body).then((r) => r.user),
  updateUser: (id: string, body: UpdateUserRequest) =>
    api
      .patch<{ user: AdminUser }>(`/api/admin/users/${id}`, body)
      .then((r) => r.user),
};
