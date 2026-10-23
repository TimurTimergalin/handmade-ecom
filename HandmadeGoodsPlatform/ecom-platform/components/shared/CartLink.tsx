"use client";

import Link from "next/link";

import { ROUTES } from "@/lib/constants";
import { useAuthStore } from "@/store/auth";
import { useLoginPrompt } from "@/store/login-prompt";

export function CartLink() {
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const show = useLoginPrompt((s) => s.show);

  if (ready && user) {
    return (
      <Link href={ROUTES.cart} className="hover:text-primary">
        Корзина
      </Link>
    );
  }

  return (
    <button type="button" className="hover:text-primary" onClick={() => ready && show()}>
      Корзина
    </button>
  );
}
