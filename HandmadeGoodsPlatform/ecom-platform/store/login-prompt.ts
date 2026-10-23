import { create } from "zustand";

import { useAuthStore } from "@/store/auth";

interface LoginPromptState {
  open: boolean;
  show: () => void;
  setOpen: (open: boolean) => void;
}

export const useLoginPrompt = create<LoginPromptState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  setOpen: (open) => set({ open }),
}));

/** Покупка доступна только вошедшему пользователю. */
export function ensureBuyer(): boolean {
  const { user, ready } = useAuthStore.getState();
  if (user) return true;
  if (ready) useLoginPrompt.getState().show();
  return false;
}
