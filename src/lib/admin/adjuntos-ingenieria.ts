/**
 * EVIDENCIAS Y DOCUMENTOS de ingeniería (17-nov-2026, API 0.0.140, invariante
 * 135 del API). Pedido del cliente: «cada que se le da un mantenimiento el
 * taller te entrega un sticker, como evidencia de que sí se le hizo… la idea
 * es que le tomen foto y lo suban, o el PDF… porque a veces las piden,
 * entonces poder descargarlas» y «poder subir uno o varios documentos por
 * componente para comprobar el cambio de componente, a lo mejor una factura».
 *
 * FUENTE ÚNICA (PURA, sin React) de los textos, del catálogo de tipos de
 * documento y de la subida paso a paso. Ningún componente redacta estas
 * frases. El archivo vive en el bucket privado `documentos-flota` (lo sube el
 * navegador) y el API lo registra y lo firma: la ruta del bucket nunca se pinta.
 */
import { fmtDate } from "@/lib/datetime";
import type {
  AdjuntoIngenieria,
  DestinoAdjunto,
  EtiquetaAdjunto,
} from "@/types/engineering";
import {
  errorIngenieriaDe,
  mensajeErrorBase,
  type ErrorIngenieria,
} from "./ingenieria-errores";

/** Espejo del tope del API (409 `TOPE_ADJUNTOS`). */
export const TOPE_ADJUNTOS_POR_DESTINO = 20;

/** Espejo del bucket `documentos-flota` (migración 20260810000002). */
export const MAX_BYTES_ADJUNTO = 10 * 1024 * 1024;
export const TIPOS_ADJUNTO = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
/** Valor del atributo `accept` del selector de archivos. */
export const ACCEPT_ADJUNTO = TIPOS_ADJUNTO.join(",");
export const TOPE_NOTA_ADJUNTO = 300;
export const AYUDA_FORMATOS_ADJUNTO = "Foto (JPG, PNG o WebP) o PDF, hasta 10 MB cada uno.";

/** Catálogo de tipos de documento, en el orden del selector. */
export const ETIQUETAS_ADJUNTO: readonly {
  value: EtiquetaAdjunto;
  label: string;
  ayuda: string;
}[] = [
  {
    value: "STICKER",
    label: "Sticker / etiqueta de servicio",
    ayuda: "La etiqueta que entrega el taller al terminar el servicio.",
  },
  {
    value: "FACTURA",
    label: "Factura",
    ayuda: "Factura del servicio o de la compra de la pieza.",
  },
  {
    value: "CERTIFICADO",
    label: "Certificado",
    ayuda: "Certificado de la pieza o del trabajo (conformidad, liberación).",
  },
  {
    value: "ORDEN_TRABAJO",
    label: "Orden de trabajo",
    ayuda: "La orden de trabajo del taller.",
  },
  {
    value: "BITACORA",
    label: "Bitácora",
    ayuda: "Foto de la anotación en la bitácora.",
  },
  { value: "OTRO", label: "Otro", ayuda: "Cualquier otro documento." },
];

/** Nombre del tipo de documento; sin tipo (o uno que el panel no conoce) ⇒ «Documento». */
export function etiquetaAdjunto(etiqueta: string | null | undefined): string {
  return ETIQUETAS_ADJUNTO.find((e) => e.value === etiqueta)?.label ?? "Documento";
}

/** Tipo sugerido al subir: el sticker en un mantenimiento; la factura en una pieza. */
export function etiquetaPorDefecto(destino: DestinoAdjunto): EtiquetaAdjunto {
  return destino === "MANTENIMIENTO" ? "STICKER" : "FACTURA";
}

export type TipoArchivo = "pdf" | "imagen" | "otro";

/** Para elegir el ícono: PDF, foto u otro. */
export function tipoArchivo(mime: string | null | undefined): TipoArchivo {
  if (mime === "application/pdf") return "pdf";
  if (typeof mime === "string" && mime.startsWith("image/")) return "imagen";
  return "otro";
}

/** «850 KB», «1.2 MB». Sin número válido ⇒ «—». */
export function tamanoLegible(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Los archivos de UN destino (una orden, un componente, un motor o una hélice). */
export function adjuntosDeDestino(
  adjuntos: readonly AdjuntoIngenieria[],
  destino: DestinoAdjunto,
  destinoId: string,
): AdjuntoIngenieria[] {
  return adjuntos.filter((a) => a.destino === destino && a.destino_id === destinoId);
}

/** En un mantenimiento se habla de «evidencias»; en una pieza, de «documentos». */
function sustantivo(destino: DestinoAdjunto): { uno: string; varios: string } {
  return destino === "MANTENIMIENTO"
    ? { uno: "evidencia", varios: "evidencias" }
    : { uno: "documento", varios: "documentos" };
}

/** «Evidencias» / «Documentos». */
export function tituloAdjuntos(destino: DestinoAdjunto): string {
  const s = sustantivo(destino).varios;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** «Sin evidencias» · «1 evidencia» · «3 documentos». */
export function textoContadorAdjuntos(n: number, destino: DestinoAdjunto): string {
  const s = sustantivo(destino);
  if (n <= 0) return `Sin ${s.varios}`;
  return n === 1 ? `1 ${s.uno}` : `${n} ${s.varios}`;
}

/** Texto del botón de subir. */
export function textoSubirAdjunto(destino: DestinoAdjunto): string {
  return `Subir ${sustantivo(destino).uno}`;
}

/** Título del diálogo de subida. */
export function tituloSubirAdjunto(destino: DestinoAdjunto): string {
  return destino === "MANTENIMIENTO"
    ? "Subir evidencia del mantenimiento"
    : "Subir documento";
}

/** Orden COMPLETADA sin evidencia: se invita, no se regaña. */
export const TEXTO_INVITA_STICKER =
  "Sin evidencia: sube la foto o el PDF del sticker que entregó el taller.";

/** «850 KB · 17/11/2026 · Itzi» (quién, solo si el API lo manda). */
export function textoMetaAdjunto(
  a: Pick<AdjuntoIngenieria, "bytes" | "created_at" | "subido_por_nombre">,
): string {
  return [tamanoLegible(a.bytes), fmtDate(a.created_at), a.subido_por_nombre]
    .filter((x): x is string => Boolean(x) && x !== "—")
    .join(" · ");
}

/** Confirmación de «Quitar» (regla permanente: toda acción destructiva confirma). */
export function textoConfirmarQuitarAdjunto(nombre: string): {
  titulo: string;
  descripcion: string;
  boton: string;
} {
  return {
    titulo: "Quitar archivo",
    descripcion: `«${nombre}» dejará de aparecer aquí. No se puede deshacer desde el panel.`,
    boton: "Quitar",
  };
}

export const TEXTO_ADJUNTOS_NO_CARGARON =
  "No se pudieron cargar los archivos (no es que no haya).";

/** Mensaje en es-MX de un error del API al subir, abrir o quitar un archivo. */
export function mensajeErrorAdjunto(e: ErrorIngenieria): string {
  switch (e.code) {
    case "TOPE_ADJUNTOS":
      return `Ya hay ${TOPE_ADJUNTOS_POR_DESTINO} archivos aquí: quita alguno antes de subir otro.`;
    case "ARCHIVO_YA_REGISTRADO":
      return "Ese archivo ya estaba registrado.";
    case "ARCHIVO_NO_ENCONTRADO":
      return "El archivo no terminó de subir. Vuelve a intentarlo.";
    case "DESTINO_NO_ENCONTRADO":
      return "El registro al que pertenece ya no existe. Recarga la página.";
    default:
      return mensajeErrorBase(e);
  }
}

/** Lo mínimo que la subida necesita saber de un archivo (un `File` lo cumple). */
export interface ArchivoSubible {
  name: string;
  size: number;
  type: string;
}

/** Motivo en es-MX por el que un archivo NO se puede subir; `null` = sí se puede. */
export function validarArchivoAdjunto(f: ArchivoSubible): string | null {
  if (!(TIPOS_ADJUNTO as readonly string[]).includes(f.type)) {
    return "formato no soportado: sube una foto (JPG, PNG, WebP) o un PDF";
  }
  if (f.size > MAX_BYTES_ADJUNTO) return "pesa más de 10 MB";
  if (f.size <= 0) return "el archivo está vacío";
  return null;
}

export interface ResultadoSubida<A> {
  subidos: A[];
  fallidos: { nombre: string; motivo: string }[];
}

export interface PasosSubida<F extends ArchivoSubible, A> {
  /** Sube el archivo al bucket y devuelve su ruta. */
  subir: (archivo: F) => Promise<string>;
  /** Registra en el API el archivo ya subido. */
  registrar: (ruta: string, archivo: F) => Promise<A>;
  /** Borra del bucket un archivo que no se pudo registrar (mejor esfuerzo). */
  limpiar: (ruta: string) => Promise<void>;
  /** Aviso de avance: cuántos van de cuántos. */
  alAvanzar?: (hechos: number, total: number) => void;
}

/**
 * Sube VARIOS archivos, uno por uno: valida → sube al bucket → registra en el
 * API. Si el registro falla, el objeto recién subido se BORRA del bucket (no
 * se dejan huérfanos). Un archivo que falla no detiene a los demás: el
 * resultado dice cuáles subieron y cuáles no, con su motivo.
 */
export async function subirAdjuntos<F extends ArchivoSubible, A>(
  archivos: readonly F[],
  pasos: PasosSubida<F, A>,
): Promise<ResultadoSubida<A>> {
  const res: ResultadoSubida<A> = { subidos: [], fallidos: [] };
  let hechos = 0;
  for (const archivo of archivos) {
    const invalido = validarArchivoAdjunto(archivo);
    if (invalido) {
      res.fallidos.push({ nombre: archivo.name, motivo: invalido });
    } else {
      let ruta: string | null = null;
      try {
        ruta = await pasos.subir(archivo);
        res.subidos.push(await pasos.registrar(ruta, archivo));
      } catch (e) {
        // Subió pero no se registró: se retira del bucket.
        if (ruta) await pasos.limpiar(ruta).catch(() => undefined);
        const err = errorIngenieriaDe(e);
        res.fallidos.push({
          nombre: archivo.name,
          // `uploadDocumentoFlota` lanza `Error` con su texto en es-MX (sin
          // status ni code): se pinta tal cual.
          motivo:
            err.status === undefined && err.code === undefined && err.message
              ? err.message
              : mensajeErrorAdjunto(err),
        });
      }
    }
    hechos += 1;
    pasos.alAvanzar?.(hechos, archivos.length);
  }
  return res;
}

/** Qué decir al terminar la subida: todo bien, a medias o nada. */
export function textoResultadoSubida(
  res: ResultadoSubida<unknown>,
): { tipo: "exito" | "parcial" | "error"; texto: string } {
  const ok = res.subidos.length;
  const mal = res.fallidos.length;
  const detalle = res.fallidos.map((f) => `${f.nombre} (${f.motivo})`).join("; ");
  if (mal === 0) {
    return {
      tipo: "exito",
      texto: ok === 1 ? "Se subió 1 archivo." : `Se subieron ${ok} archivos.`,
    };
  }
  if (ok === 0) {
    return {
      tipo: "error",
      texto:
        mal === 1
          ? `No se pudo subir ${detalle}.`
          : `No se pudo subir ningún archivo: ${detalle}.`,
    };
  }
  return {
    tipo: "parcial",
    texto: `${ok === 1 ? "Se subió 1" : `Se subieron ${ok}`} de ${ok + mal} archivos. No se pudo subir: ${detalle}.`,
  };
}

/** «Subiendo 2 de 5…» */
export function textoAvanceSubida(hechos: number, total: number): string {
  return total <= 1 ? "Subiendo…" : `Subiendo ${Math.min(hechos + 1, total)} de ${total}…`;
}
