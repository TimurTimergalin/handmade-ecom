import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/providers/Providers";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/constants";

import "./globals.css";

export const dynamic = "force-dynamic";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={inter.variable}>
      <body className="bg-background text-foreground min-h-screen font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
