export async function captureVideoFrame(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  const width = video.videoWidth;
  const height = video.videoHeight;

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Camera frame could not be processed");
  }

  context.drawImage(video, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Image capture failed"));
        return;
      }

      resolve(blob);
    }, "image/jpeg", 0.96);
  });
}

export async function compressImageBlob(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const maxWidth = 1280;
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Image compression failed");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((compressedBlob) => {
      if (!compressedBlob) {
        reject(new Error("Compressed image could not be created"));
        return;
      }

      resolve(compressedBlob);
    }, "image/jpeg", 0.8);
  });
}

export function blobToObjectUrl(blob: Blob) {
  return URL.createObjectURL(blob);
}
