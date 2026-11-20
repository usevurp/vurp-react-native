import type { AttachmentLimits, PickedFile } from "./types";

// Checking and uploading files before they're sent. The server checks everything again; these
// checks are here so the visitor hears about a limit straight away, by name.

const TYPES: Record<string, "image" | "video"> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
};
// Pickers don't always report a type, or report a loose one ("image", "video").
const BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export function contentTypeOf(file: PickedFile) {
  if (TYPES[file.type]) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXTENSION[ext] ?? null;
}

export const kindOf = (contentType: string) => TYPES[contentType]!;

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${+(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

/** Why this file can't be sent, or null if it can. A size not known yet is checked after reading. */
export function fileProblem(file: PickedFile, size: number | undefined, limits: AttachmentLimits) {
  const type = contentTypeOf(file);
  if (!type) {
    return `${file.name} can't be sent. Send a photo (JPEG, PNG, WebP or GIF) or a video (MP4, WebM or MOV).`;
  }
  const kind = TYPES[type]!;
  const max = kind === "image" ? limits.maxImageBytes : limits.maxVideoBytes;
  if (max !== null && size !== undefined && size > max) {
    return `${file.name} is too large. ${kind === "image" ? "Images" : "Videos"} can be up to ${formatBytes(max)}.`;
  }
  return null;
}

export type UploadTarget = { url: string; method: string; headers: Record<string, string> };

/** How files are read and sent to storage. The defaults use React Native's fetch, Blob and XHR. */
export type FileTransport = {
  /** The file's bytes. */
  read: (file: PickedFile) => Promise<Blob>;
  /** The first 16 bytes, base64: the server checks them before handing out an upload link. */
  head: (blob: Blob) => Promise<string>;
  put: (target: UploadTarget, blob: Blob, onProgress: (fraction: number) => void) => Promise<void>;
};

export const defaultFileTransport: FileTransport = {
  read: async (file) => (await fetch(file.uri)).blob(),
  head: (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
      reader.readAsDataURL(blob.slice(0, 16));
    }),
  put: (target, blob, onProgress) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(target.method, target.url);
      for (const [name, value] of Object.entries(target.headers)) xhr.setRequestHeader(name, value);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error("upload_failed")));
      xhr.onerror = () => reject(new Error("upload_failed"));
      xhr.send(blob);
    }),
};
