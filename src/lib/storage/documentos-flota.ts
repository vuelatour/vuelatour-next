import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const BUCKET = "documentos-flota";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
// DEBE coincidir con allowed_mime_types del bucket (migración
// 20260810000002): un tipo fuera de esta lista lo rechaza Storage.
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

/**
 * Sube la COPIA de un documento de la flota (permiso, licencia, seguro) al
 * bucket privado `documentos-flota` desde el navegador. Devuelve el PATH para
 * guardar en `vencimiento.archivo_url`. Se ve con URL firmada
 * (GET /v1/expirations/:id/archivo), nunca pública.
 */
export async function uploadDocumentoFlota(file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new Error(
      `El archivo pesa más de ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB. Comprime el PDF o toma la foto en menor resolución.`,
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(
      `Formato no soportado (${file.type || "desconocido"}). Sube una foto (JPG, PNG, WebP) o un PDF.`,
    );
  }

  const ext = sanitizeExt(file.name, file.type);
  const baseName =
    sanitizeName(stripExt(file.name)).slice(0, 60) || "documento";
  const stamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const path = `oficina/${stamp}-${random}-${baseName}.${ext}`;

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`No se pudo subir el documento: ${error.message}`);
  return path;
}

/**
 * Borra un objeto del bucket (limpieza de huérfanos: archivo subido y luego
 * reemplazado/quitado sin guardar). Best-effort — solo el dueño puede
 * (policy delete-own); si falla, no interrumpe el flujo.
 */
export async function deleteDocumentoFlota(path: string): Promise<void> {
  if (!path) return;
  try {
    const supabase = createSupabaseBrowserClient();
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // best-effort: un huérfano no rompe nada (mismo criterio que gasto-fotos)
  }
}

/**
 * File → base64 SIN prefijo data: (contrato de POST /v1/expirations/extraer).
 * Límite 8 MB: más allá, el base64 (~+33%) rebasa el bodySizeLimit de las
 * server actions — el caller salta la lectura IA y sigue en captura manual.
 */
export const MAX_BYTES_IA = 8 * 1024 * 1024;

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
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
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "application/pdf") return "pdf";
  return "bin";
}
