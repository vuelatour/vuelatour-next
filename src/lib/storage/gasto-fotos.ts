import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const BUCKET = "gasto-fotos";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
// Facturas y recibos: fotos o PDF. El bucket es PRIVADO (se muestra con URLs
// firmadas por el API, igual que las fotos que sube el piloto desde la app).
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

/**
 * Sube el comprobante de un gasto (foto o PDF de la factura) al bucket privado
 * `gasto-fotos` desde el navegador (la policy permite INSERT a autenticados —
 * mismo mecanismo que la app del piloto). Devuelve el PATH para gasto.foto_url.
 */
export async function uploadGastoComprobante(file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new Error(
      `El archivo excede el límite de ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB`,
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(
      `Formato no soportado (${file.type || "desconocido"}). Permitidos: JPG, PNG, WebP, HEIC o PDF.`,
    );
  }

  const ext = sanitizeExt(file.name, file.type);
  const baseName = sanitizeName(stripExt(file.name)).slice(0, 60) || "comprobante";
  const stamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const path = `oficina/${stamp}-${random}-${baseName}.${ext}`;

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`Error al subir el comprobante: ${error.message}`);
  return path;
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
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/heic") return "heic";
  if (contentType === "application/pdf") return "pdf";
  return "bin";
}
