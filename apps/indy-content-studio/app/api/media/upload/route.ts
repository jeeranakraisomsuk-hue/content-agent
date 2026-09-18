import { createGoogleDriveMediaClientFromEnvironment } from "../../../../features/media/server/google-drive-media-client";
import { createMediaUploadAuthorizer } from "../../../../features/media/server/media-upload-authorization";
import { createMediaUploadHandler } from "../../../../features/media/server/media-upload-handler";

export const POST = createMediaUploadHandler({
  getClient: () => createGoogleDriveMediaClientFromEnvironment(),
  authorizeUpload: createMediaUploadAuthorizer(),
  allowedOrigin: process.env.APP_PUBLIC_BASE_URL,
});
