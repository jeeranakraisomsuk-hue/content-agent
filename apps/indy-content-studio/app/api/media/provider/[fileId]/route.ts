import {
  createGoogleDriveMediaClientFromEnvironment,
  type GoogleDriveMediaClient,
} from "../../../../../features/media/server/google-drive-media-client";
import { verifyMediaDeliveryUrl } from "../../../../../features/media/server/media-delivery-url";

type ProviderRouteContext = { params: Promise<{ fileId: string }> };

type MediaProviderDependencies = {
  getClient: () => GoogleDriveMediaClient | null | Promise<GoogleDriveMediaClient | null>;
  signingSecret: string;
  now?: () => number;
};

const SAFE_PROVIDER_HEADERS = [
  "accept-ranges",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
] as const;

function copySafeProviderHeaders(source: Headers): Headers {
  const result = new Headers({ "Cache-Control": "private, no-store" });
  for (const name of SAFE_PROVIDER_HEADERS) {
    const value = source.get(name);
    if (value) result.set(name, value);
  }
  return result;
}

export function createMediaProviderHandler({
  getClient,
  signingSecret,
  now = () => Math.floor(Date.now() / 1_000),
}: MediaProviderDependencies) {
  return async function handleMediaProvider(request: Request, context: ProviderRouteContext): Promise<Response> {
    const { fileId } = await context.params;
    if (!verifyMediaDeliveryUrl({
      url: request.url,
      expectedFileId: fileId,
      secret: signingSecret,
      now: now(),
    })) {
      return Response.json({ error: "ลิงก์สื่อไม่ถูกต้องหรือหมดอายุ" }, { status: 401 });
    }

    const client = await getClient();
    if (!client) {
      return Response.json({ error: "ยังไม่ได้เชื่อมต่อ Google Drive" }, { status: 503 });
    }

    try {
      const range = request.headers.get("range") ?? undefined;
      const providerResponse = await client.streamFile({ fileId, range });
      return new Response(providerResponse.body, {
        status: providerResponse.status,
        headers: copySafeProviderHeaders(providerResponse.headers),
      });
    } catch {
      return Response.json({ error: "อ่านไฟล์จาก Google Drive ไม่สำเร็จ" }, { status: 502 });
    }
  };
}

export const GET = createMediaProviderHandler({
  getClient: () => createGoogleDriveMediaClientFromEnvironment(),
  signingSecret: process.env.INDY_MEDIA_SIGNING_SECRET ?? "",
});
