"use client";
import { useEffect } from "react";
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
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}
