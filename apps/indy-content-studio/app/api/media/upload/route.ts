import { createGoogleDriveMediaClientFromEnvironment } from "../../../../features/media/server/google-drive-media-client";
import { createMediaUploadHandler } from "../../../../features/media/server/media-upload-handler";

export const POST = createMediaUploadHandler({
  getClient: () => createGoogleDriveMediaClientFromEnvironment(),
  allowedOrigin: process.env.APP_PUBLIC_BASE_URL,
});
