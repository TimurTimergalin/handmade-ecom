"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Tab = "posts" | "products" | "sellers";

const TABS: { value: Tab; label: string }[] = [
  { value: "posts", label: "Публикации" },
  { value: "products", label: "Товары" },
  { value: "sellers", label: "Продавцы" },
];

export function SearchTabs() {
  const params = useSearchParams();
  const current = (params.get("tab") as Tab) || "posts";
  const q = params.get("q") ?? "";

  return (
    <div className="flex gap-2 border-b">
      {TABS.map((tab) => {
        const href = `${ROUTES.search}?q=${encodeURIComponent(q)}&tab=${tab.value}`;
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
