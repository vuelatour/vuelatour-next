import {
  CAMPOS_FISCALES_CLIENTE,
  datosFiscalesFaltantes,
  type DatosFiscalesCliente,
} from "@/types/clients";

export const TEXTO_FISCALES_COMPLETOS = "Datos fiscales completos";
export const TEXTO_FISCALES_SIN_CAPTURAR = "Faltan datos fiscales";
export const TITULO_FISCALES_FALTAN = "Lo que falta para timbrar el CFDI de este cliente";

/**
 * Badge «RFC / Datos fiscales» de la tabla de clientes (3-nov-2026). A medias
 * dice QUÉ falta («Falta: Uso CFDI», «Faltan: RFC, Código postal»): la
 * oficina guardaba RFC, razón social, régimen y CP, leía «Faltan datos
 * fiscales» y entendía que no se había guardado nada (faltaba el uso CFDI).
 * Sin nada capturado sigue el texto corto: un catálogo con cien clientes sin
 * datos no necesita la lista completa en cada fila.
 */
export function etiquetaDatosFiscales(c: DatosFiscalesCliente): {
  completos: boolean;
  texto: string;
} {
  const faltan = datosFiscalesFaltantes(c);
  if (faltan.length === 0) return { completos: true, texto: TEXTO_FISCALES_COMPLETOS };
  if (faltan.length === CAMPOS_FISCALES_CLIENTE.length) {
    return { completos: false, texto: TEXTO_FISCALES_SIN_CAPTURAR };
  }
  return {
    completos: false,
    texto: `${faltan.length === 1 ? "Falta" : "Faltan"}: ${faltan.join(", ")}`,
  };
}
