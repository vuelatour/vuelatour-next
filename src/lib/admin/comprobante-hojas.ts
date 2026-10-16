/**
 * COMPROBANTE CON VARIAS HOJAS (12-oct-2026). Pedido del cliente: «un
 * proveedor de gasolina nos emite como 5 comprobantes en PDF, y ahorita
 * solo nos deja subir un solo PDF… que sea general».
 *
 * El gasto guarda UN archivo principal (`gasto.foto_url`) y las hojas 2..N
 * en `valor_ia_extraido.fotos_adicionales` (paths del bucket `gasto-fotos`):
 * es el MISMO campo que la app del piloto usa para una factura multi-hoja y
 * el que lee el API al reanalizar con IA (invariante 46). Aquí vive la
 * regla PURA: qué hojas tiene un gasto, cómo se funden en el jsonb sin
 * perder la lectura de la IA, y qué archivos se aceptan.
 */

/** Tipos que acepta el bucket (migración 20260714000003 del API). */
export const TIPOS_COMPROBANTE = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
] as const;

/** Tope de archivos por gasto (principal + hojas). */
export const MAX_HOJAS_COMPROBANTE = 10;
/** Tope por archivo (el del bucket). */
export const MAX_BYTES_COMPROBANTE = 10 * 1024 * 1024;

export const TEXTO_HOJAS_IA =
  "La IA lee el PRIMER archivo; los demás se guardan como hojas del mismo comprobante (se ven en el gasto).";
export const ETIQUETA_AGREGAR_HOJAS = "Agregar hojas";
export const AYUDA_AGREGAR_HOJAS =
  "Varios PDF o fotos del mismo comprobante (p. ej. los 5 tickets de una carga de gasolina): quedan guardados con el gasto.";

/** Hojas 2..N del comprobante (paths), sin repetir el archivo principal. */
export function hojasDe(gasto: {
  foto_url?: string | null;
  valor_ia_extraido?: Record<string, unknown> | null;
}): string[] {
  const f = gasto.valor_ia_extraido?.fotos_adicionales;
  if (!Array.isArray(f)) return [];
  const principal = (gasto.foto_url ?? "").trim();
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const x of f) {
    if (typeof x !== "string" || !x.trim() || x === principal || vistos.has(x)) continue;
    vistos.add(x);
    out.push(x);
  }
  return out;
}

/** Todos los archivos del comprobante en orden: el principal y sus hojas. */
export function archivosDelComprobante(gasto: {
  foto_url?: string | null;
  valor_ia_extraido?: Record<string, unknown> | null;
}): string[] {
  const principal = (gasto.foto_url ?? "").trim();
  return [...(principal ? [principal] : []), ...hojasDe(gasto)];
}

/**
 * El jsonb que se guarda: la lectura de la IA tal cual + las hojas. Sin
 * hojas se QUITA la llave (un `[]` no aporta nada); sin lectura ni hojas ⇒
 * undefined (no viaja).
 */
export function valorIaConHojas(
  valorIa: Record<string, unknown> | null | undefined,
  hojas: readonly string[],
): Record<string, unknown> | undefined {
  const base: Record<string, unknown> = { ...(valorIa ?? {}) };
  delete base.disponible;
  delete base.motivo;
  const limpias = [...new Set(hojas.filter((h) => typeof h === "string" && h.trim()))];
  if (limpias.length > 0) base.fotos_adicionales = limpias;
  else delete base.fotos_adicionales;
  return Object.keys(base).length > 0 ? base : undefined;
}

/** «+2 hojas» para la columna «Comp.»; null sin hojas. */
export function textoHojas(n: number): string | null {
  if (!(n > 0)) return null;
  return n === 1 ? "+1 hoja" : `+${n} hojas`;
}

/** Tooltip de «+N hojas» (16-oct-2026: es un botón que abre el comprobante). */
export function tituloHojas(n: number): string {
  return n === 1
    ? "Este comprobante tiene una hoja más: clic para verla."
    : `Este comprobante tiene ${n} hojas más: clic para verlas.`;
}

export type VeredictoArchivos =
  | { ok: true; archivos: File[] }
  | { ok: false; mensaje: string; archivos: File[] };

/**
 * Qué archivos entran de una selección (del input o del arrastre): se quitan
 * los de tipo no admitido y los que pasan del peso, respetando el tope
 * total con los que ya había. Nunca se descarta en silencio: `mensaje`.
 */
export function aceptarArchivosComprobante(
  nuevos: readonly File[],
  yaHay: number,
): VeredictoArchivos {
  const admitidos: File[] = [];
  const rechazados: string[] = [];
  for (const f of nuevos) {
    if (!(TIPOS_COMPROBANTE as readonly string[]).includes(f.type)) {
      rechazados.push(`${f.name} (formato ${f.type || "desconocido"})`);
      continue;
    }
    if (f.size > MAX_BYTES_COMPROBANTE) {
      rechazados.push(`${f.name} (pesa más de ${MAX_BYTES_COMPROBANTE / 1024 / 1024} MB)`);
      continue;
    }
    admitidos.push(f);
  }
  const cupo = Math.max(0, MAX_HOJAS_COMPROBANTE - yaHay);
  const fuera = admitidos.length > cupo ? admitidos.slice(cupo) : [];
  const entran = admitidos.slice(0, cupo);
  const partes: string[] = [];
  if (rechazados.length > 0) {
    partes.push(`No se admiten: ${rechazados.join(", ")}. Usa foto (JPG/PNG/WebP), PDF, Excel (.xlsx) o CSV de hasta 10 MB.`);
  }
  if (fuera.length > 0) {
    partes.push(`Un comprobante admite hasta ${MAX_HOJAS_COMPROBANTE} archivos: ${fuera.length} se quedaron fuera.`);
  }
  if (partes.length === 0) return { ok: true, archivos: entran };
  return { ok: false, mensaje: partes.join(" "), archivos: entran };
}

/** Nombre corto para la lista de archivos del formulario. */
export function nombreCorto(nombre: string, max = 42): string {
  if (nombre.length <= max) return nombre;
  const i = nombre.lastIndexOf(".");
  const ext = i > 0 ? nombre.slice(i) : "";
  return `${nombre.slice(0, Math.max(8, max - ext.length - 1))}…${ext}`;
}

// ===== Textos de los diálogos (alta y «Verificar / editar») =====

export const TITULO_HOJAS_COMPROBANTE = "Hojas del comprobante";
export const BOTON_AGREGAR_COMPROBANTE = "Agregar comprobante";
export const TEXTO_NUEVA_HOJA = "nueva · se sube al guardar";
export const TITULO_QUITAR_HOJA = "¿Quitar esta hoja del comprobante?";
export const TEXTO_QUITAR_HOJA =
  "La hoja deja de verse en este gasto cuando guardes. El archivo no se borra del almacenamiento.";
export const BOTON_QUITAR_HOJA = "Quitar hoja";
export const TITULO_QUITAR_TODOS = "Quitar todos los archivos";
export const TITULO_QUITAR_PRINCIPAL = "Quitar la hoja principal (la siguiente pasa a serlo)";
export const AYUDA_VARIOS_ARCHIVOS =
  "puedes elegir o arrastrar VARIOS archivos: el primero es la hoja principal y los demás, hojas del mismo comprobante";

/** «Hoja 2 de 5» (la hoja principal es la 1). */
export function etiquetaHoja(numero: number, total: number): string {
  return `Hoja ${numero} de ${total}`;
}

/** «factura.pdf + 4 hojas» para la zona de arrastre del alta. */
export function textoArchivosZona(archivos: readonly { name: string }[]): string {
  const principal = archivos[0]?.name ?? "";
  const extra = archivos.length - 1;
  if (extra <= 0) return principal;
  return `${principal} + ${extra} ${extra === 1 ? "hoja" : "hojas"}`;
}

/** Toast del alta: con una hoja, el de siempre; con varias, cuántos archivos. */
export function toastGastoConComprobante(nArchivos: number): string {
  if (nArchivos <= 1) return "Gasto registrado con su factura";
  return `Gasto registrado con su comprobante (${nArchivos} archivos)`;
}

/** ¿Cambió la lista de hojas respecto a lo guardado (orden incluido)? */
export function hojasCambiaron(guardadas: readonly string[], actuales: readonly string[], nuevas: number): boolean {
  if (nuevas > 0) return true;
  if (guardadas.length !== actuales.length) return true;
  return actuales.some((p, i) => p !== guardadas[i]);
}
