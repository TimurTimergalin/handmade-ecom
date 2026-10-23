"use client";
import { useEffect } from "react";
import { LoginPrompt } from "@/components/features/LoginPrompt";
import { Toaster } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/auth";

export function Providers({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  return (
    <>
      {children}
      <LoginPrompt />
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}
