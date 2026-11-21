import { create } from "zustand";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { post } from "../../api/client";

export const MAX_DOC_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 1 * 1024 * 1024;

export const DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type PickedFile = { uri: string; name: string; mimeType?: string | null; size?: number | null };

export type UploadItem = {
  id: string;
  name: string;
  size: number;
  progress: number; // 0..100
  status: "preparing" | "uploading" | "saving" | "done" | "error";
  error?: string;
  compressed?: boolean;
};

type State = { items: UploadItem[]; running: boolean; set: (id: string, patch: Partial<UploadItem>) => void; reset: (items: UploadItem[]) => void; setRunning: (r: boolean) => void };

export const useUploads = create<State>((set) => ({
  items: [],
  running: false,
  set: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
  reset: (items) => set({ items }),
  setRunning: (running) => set({ running }),
}));

export const formatBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

async function blobOf(uri: string) {
  return (await fetch(uri)).blob();
}

/**
 * Photos must be ≤ 1 MB. Larger photos are resized and re-encoded as JPEG,
 * stepping quality down until they fit (the best "compression" for images —
 * gzip doesn't shrink JPEG/PNG/PDF, which are already compressed).
 */
async function shrinkImage(uri: string): Promise<{ uri: string; blob: Blob }> {
  const widths = [2048, 1600, 1280, 1024];
  const qualities = [0.8, 0.65, 0.5];
  for (const width of widths) {
    for (const compress of qualities) {
      const ref = await ImageManipulator.manipulate(uri).resize({ width }).renderAsync();
      const out = await ref.saveAsync({ compress, format: SaveFormat.JPEG });
      const blob = await blobOf(out.uri);
      if (blob.size <= MAX_IMAGE_BYTES) return { uri: out.uri, blob };
    }
  }
  throw new Error("Couldn't shrink this photo below 1 MB");
}

/** PUT a blob to a presigned S3 URL with real upload progress (fetch has no progress events). */
function putWithProgress(url: string, blob: Blob, contentType: string, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.timeout = 10 * 60 * 1000;
    xhr.send(blob);
  });
}

function inferType(f: PickedFile) {
  if (f.mimeType) return f.mimeType.toLowerCase();
  const ext = f.name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return (ext && map[ext]) || "application/octet-stream";
}

/**
 * Upload several files to a project, one after another, reporting 0–100% per file.
 * Validates type and size first; photos above 1 MB are compressed automatically.
 */
export async function uploadProjectFiles(projectId: string, files: PickedFile[], category: string) {
  const store = useUploads.getState();
  const items: UploadItem[] = files.map((f, i) => ({ id: `${Date.now()}-${i}`, name: f.name, size: f.size || 0, progress: 0, status: "preparing" }));
  store.reset(items);
  store.setRunning(true);
  let ok = 0;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const id = items[i].id;
    const set = (p: Partial<UploadItem>) => useUploads.getState().set(id, p);
    try {
      let contentType = inferType(f);
      const isImage = IMAGE_TYPES.includes(contentType) || contentType.startsWith("image/");
      if (!isImage && !DOC_TYPES.includes(contentType)) throw new Error("Only PDF, Word, Excel, PowerPoint or photos are allowed");

      let uri = f.uri;
      let blob = await blobOf(uri);
      let name = f.name;

      if (isImage) {
        if (blob.size > MAX_IMAGE_BYTES || !IMAGE_TYPES.includes(contentType)) {
          const shrunk = await shrinkImage(uri);
          uri = shrunk.uri;
          blob = shrunk.blob;
          contentType = "image/jpeg";
          name = name.replace(/\.(heic|heif|png|webp|jpe?g)$/i, "") + ".jpg";
          set({ compressed: true });
        }
      } else if (blob.size > MAX_DOC_BYTES) {
        throw new Error(`Too large (${formatBytes(blob.size)}). Documents must be 20 MB or smaller.`);
      }

      set({ size: blob.size, status: "uploading", progress: 1, name });
      const presign = await post<{ uploadUrl: string; key: string }>(`/business-projects/${projectId}/documents/presign`, { name, contentType, size: blob.size });
      await putWithProgress(presign.uploadUrl, blob, contentType, (pct) => set({ progress: pct }));
      set({ status: "saving", progress: 99 });
      await post(`/business-projects/${projectId}/documents`, { name, storageKey: presign.key, category, mimeType: contentType, size: blob.size });
      set({ status: "done", progress: 100 });
      ok++;
    } catch (e: any) {
      set({ status: "error", error: e?.message || "Upload failed" });
    }
  }
  useUploads.getState().setRunning(false);
  return { ok, failed: files.length - ok };
}
