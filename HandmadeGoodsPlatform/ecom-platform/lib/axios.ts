import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from "axios";

import type { ApiResponse } from "@/types";

const b2cBase = process.env.NEXT_PUBLIC_B2C_URL || "http://localhost:8080";
const b2bBase = process.env.NEXT_PUBLIC_B2B_URL || "http://localhost:8090";

export class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof HttpError && error.status === 404;
}

async function attachAuthCookie(config: InternalAxiosRequestConfig) {
  if (typeof window !== "undefined") return config;

  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    const token = jar.get("auth-token")?.value;
    if (token) {
      config.headers.set("Cookie", `auth-token=${token}`);
    }
  } catch {
    // Outside a Next.js request the call still goes out without a session cookie.
  }

  return config;
}

function withSession(client: ReturnType<typeof axios.create>) {
  client.interceptors.request.use(attachAuthCookie);
  return client;
}

export const b2c = withSession(
  axios.create({
    baseURL: b2cBase,
    withCredentials: true,
  })
);

export const b2b = withSession(
  axios.create({
    baseURL: b2bBase,
    withCredentials: true,
    headers: {
      "X-CSRF-Protection": "1",
    },
  })
);

export const http = b2c;

export async function readData<T>(call: Promise<AxiosResponse<ApiResponse<T>>>): Promise<T> {
  try {
    const response = await call;
    const body = response.data;
    if (!body || typeof body !== "object") {
      throw new HttpError("Ошибка запроса", response.status);
    }
    if (body.error) {
      throw new HttpError(body.error.message, response.status);
    }
    return body.data;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (axios.isAxiosError(error)) {
      const data = error.response?.data as ApiResponse<unknown> | undefined;
      const message = data?.error?.message || error.message || "Ошибка запроса";
      throw new HttpError(message, error.response?.status ?? 0);
    }
    throw error;
  }
}
