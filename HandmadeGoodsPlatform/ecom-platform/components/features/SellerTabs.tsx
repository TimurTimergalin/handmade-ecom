"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Tab = "posts" | "products";

const TABS: { value: Tab; label: string }[] = [
  { value: "posts", label: "Публикации" },
  { value: "products", label: "Товары" },
];

export function SellerTabs({ username }: { username: string }) {
  const params = useSearchParams();
  const current = (params.get("tab") as Tab) || "posts";
  const q = params.get("q") ?? "";

  return (
    <div className="flex gap-2 border-b">
      {TABS.map((tab) => {
        const qs = new URLSearchParams({ tab: tab.value });
        if (q) qs.set("q", q);

        const href = `${ROUTES.sellerPublic(username)}?${qs.toString()}`;
        const isActive = current === tab.value;

        return (
          <Link
            key={tab.value}
            href={href}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
