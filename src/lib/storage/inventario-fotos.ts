import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const BUCKET = "inventario-fotos";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
// DEBE coincidir con allowed_mime_types del bucket (migración 20260714000004).
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Sube la foto de un producto de inventario al bucket PÚBLICO
 * `inventario-fotos` desde el navegador y devuelve la URL pública + el path
 * (el path viaja al API para poder borrar el archivo al reemplazar la foto).
 */
export async function uploadInventarioFoto(
  file: File,
): Promise<{ url: string; storage_path: string }> {
  if (file.size > MAX_BYTES) {
    throw new Error(
      `La foto excede el límite de ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB`,
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(
      `Formato no soportado (${file.type || "desconocido"}). Usa JPG, PNG o WebP.`,
    );
  }

  const ext = sanitizeExt(file.name, file.type);
  const baseName = sanitizeName(stripExt(file.name)).slice(0, 60) || "producto";
  const stamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  // Sin id de ítem en el path: la foto se sube ANTES de crear el ítem.
  const storage_path = `items/${stamp}-${random}-${baseName}.${ext}`;

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage.from(BUCKET).upload(storage_path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`Error al subir la foto: ${error.message}`);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storage_path);
  if (!pub?.publicUrl) throw new Error("No se pudo resolver la URL pública de la foto");
  return { url: pub.publicUrl, storage_path };
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
  const fromName = name.includes(".") ? name.split(".").pop()?.toLowerCase() : null;
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}
