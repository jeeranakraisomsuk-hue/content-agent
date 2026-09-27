import { issueSignedToken, presignUrl } from "@vercel/blob";

export async function streamPrivateBlob({ pathname, range }: { pathname: string; range?: string }): Promise<Response> {
  const validUntil = Date.now() + 60_000;
  const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
  const { presignedUrl } = await presignUrl(token, { operation: "get", access: "private", pathname, validUntil });
  return fetch(presignedUrl, {
    headers: range ? { Range: range } : undefined,
    cache: "no-store",
  });
}
