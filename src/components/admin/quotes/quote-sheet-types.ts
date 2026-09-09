import type { ReactNode } from "react";
import type { EscalaInput, ExtraConcepto, TuaLinea } from "@/types/quote";

/**
 * Tipos del contrato de la HOJA editable (`QuoteSheet`, form-as-document
 * 8-sep-2026). La hoja NO conoce react-hook-form: recibe el subconjunto de
 * valores del cotizador que se IMPRIMEN y devuelve cada cambio por
 * `onCambio(campo, valor)` (el cotizador lo mapea a `setValue`). Todo lo
 * que produce números sin imprimirse (tarifa, sobrevuelo, cobrable, comisión
 * del vendedor, método de pago, BillPocket, redondeo, cotización abierta,
 * pase de abordar, externo/costo, ruta operativa, notas internas, toggles
 * del PDF) vive en el bloque «Interno · no se imprime» del cotizador y NO
 * entra aquí.
 */

/** Valores del form que la hoja edita o imprime (nombres RHF del cotizador). */
export interface QuoteSheetValores {
  cliente_id: string;
  aeronave_id: string;
  pasajeros: number;
  /** `datetime-local` de PARED Cancún ("YYYY-MM-DDTHH:mm") o "". */
  fecha_vuelo: string;
  fecha_traslado_final: string;
  escalas: EscalaInput[];
  tuas_lineas: TuaLinea[];
  cobrar_tuas: boolean;
  extras: ExtraConcepto[];
  descuento_usd: number | null;
  /** FRACCIÓN (0.16); la hoja muestra %. */
  iva_pct_override: number | null;
  tc_usd_mxn: number | null;
  notas: string;
  pdf_mostrar_tarifa: boolean;
  pdf_mostrar_itinerario: boolean;
  es_externo: boolean;
  avion_externo_modelo: string;
  avion_externo_matricula: string;
}

export type CampoHojaId = keyof QuoteSheetValores;

export type OnCambioHoja = <K extends CampoHojaId>(campo: K, valor: QuoteSheetValores[K]) => void;

/**
 * Destino en «Interno · no se imprime › Tarifa y horas» que la hoja pide
 * abrir (feedback 9-sep-2026: «¿dónde se ajusta la hora volada por tramo y
 * la tarifa por hora?»). La hoja NO edita tarifa ni horas: solo señala dónde
 * viven. Anclas: `tarifa-override-field` (o `tarifa-tipo-field` sin
 * override), `cobrable-field`, `sobrevuelo-field`.
 */
export type DestinoInterno = "tarifa" | "cobrable" | "sobrevuelo";

export type OnAbrirInterno = (destino: DestinoInterno) => void;

export interface AeropuertoHoja {
  iata: string;
  nombre: string;
  latitud?: number | string | null;
  longitud?: number | string | null;
}

export interface AeronaveHoja {
  id: string;
  matricula: string;
  modelo: string;
  asientos?: number;
  velocidad_crucero_kts?: number;
  /** Texto secundario de la opción (kts · asientos · tarifas). */
  descripcion?: string;
  /** Sin tarifa configurada (y cliente no interno): no seleccionable. */
  disabled?: boolean;
}

export interface ClienteHoja {
  id: string;
  nombre: string;
  descripcion?: string;
}

export interface RutaHoja {
  tramos?: { origen_iata: string; destino_iata: string; millas_nauticas: number }[];
}

/** Identidad y datos de cabecera que la hoja imprime pero no edita. */
export interface DocumentoHoja {
  /** Folio guardado; null en el alta ("se asigna al guardar"). */
  folio: string | number | null;
  /** ISO de la fecha de cotización (confirmación ?? solicitud); null → «Por confirmar». */
  fechaCotizacion: string | null;
  /** «REDONDO» / «MULTIESCALA» (texto del PDF). */
  tipo: string;
  empresa?: string;
  /** Nombre del cliente cuando NO se puede cambiar (revisión). */
  clienteNombre?: string | null;
  /**
   * Modelos cotizados según el API (`modelos_cotizados`); null = derivar del
   * avión seleccionado / breakdown. Jamás matrícula.
   */
  modelosCotizados?: string[] | null;
  /** Matrícula del avión cotizado (regla VGV en la sublínea de la ruta). */
  matricula?: string | null;
  quoteId?: string;
}

/** Accesores por tramo que decide el padre (alta: form; revisión: escala viva). */
export interface TramoPdfAccesores {
  /** Tramo OCULTO del PDF (no se imprime; se sigue cobrando). */
  oculto?: (idx: number, leg: EscalaInput) => boolean;
  /** Fecha de PARED 'YYYY-MM-DD' que imprime el PDF para el tramo (null = sin fecha). */
  fechaPdf?: (idx: number, leg: EscalaInput) => string | null;
  /** Alta: la hoja edita `escalas[].pdf_oculto` / `pdf_fecha` en el form. */
  onOcultoChange?: (idx: number, oculto: boolean) => void;
  onFechaPdfChange?: (idx: number, fecha: string | null) => void;
  /**
   * Revisión: los toggles del workspace (PATCH por escala) se montan en el
   * margen de la fila en vez de los del form. null = nada para ese tramo.
   */
  margen?: (idx: number, leg: EscalaInput) => ReactNode;
}
