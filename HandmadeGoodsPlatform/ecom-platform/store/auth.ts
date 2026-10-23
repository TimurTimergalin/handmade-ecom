// store/auth.ts
import { create } from "zustand";

import { b2c, HttpError, readData } from "@/lib/axios";
import { becomeSeller as requestBecomeSeller } from "@/services/api";
import type { ApiResponse, User, UserRole } from "@/types";

interface AuthState {
  user: User | null;
  ready: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  loginWithYandex: (isSellerIntent?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  becomeSeller: (input: {
    username: string;
    displayName: string;
    bio?: string;
    legalType: "person" | "company";
    lastName?: string;
    firstName?: string;
    patronymic?: string;
    legalName?: string;
    inn: string;
    ogrn?: string;
    legalAddress?: string;
  }) => Promise<void>;
  updateProfile: (updates: Partial<Pick<User, "displayName" | "bio" | "avatar">>) => Promise<void>;
  isAuthenticated: () => boolean;
  hasRole: (role: UserRole) => boolean;
  hydrate: () => Promise<void>;
}

async function fetchMe(): Promise<User> {
  const data = await readData(b2c.get<ApiResponse<{ user: User }>>("/api/auth/me"));
  if (!data?.user) {
    throw new Error("Не удалось получить профиль");
  }
  return data.user;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  ready: false,

  hydrate: async () => {
    const delays = [0, 400, 1200];
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt] > 0) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
      try {
        const user = await fetchMe();
        set({ user, ready: true });
        return;
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 0;
        if (status === 401 || status === 403) break;
      }
    }
    set({ user: null, ready: true });
  },

  loginWithEmail: async (email, password) => {
    const data = await readData(
      b2c.post<ApiResponse<{ user: User }>>("/api/auth/login", { email, password })
    );
    if (!data?.user) {
      throw new Error("Не удалось войти");
    }
    set({ user: data.user, ready: true });
  },

  register: async (email, password) => {
    const local = email.split("@")[0] || "user";
    const data = await readData(
      b2c.post<ApiResponse<{ user: User }>>("/api/auth/register", {
        email,
        username: local,
        displayName: local,
        password,
      })
    );
    if (!data?.user) {
      throw new Error("Не удалось создать аккаунт");
    }
    set({ user: data.user, ready: true });
  },

  loginWithYandex: async () => {
    try {
      const data = await readData(
        b2c.post<ApiResponse<{ user?: User } | null>>("/api/auth/yandex")
      );
      if (data && typeof data === "object" && "user" in data && data.user) {
        set({ user: data.user, ready: true });
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.message) throw error;
    }
    throw new Error("Яндекс ID пока не подключён");
  },

  logout: async () => {
    await readData(b2c.post<ApiResponse<null>>("/api/auth/logout"));
    set({ user: null, ready: true });
  },

  becomeSeller: async (input) => {
    await requestBecomeSeller(input);
    const user = await fetchMe();
    set({ user });
  },

  updateProfile: async (updates) => {
    const data = await readData(
      b2c.patch<ApiResponse<{ user: User }>>("/api/users/me", updates)
    );
    if (!data?.user) {
      throw new Error("Не удалось обновить профиль");
    }
    set({ user: data.user });
  },

  isAuthenticated: () => get().user !== null,
  hasRole: (role) => get().user?.roles.includes(role) ?? false,
}));
