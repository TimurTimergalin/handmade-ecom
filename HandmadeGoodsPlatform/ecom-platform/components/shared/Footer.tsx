import { APP_NAME } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="text-muted-foreground border-t py-6 text-center text-sm">
      © {new Date().getFullYear()} {APP_NAME}. Все права защищены.
    </footer>
  );
}
