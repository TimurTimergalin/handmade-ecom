import Link from "next/link";

import { ROUTES, APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href={ROUTES.home} className={cn("text-xl font-bold tracking-tight", className)}>
      {APP_NAME}
    </Link>
  );
}
