"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: ROUTES.seller.dashboard, label: "Дашборд" },
  { href: ROUTES.seller.products, label: "Товары" },
  { href: ROUTES.seller.posts, label: "Публикации" },
  { href: ROUTES.seller.orders, label: "Заказы" },
  { href: ROUTES.seller.delivery, label: "Доставка" },
  { href: ROUTES.seller.pricing, label: "Тарифы" },
  { href: ROUTES.seller.profile, label: "Профиль" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="bg-background hidden w-60 flex-col border-r p-4 md:flex">
      <div className="mb-6 text-lg font-bold">Кабинет продавца</div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === ROUTES.seller.dashboard
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors",
                isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
