import type { ReactNode } from "react";
import type {
  ComisionVendedorModo,
  EscalaInput,
  ExtraConcepto,
  MetodoPago,
  TipoTarifa,
  TuaLinea,
} from "@/types/quote";

/**
 * Tipos del contrato de la HOJA editable (`QuoteSheet`, form-as-document
 * 8-sep-2026). La hoja NO conoce react-hook-form: recibe el subconjunto de
 * valores del cotizador que se IMPRIMEN y devuelve cada cambio por
 * `onCambio(campo, valor)` (el cotizador lo mapea a `setValue`).
 *
 * `QuoteSheetValores` es lo que imprime la hoja del CLIENTE. Lo que decide
 * dinero sin imprimirse ahí (método de cobro, redondeo, marcas, notas
 * internas, tarifa, horas y la comisión del vendedor) vive en
 * `QuoteSheetValoresInterna` —el papel INTERNO sí tiene dónde ponerlo, cada
 * cosa en el renglón donde se LEE— y lo que ni siquiera eso (operador
 * externo, ruta operativa, detalle del motor) vive en un `<details>` DEBAJO
 * del papel desde el BLOQUE C de la Fase 2.3.
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
 * Lo que edita la HOJA INTERNA y la del CLIENTE ni imprime ni toca (Fase 2.3,
 * 22-sep-2026): el método de cobro PREVISTO con su comisión de terminal, el
 * redondeo, las marcas de la ficha, las notas internas (BLOQUE A) y —desde el
 * BLOQUE B— la TARIFA, las HORAS y la COMISIÓN DEL VENDEDOR. Bajaron del
 * panel lateral (ya retirado) al bloque del papel donde se LEEN: el
 * método a la cabecera de COBROS, el redondeo a su renglón del desglose, las
 * marcas a la fila «Marcas», la tarifa a la fila «Tarifa» de la ficha, el
 * sobrevuelo y el cobrable a «Horas cotizadas» y la comisión del vendedor bajo
 * «Vendedor».
 *
 * Es una interfaz APARTE (y no campos nuevos de `QuoteSheetValores`) porque la
 * hoja del cliente no tiene dónde ponerlos: ahí siguen viviendo en el panel,
 * que es lo único que ve un rol sin hoja interna (SOCIO).
 *
 * OJO con los dos campos que el PANEL `register`a sobre un `<input
 * type="number">` (`tarifa_hora_override_usd`, `sobrevuelo_hr`): ahí react-hook-form
 * guarda una CADENA. Se declaran como el form (`number | null`) y quien los
 * lee los pasa por `Number(...)`, igual que `armarCalcPayload`.
 */
export interface QuoteSheetValoresInterna extends QuoteSheetValores {
  metodo_pago: MetodoPago;
  /** Nombre manual del método cuando `metodo_pago === 'OTRO'`. */
  metodo_pago_detalle: string;
  /** Comisión de terminal % (BillPocket / Paywise): tope 20. */
  comision_billpocket_pct: number | null;
  redondeo_auto: boolean;
  redondeo_usd: number | null;
  cotizacion_abierta: boolean;
  pase_abordar: boolean;
  /** Solo se EDITAN en el alta: al revisar se cambian desde el vuelo. */
  notas_internas: string;
  // ----- BLOQUE B: tarifa, horas y comisión del vendedor -----
  tipo_tarifa: TipoTarifa;
  /** Modo «Personalizada» del segmento (estado de UI pegajoso; el diff lo ignora). */
  tarifa_personalizada: boolean;
  /** $/hr SOLO de esta cotización (6 decimales). Vacío = la pactada o la del avión. */
  tarifa_hora_override_usd: number | null;
  /** Horas de sobrevuelo: se suman al cobrable. */
  sobrevuelo_hr: number | null;
  /** COBRABLE pactado (hr, 8 decimales). Vacío = la regla del motor. */
  tiempo_cobrable_override_hr: number | null;
  comision_vendedor_modo: ComisionVendedorModo;
  comision_vendedor_usd: number | null;
  comision_vendedor_tarifa_hr: number | null;
  comision_vendedor_nombre: string;
}

export type CampoHojaInternaId = keyof QuoteSheetValoresInterna;

export type OnCambioHojaInterna = <K extends CampoHojaInternaId>(
  campo: K,
  valor: QuoteSheetValoresInterna[K],
) => void;

/**
 * Una `OnCambioHojaInterna` vale donde se pide una `OnCambioHoja`: los campos
 * de la hoja del cliente son un SUBCONJUNTO de los de la interna y para esas
 * claves el tipo del valor es el mismo. TypeScript no lo deduce entre dos
 * firmas genéricas, así que el estrechamiento se hace aquí —una vez, con su
 * motivo— en vez de con un `as` suelto en cada componente.
 */
export function comoOnCambioHoja(f: OnCambioHojaInterna): OnCambioHoja {
  return f as OnCambioHoja;
}

/**
 * Destino de «tarifa y horas» que un atajo de la hoja pide enfocar (feedback
 * 9-sep-2026: «¿dónde se ajusta la hora volada por tramo y la tarifa por
 * hora?»). Anclas: `tarifa-override-field` (o `tarifa-tipo-field` sin
 * override), `cobrable-field`, `sobrevuelo-field`.
 *
 * En la HOJA INTERNA esos campos viven en el papel desde el BLOQUE B, así que
 * el atajo solo hace scroll + foco a su renglón. La hoja del CLIENTE conserva
 * la prop, pero desde el BLOQUE C nadie se la pasa (el panel al que llevaba
 * se retiró) y su «· ajustar» no se pinta.
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
  /**
   * Mantenimiento en curso: la opción se MARCA en ámbar («En taller») pero
   * SIGUE elegible — las cotizaciones son a futuro (cliente, 11-sep-2026).
   * Nunca implica `disabled`.
   */
  enTaller?: boolean;
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
  /**
   * «Opera en N990GG (Seneca V)» (12-sep-2026): nota TENUE junto al selector
   * cuando el vuelo vuela hoy en un avión distinto al COTIZADO. NO se imprime
   * (`data-cot-ui`) y jamás cambia el selector: la cotización es independiente
   * de la operación. null = no se pinta.
   */
  operaEn?: string | null;
  /**
   * El vuelo YA VOLÓ y el operador cambió el avión de la cotización
   * (24-sep-2026, #338): «Este vuelo ya voló en N4142R. Cambiar el avión aquí
   * solo cambia con qué se cobra (Cessna 206); la operación no se mueve ni se
   * avisa a la tripulación.» (`textoCambioAvionVueloVolado`). Nota ÁMBAR junto
   * al selector, en las DOS hojas; croma (`data-cot-ui`), solo en edición.
   * Cuando viene, sustituye a `operaEn` (ya nombra el avión con que se voló).
   */
  avisoCambioAvion?: string | null;
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
