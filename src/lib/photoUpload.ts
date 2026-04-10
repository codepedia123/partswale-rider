import { getSignedPhotoUploadUrl } from "./api";
import { formatTimestampForCapture } from "./format";
import { supabase } from "./supabase";
import type { PhotoUploadResult, RiderSession } from "../types/domain";

export async function uploadOrderPhoto(
  session: RiderSession,
  orderId: string,
  type: "pickup" | "delivery",
  blob: Blob,
): Promise<PhotoUploadResult> {
  const contentType = "image/jpeg";
  const signedPayload = await getSignedPhotoUploadUrl(session, orderId, type, contentType);

  if (signedPayload) {
    const uploadUrl = (signedPayload.upload_url ??
      signedPayload.signed_url ??
      signedPayload.data?.upload_url ??
      signedPayload.data?.signed_url) as string | undefined;
    const imageUrl = (signedPayload.image_url ??
      signedPayload.file_url ??
      signedPayload.data?.image_url ??
      signedPayload.data?.file_url) as string | undefined;
    const storagePath = (signedPayload.path ?? signedPayload.data?.path) as string | undefined;

    if (uploadUrl) {
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: blob,
        headers: {
          "Content-Type": contentType,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error("Photo upload failed");
      }

      return {
        imageUrl: imageUrl ?? storagePath ?? uploadUrl.split("?")[0],
        storagePath: storagePath ?? `${orderId}/${type}_${Date.now()}.jpg`,
      };
    }
  }

  if (!supabase) {
    throw new Error("Photo upload requires Supabase configuration");
  }

  const storagePath = `${orderId}/${type}_${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("order-photos").upload(storagePath, blob, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw error;
  }

  const { data: signedUrlData } = await supabase.storage
    .from("order-photos")
    .createSignedUrl(storagePath, 60 * 60 * 24);

  return {
    imageUrl: signedUrlData?.signedUrl ?? storagePath,
    storagePath,
  };
}

export function createCaptureTimestamp() {
  return formatTimestampForCapture();
}
