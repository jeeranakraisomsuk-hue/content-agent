import { verifyLineSignature } from "../../../../features/line-oa/server/line-signature";

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature") ?? "";
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  if (!channelSecret || !verifyLineSignature(rawBody, signature, channelSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  return new Response("OK", { status: 200 });
}
