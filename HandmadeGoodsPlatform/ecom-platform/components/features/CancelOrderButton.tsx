"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cancelOrder } from "@/services/api";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirm() {
    if (pending) return;
    setPending(true);
    try {
      await cancelOrder(orderId);
      setOpen(false);
      toast.success("Заказ отменён");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отменить заказ");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-destructive text-destructive hover:bg-destructive/10 mt-4 w-full rounded-lg border px-6 py-3 text-sm font-medium transition-colors"
      >
        Отменить
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отменить заказ?</DialogTitle>
            <DialogDescription>
              Заказ будет отменён. Вернуть его в работу уже не получится.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              Не отменять
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {pending ? "Отменяем..." : "Отменить заказ"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
