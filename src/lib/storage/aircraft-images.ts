import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const BUCKET = "aeronave-imagenes";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export interface UploadResult {
  storage_path: string;
  url: string;
  size_bytes: number;
  content_type: string;
}

/**
 * Sube una imagen al bucket `aeronave-imagenes` desde el navegador.
 * Path resultante: {aircraftId}/{timestamp}-{nombre-sanitizado}.
 * El bucket es publico, así que getPublicUrl devuelve una URL cacheable que
 * se guarda directo en la BD junto con storage_path (para poder borrarla).
 */
export async function uploadAircraftImage(
  aircraftId: string,
  file: File,
): Promise<UploadResult> {
  if (file.size > MAX_BYTES) {
    throw new Error(
      `El archivo excede el límite de ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB`,
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(
      `Formato no soportado (${file.type}). Permitidos: JPG, PNG, WebP, AVIF.`,
    );
  }

  const ext = sanitizeExt(file.name, file.type);
  const baseName = sanitizeName(stripExt(file.name)).slice(0, 60) || "imagen";
  const stamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const storage_path = `${aircraftId}/${stamp}-${random}-${baseName}.${ext}`;

  const supabase = createSupabaseBrowserClient();

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storage_path, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });
  if (uploadErr) {
    throw new Error(`Error al subir: ${uploadErr.message}`);
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storage_path);
  if (!pub?.publicUrl) {
    throw new Error("No se pudo resolver la URL pública del archivo");
  }

  return {
    storage_path,
    url: pub.publicUrl,
    size_bytes: file.size,
    content_type: file.type,
  };
}

function sanitizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

function sanitizeExt(name: string, contentType: string): string {
  const fromName = name.includes(".")
    ? name.split(".").pop()?.toLowerCase()
    : null;
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  // Fallback al content-type.
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/avif") return "avif";
  return "bin";
}
