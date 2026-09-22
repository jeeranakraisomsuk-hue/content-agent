import { NextRequest, NextResponse } from "next/server";
import { getAdminActor } from "./features/auth/server/admin-session";

function isPublicRequest(pathname: string, method: string): boolean {
  if (pathname === "/login") return method === "GET" || method === "HEAD";
  if (pathname === "/api/ready") return method === "GET";
  if (pathname === "/api/auth/login" || pathname === "/api/auth/logout") return method === "POST";
  if (pathname === "/api/line/webhook") return method === "POST";
  return method === "GET" && /^\/api\/media\/provider\/[^/]+$/.test(pathname);
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  if (isPublicRequest(pathname, request.method)) return NextResponse.next();
  if (await getAdminActor(request)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets/).*)"],
};
