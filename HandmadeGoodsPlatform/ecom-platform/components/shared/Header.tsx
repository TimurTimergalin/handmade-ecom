import Link from "next/link";

import { Logo } from "./Logo";
import { ROUTES } from "@/lib/constants";

export function Header() {
  return (
    <header className="bg-background sticky top-0 z-40 border-b">
      <div className="container mx-auto flex h-16 items-center gap-6 px-4">
        <Logo />
        <div className="ml-auto flex items-center gap-4 text-sm">
          <Link href={ROUTES.follow} className="hover:text-primary">
            Подписки
          </Link>
          <Link href={ROUTES.cart} className="hover:text-primary">
            Корзина
          </Link>
          <Link href={ROUTES.account} className="hover:text-primary">
            Профиль
          </Link>
        </div>
      </div>
    </header>
  );
}
