"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROUTES } from "@/lib/constants";
import { useLoginPrompt } from "@/store/login-prompt";

export function LoginPrompt() {
  const open = useLoginPrompt((s) => s.open);
  const setOpen = useLoginPrompt((s) => s.setOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Войдите</DialogTitle>
          <DialogDescription>Чтобы покупать на Handmade</DialogDescription>
        </DialogHeader>
        <Link
          href={ROUTES.login}
          className={buttonVariants({ className: "w-full" })}
          onClick={() => setOpen(false)}
        >
          Войти
        </Link>
      </DialogContent>
    </Dialog>
  );
}
