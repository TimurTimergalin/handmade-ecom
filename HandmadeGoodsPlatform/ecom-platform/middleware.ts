import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const b2cOrigin = process.env.NEXT_PUBLIC_B2C_URL || "http://localhost:8080";

function accessExpired(token: string | undefined): boolean {
  if (!token) return true;
  const payload = token.split(".")[1];
  if (!payload) return true;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return typeof json.exp !== "number" || json.exp * 1000 <= Date.now() + 5000;
  } catch {
    return true;
  }
}

function loginRedirect(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.set("auth-token", "", { path: "/", maxAge: 0 });
  response.cookies.set("refresh-token", "", { path: "/", maxAge: 0 });
  return response;
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!accessExpired(token)) return NextResponse.next();

  const refresh = request.cookies.get("refresh-token")?.value;
  if (!refresh) return loginRedirect(request);

  const renewed = await fetch(`${b2cOrigin}/api/auth/refresh`, {
    method: "POST",
    headers: { cookie: `refresh-token=${refresh}` },
  });
  if (!renewed.ok) return loginRedirect(request);

  const issued = renewed.headers.getSetCookie?.() ?? [];
  const kept = request.cookies
    .getAll()
    .filter((cookie) => cookie.name !== "auth-token" && cookie.name !== "refresh-token")
    .map((cookie) => `${cookie.name}=${cookie.value}`);
  const pairs = issued.map((raw) => raw.split(";")[0]?.trim()).filter(Boolean);
  const headers = new Headers(request.headers);
  headers.set("cookie", [...kept, ...pairs].join("; "));
  const response = NextResponse.next({ request: { headers } });
  for (const raw of issued) response.headers.append("set-cookie", raw);
  return response;
}

export const config = {
  matcher: ["/seller/:path*", "/account/:path*", "/subscriptions"],
};
