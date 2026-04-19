"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_SESSION_COOKIE, createAuthSessionToken, verifyAuthSessionToken } from "@/lib/auth/session";
import { findAuthUser, verifyPassword } from "@/lib/auth/users";

export interface LoginState {
  error?: string;
}

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const userId = readString(formData, "userId");
  const password = readString(formData, "password");
  const nextPath = readString(formData, "next") || "/dashboard";

  if (!userId || !password) {
    return { error: "ユーザーIDとパスワードを入力してください。" };
  }

  const user = findAuthUser(userId);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: "認証に失敗しました。" };
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_SESSION_COOKIE, createAuthSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
  });

  redirect(nextPath.startsWith("/") ? nextPath : "/dashboard");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_SESSION_COOKIE);
  redirect("/login");
}

export async function getCurrentLoginPrincipal() {
  const cookieStore = await cookies();
  const session = verifyAuthSessionToken(cookieStore.get(AUTH_SESSION_COOKIE)?.value);
  return session?.sub || null;
}

