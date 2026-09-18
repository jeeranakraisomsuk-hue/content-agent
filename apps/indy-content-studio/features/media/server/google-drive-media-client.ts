import { JWT } from "google-auth-library";

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
  deleteFile(input: { fileId: string }): Promise<void>;
  streamFile(input: { fileId: string; range?: string }): Promise<Response>;
}

type GoogleDriveMediaClientOptions = {
  folderId: string;
  authClient: AccessTokenAuthClient;
  fetcher?: Fetcher;
};

export type GoogleAuthClientFactory = (options: {
  email: string;
  key: string;
  scopes: string[];
}) => AccessTokenAuthClient;

type Environment = Readonly<Record<string, string | undefined>>;

const defaultGoogleAuthClientFactory: GoogleAuthClientFactory = (options) => {
  return new JWT(options);
};

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

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

    async deleteFile({ fileId }) {
      const accessToken = resolveAccessToken(await authClient.getAccessToken());
      const response = await fetcher(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!response.ok && response.status !== 404) throw new Error("Google Drive rejected the cleanup");
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

export function createGoogleDriveMediaClientFromEnvironment(
  environment: Environment = process.env,
  fetcher: Fetcher = fetch,
  createAuthClient: GoogleAuthClientFactory = defaultGoogleAuthClientFactory,
): GoogleDriveMediaClient | null {
  const serviceAccountEmail = environment.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = environment.GOOGLE_PRIVATE_KEY;
  const folderId = environment.GOOGLE_DRIVE_FOLDER_ID;
  if (!serviceAccountEmail || !privateKey || !folderId) return null;

  return createGoogleDriveMediaClient({
    folderId,
    fetcher,
    authClient: createAuthClient({
      email: serviceAccountEmail,
      key: privateKey.replace(/\\n/g, "\n"),
      scopes: [DRIVE_SCOPE],
    }),
  });
}
