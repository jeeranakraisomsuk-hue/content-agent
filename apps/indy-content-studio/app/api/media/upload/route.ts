import {
  createGoogleDriveMediaClientFromEnvironment,
  type GoogleDriveMediaClient,
} from "../../../../features/media/server/google-drive-media-client";

const MAX_MEDIA_BYTES = 52_428_800;

type MediaUploadDependencies = {
  getClient: () => GoogleDriveMediaClient | null | Promise<GoogleDriveMediaClient | null>;
};

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return value instanceof Blob && typeof (value as File).name === "string";
}

export function createMediaUploadHandler({ getClient }: MediaUploadDependencies) {
  return async function handleMediaUpload(request: Request): Promise<Response> {
    const client = await getClient();
    if (!client) {
      return Response.json({ error: "ยังไม่ได้เชื่อมต่อ Google Drive" }, { status: 503 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return Response.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
    }

    const assetId = form.get("assetId");
    const file = form.get("file");
    if (typeof assetId !== "string" || !assetId.trim() || !isUploadedFile(file)) {
      return Response.json({ error: "ข้อมูลไฟล์ไม่ครบ" }, { status: 400 });
    }
    if (file.size > MAX_MEDIA_BYTES) {
      return Response.json({ error: "ไฟล์มีขนาดเกิน 50 MB" }, { status: 413 });
    }

    const isVideo = file.type.toLowerCase().startsWith("video/");
    const preview = form.get("preview");
    if (isVideo && (!isUploadedFile(preview) || preview.type.toLowerCase() !== "image/jpeg")) {
      return Response.json({ error: "วิดีโอต้องมีภาพตัวอย่าง JPEG" }, { status: 400 });
    }

    try {
      const uploaded = await client.uploadFile({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      const uploadedPreview = isVideo
        ? await client.uploadFile({
          name: (preview as File).name,
          mimeType: "image/jpeg",
          bytes: new Uint8Array(await (preview as File).arrayBuffer()),
        })
        : uploaded;

      return Response.json({
        assetId: assetId.trim(),
        providerFileId: uploaded.fileId,
        previewProviderFileId: uploadedPreview.fileId,
        remoteStatus: "ready",
      });
    } catch {
      return Response.json({ error: "อัปโหลดไป Google Drive ไม่สำเร็จ" }, { status: 502 });
    }
  };
}

export const POST = createMediaUploadHandler({
  getClient: () => createGoogleDriveMediaClientFromEnvironment(),
});
