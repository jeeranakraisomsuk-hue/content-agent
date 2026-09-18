import { createSign } from "node:crypto";

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface AccessTokenAuthClient {
  getAccessToken(): Promise<{ token?: string | null } | string | null>;
}

export interface GoogleDriveMediaClient {
  uploadFile(input: {
    name: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<{ fileId: string }>;
  streamFile(input: { fileId: string; range?: string }): Promise<Response>;
}

type GoogleDriveMediaClientOptions = {
  folderId: string;
  authClient: AccessTokenAuthClient;
  fetcher?: Fetcher;
};

type ServiceAccountAuthOptions = {
  serviceAccountEmail: string;
  privateKey: string;
  fetcher?: Fetcher;
  now?: () => number;
};

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function encodeBase64Url(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
  return bytes.toString("base64url");
}

function resolveAccessToken(result: Awaited<ReturnType<AccessTokenAuthClient["getAccessToken"]>>): string {
  const token = typeof result === "string" ? result : result?.token;
  if (!token) throw new Error("Google authentication did not return an access token");
  return token;
}

function escapeMultipartHeader(value: string): string {
  return value.replace(/[\r\n"]/g, "_");
}

function createMultipartBody({
  boundary,
  folderId,
  name,
  mimeType,
  bytes,
}: {
  boundary: string;
  folderId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}): Blob {
  const metadata = JSON.stringify({ name, parents: [folderId] });
  return new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${escapeMultipartHeader(mimeType)}\r\n\r\n`,
    Uint8Array.from(bytes),
    `\r\n--${boundary}--`,
  ], { type: `multipart/related; boundary=${boundary}` });
}

export function createGoogleDriveMediaClient({
  folderId,
  authClient,
  fetcher = fetch,
}: GoogleDriveMediaClientOptions): GoogleDriveMediaClient {
  return {
    async uploadFile({ name, mimeType, bytes }) {
      const accessToken = resolveAccessToken(await authClient.getAccessToken());
      const boundary = `indy-media-${crypto.randomUUID()}`;
      const body = createMultipartBody({ boundary, folderId, name, mimeType, bytes });
      const response = await fetcher(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": body.type,
          },
          body,
        },
      );

      if (!response.ok) throw new Error("Google Drive rejected the upload");
      const payload = await response.json() as { id?: string };
      if (!payload.id) throw new Error("Google Drive did not return a file ID");
      return { fileId: payload.id };
    },

    async streamFile({ fileId, range }) {
      const accessToken = resolveAccessToken(await authClient.getAccessToken());
      const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
      if (range) headers.Range = range;
      const response = await fetcher(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
        { headers },
      );
      if (!response.ok && response.status !== 206) throw new Error("Google Drive rejected the download");
      return response;
    },
  };
}

/**
 * Minimal service-account OAuth adapter used because google-auth-library is not
 * part of this workspace. It supports the JWT bearer flow needed by Drive and
 * intentionally does not implement domain-wide delegation or token caching.
 */
export function createServiceAccountAuthClient({
  serviceAccountEmail,
  privateKey,
  fetcher = fetch,
  now = () => Math.floor(Date.now() / 1_000),
}: ServiceAccountAuthOptions): AccessTokenAuthClient {
  return {
    async getAccessToken() {
      const issuedAt = now();
      const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
      const claim = encodeBase64Url(JSON.stringify({
        iss: serviceAccountEmail,
        scope: DRIVE_SCOPE,
        aud: TOKEN_URL,
        iat: issuedAt,
        exp: issuedAt + 3_600,
      }));
      const unsignedAssertion = `${header}.${claim}`;
      const signer = createSign("RSA-SHA256");
      signer.update(unsignedAssertion);
      signer.end();
      const signature = signer.sign(privateKey.replace(/\\n/g, "\n"));
      const assertion = `${unsignedAssertion}.${encodeBase64Url(signature)}`;
      const body = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      });
      const response = await fetcher(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!response.ok) throw new Error("Google authentication rejected the service account");
      const payload = await response.json() as { access_token?: string };
      if (!payload.access_token) throw new Error("Google authentication did not return an access token");
      return { token: payload.access_token };
    },
  };
}

export function createGoogleDriveMediaClientFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  fetcher: Fetcher = fetch,
): GoogleDriveMediaClient | null {
  const serviceAccountEmail = environment.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = environment.GOOGLE_PRIVATE_KEY;
  const folderId = environment.GOOGLE_DRIVE_FOLDER_ID;
  if (!serviceAccountEmail || !privateKey || !folderId) return null;

  return createGoogleDriveMediaClient({
    folderId,
    fetcher,
    authClient: createServiceAccountAuthClient({ serviceAccountEmail, privateKey, fetcher }),
  });
}
