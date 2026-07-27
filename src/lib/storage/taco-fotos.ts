import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const BUCKET = "taco-fotos";
// DEBE coincidir con el bucket (allowed_mime_types / file_size_limit).
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Sube una foto de tacómetro al bucket privado `taco-fotos` desde el panel
 * (la policy permite INSERT a autenticados — mismo mecanismo que la app del
 * piloto). Devuelve el PATH para escala.foto_taco_salida_url/llegada_url.
 */
export async function uploadTacoFoto(file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new Error("La foto excede el límite de 5 MB");
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(
      `Formato no soportado (${file.type || "desconocido"}). Permitidos: JPG, PNG o WebP.`,
    );
  }
  const ext =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const stamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const path = `oficina/${stamp}-${random}.${ext}`;

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`Error al subir la foto: ${error.message}`);
  return path;
}
