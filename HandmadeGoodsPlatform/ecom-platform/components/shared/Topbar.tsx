import Link from "next/link";

import { Logo } from "./Logo";
import { ROUTES } from "@/lib/constants";

export function Topbar() {
  return (
    <header className="bg-background flex h-16 items-center gap-6 border-b px-6">
      <div className="md:hidden">
        <Logo />
      </div>
      <nav className="ml-auto flex items-center gap-4 text-sm">
        <Link href={ROUTES.home} className="hover:text-primary">
          На сайт
        </Link>
        <Link href={ROUTES.seller.profile} className="hover:text-primary">
          Профиль
        </Link>
      </nav>
    </header>
  );
}
