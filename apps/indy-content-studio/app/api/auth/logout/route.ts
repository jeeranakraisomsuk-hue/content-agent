import { clearAdminSessionCookie } from "../../../../features/auth/server/admin-session";

export async function POST(): Promise<Response> {
  return Response.json({ ok: true }, {
    headers: { "Set-Cookie": clearAdminSessionCookie(), "Cache-Control": "no-store" },
  });
}
