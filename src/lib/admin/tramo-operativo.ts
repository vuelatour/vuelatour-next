/**
 * TRAMO OPERATIVO vs TRAMO DEL CLIENTE (30-sep-2026, API 0.0.46, vuelo #364).
 *
 * Caso real: Itzi dio de alta el #364 con `CUN→CET` y `CET→PTU` (los dos
 * ferry, 0 pax) y al día siguiente Pablo agregó desde la app `PTU→CUN` con 4
 * pasajeros. El API lo guardó como tramo OPERATIVO (`solo_operativa = true`,
 * `orden = 100`) aunque llevaba a los pasajeros del cliente: la app lo pintó
 * «Interno (no del cliente)» y «tramo 100», y lo peor, ese tramo quedó fuera
 * de la cotización, del precio y del reparto. Pregunta del cliente: «¿por
 * qué aparece ese aviso? ¿a qué se refiere?».
 *
 * MODELO (contrato API ⇄ panel ⇄ app):
 * - Tramo DEL CLIENTE (comercial): `solo_operativa = false`, `orden` 1..n. Se
 *   cotiza, se cobra, reparte la venta y sale en el PDF.
 * - Tramo OPERATIVO: `solo_operativa = true`, `orden ≥ 100`. Ferry,
 *   posicionamiento o parada técnica: no se cobra ni entra a la cotización.
 * - Desde el API 0.0.46, `POST /v1/flights/:id/operational-legs` decide con
 *   `ubicarTramoAgregado` (`vuelatour-api/src/modules/flights/
 *   tramo-agregado.util.ts`, fuente única): OPERATIVO si es FERRY o parada de
 *   SERVICIO SIN pasajeros (posicionamiento a mantenimiento). Una parada de
 *   servicio CON pasajeros es del cliente (en prod #150, #84 y #57 dejan el
 *   avión en el taller con el cliente a bordo y están cotizados). Todo lo
 *   demás entra como tramo del cliente con el siguiente `orden` comercial, y
 *   la cotización avisa que la operación difiere y ofrece adoptarlo
 *   (`divergenciasDeOperacion`). EXCEPCIÓN (freno de cronología, «horas
 *   sagradas»): si ya hay un operativo vivo en `orden ≥ 100` que voló, está
 *   volando o sale ANTES que el nuevo, el tramo del cliente queda OPERATIVO
 *   (la cadena de tacómetros camina por `orden`) y el API lo avisa en
 *   `aviso`. El API responde el aditivo `comercial: boolean` + `aviso`.
 *
 * FUENTE ÚNICA de estos textos en el panel (espejo de los de la app). Ningún
 * componente los redacta por su cuenta.
 */

/** Etiqueta del tramo operativo (antes «Interno»; la app decía «Interno (no
 *  del cliente)», que nadie entendía). */
export const ETIQUETA_TRAMO_OPERATIVO = "Operativo · no cotizado";

/** Ayuda (tooltip) de la etiqueta: qué ES un tramo operativo. */
export const AYUDA_TRAMO_OPERATIVO =
  "Posicionamiento, ferry o parada técnica: no se cobra ni entra a la cotización";

/** Chip ámbar: tramo operativo que lleva pasajeros (dato legado como el #364
 *  antes de la corrección del API). */
export const CHIP_OPERATIVO_CON_PAX =
  "Lleva pasajeros y no está cotizado: revisa la cotización";

/** Ayuda del chip ámbar: qué hacer con él. */
export const AYUDA_OPERATIVO_CON_PAX =
  "Este tramo quedó como operativo (no entra a la cotización) aunque lleva pasajeros. Revisa que la cotización lo cobre: «Actualizar la cotización con la operación» no lo trae.";

/** Aviso informativo al AGREGAR un tramo que será del cliente. */
export const AVISO_TRAMO_NUEVO_COMERCIAL =
  "Este tramo es del cliente: la cotización mostrará que la operación difiere para adoptarlo";

/** Aviso informativo al AGREGAR un tramo ferry o parada técnica sin pasajeros. */
export const AVISO_TRAMO_NUEVO_OPERATIVO = "Tramo operativo: no se cotiza";

/**
 * Aviso del formulario cuando el tramo es del cliente pero el FRENO DE
 * CRONOLOGÍA del API lo dejará operativo (espejo, en futuro, de
 * `AVISO_TRAMO_CLIENTE_OPERATIVO` del API: ese llega en la respuesta y es el
 * que sale en el toast).
 */
export const AVISO_TRAMO_NUEVO_CLIENTE_OPERATIVO =
  "Este tramo es del cliente, pero va después de un tramo operativo (ferry o posicionamiento) del vuelo: quedará como operativo y no entrará a la cotización. Si hay que cobrarlo, agrégalo como ajuste o extra en la cotización";

/** Rango de `orden` de los tramos OPERATIVOS (espejo de `OPERATIVA_ORDEN_BASE`). */
export const OPERATIVA_ORDEN_BASE = 100;

/** Lo que el formulario sabe del tramo que se va a agregar. */
export interface TramoNuevoRef {
  esFerry: boolean;
  esServicio: boolean;
  /** Pasajeros capturados (0 / vacío = sin pasajeros). */
  pasajeros?: number | string | null;
  /** ISO UTC de la salida planeada del tramo nuevo (vacío = sin fecha). */
  fechaSalidaPlan?: string | null;
  /**
   * TODAS las escalas del vuelo (canceladas incluidas: ocupan su `orden`).
   * Ausente = no se sabe ⇒ no se evalúa el freno de cronología.
   */
  existentes?: ReadonlyArray<EscalaExistenteRef>;
}

/** Fila existente del vuelo que lee el freno de cronología. */
export interface EscalaExistenteRef {
  orden?: number | string | null;
  cancelada_at?: string | null;
  taco_salida?: number | string | null;
  taco_salida_origen?: string | null;
  taco_llegada?: number | string | null;
  fecha_salida_plan?: string | null;
}

const llevaPax = (p: unknown): boolean => {
  const n = Number(p ?? 0);
  return Number.isFinite(n) && n > 0;
};

const ordenDe = (e: EscalaExistenteRef): number | null => {
  const n = Math.trunc(Number(e.orden));
  return Number.isFinite(n) && n >= 1 ? n : null;
};

const msDe = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
};

/** ¿Ya voló o está volando? (una salida DEDUCIDA es solo una copia). */
const yaArranco = (e: EscalaExistenteRef): boolean => {
  if (e.taco_llegada != null) return true;
  return e.taco_salida != null && e.taco_salida_origen !== "DEDUCIDO";
};

/**
 * Regla 1 del API (`esTramoOperativo`): ferry, o parada de SERVICIO SIN
 * pasajeros. Un tramo sin ferry con 0 pasajeros también es del cliente.
 */
export function tramoNuevoEsOperativo(p: {
  esFerry: boolean;
  esServicio: boolean;
  pasajeros?: number | string | null;
}): boolean {
  if (p.esFerry) return true;
  return p.esServicio && !llevaPax(p.pasajeros);
}

/**
 * Cómo quedará el tramo nuevo, ESPEJO EXACTO de `ubicarTramoAgregado` del
 * API (sin el número de `orden`, que el panel no necesita):
 * - `OPERATIVO`: ferry o servicio vacío;
 * - `CLIENTE_OPERATIVO`: del cliente, pero el freno de cronología lo deja
 *   operativo (o ya no cabe en el rango comercial 1..99);
 * - `COMERCIAL`: del cliente, entra a la cotización como operación que difiere.
 * La decisión real es del API: el toast lee su RESPUESTA (`mensajeTramoAgregado`).
 */
export type TipoTramoNuevo = "COMERCIAL" | "OPERATIVO" | "CLIENTE_OPERATIVO";

export function tipoTramoNuevo(p: TramoNuevoRef): TipoTramoNuevo {
  if (tramoNuevoEsOperativo(p)) return "OPERATIVO";
  if (!p.existentes) return "COMERCIAL";
  const ocupados = new Set(
    p.existentes.map(ordenDe).filter((n): n is number => n != null),
  );
  const activos = p.existentes.filter((e) => !e.cancelada_at);
  const fechaNuevo = msDe(p.fechaSalidaPlan);
  const operativoAntes = activos.some((e) => {
    const o = ordenDe(e);
    if (o == null || o < OPERATIVA_ORDEN_BASE) return false;
    if (yaArranco(e)) return true;
    const f = msDe(e.fecha_salida_plan);
    return fechaNuevo != null && f != null && f < fechaNuevo;
  });
  let orden =
    activos
      .map(ordenDe)
      .filter((n): n is number => n != null && n < OPERATIVA_ORDEN_BASE)
      .reduce((m, n) => Math.max(m, n), 0) + 1;
  while (ocupados.has(orden)) orden++;
  if (operativoAntes || orden >= OPERATIVA_ORDEN_BASE) return "CLIENTE_OPERATIVO";
  return "COMERCIAL";
}

/** Aviso del formulario «Agregar tramo», según lo que se está capturando. */
export function avisoTramoNuevo(p: TramoNuevoRef): {
  tipo: TipoTramoNuevo;
  comercial: boolean;
  texto: string;
} {
  const tipo = tipoTramoNuevo(p);
  return {
    tipo,
    comercial: tipo === "COMERCIAL",
    texto:
      tipo === "COMERCIAL"
        ? AVISO_TRAMO_NUEVO_COMERCIAL
        : tipo === "CLIENTE_OPERATIVO"
          ? AVISO_TRAMO_NUEVO_CLIENTE_OPERATIVO
          : AVISO_TRAMO_NUEVO_OPERATIVO,
  };
}

/** Forma mínima de una escala que leen estos helpers. */
export interface EscalaOperativaRef {
  solo_operativa?: boolean | null;
  es_ferry?: boolean | null;
  pasajeros?: number | string | null;
  cancelada_at?: string | null;
}

/**
 * ¿Pintar el chip ámbar «Lleva pasajeros y no está cotizado»? Solo para un
 * tramo OPERATIVO, vivo (uno cancelado no voló: nada que cobrar) y que no sea
 * ferry (un ferry vuela vacío por definición y la card ya dice «Ferry ·
 * vacío»; el API guarda 0 pax) con pasajeros > 0.
 *
 * NUNCA en un vuelo con `itinerario_operativo = true`: ahí las escalas son
 * la ruta REAL a propósito y la cotización es OTRA ruta (CUN→…→CUN) que no
 * se cruza por tramo (`divergenciasDeOperacion` devuelve `[]`). En prod los
 * 7 operativos con pasajeros de esos vuelos (#129, #147, #213, #251, #282,
 * #283, #290) SÍ están en lo cotizado: decir «no está cotizado» sería falso
 * y enseñaría a ignorar el chip. `undefined` (API previo) ⇒ se evalúa.
 */
export function operativoConPasajeros(
  e: EscalaOperativaRef,
  opts: { itinerarioOperativo?: boolean | null } = {},
): boolean {
  if (opts.itinerarioOperativo === true) return false;
  if (e.solo_operativa !== true) return false;
  if (e.cancelada_at) return false;
  if (e.es_ferry === true) return false;
  return llevaPax(e.pasajeros);
}

/** Lo que responde `POST /v1/flights/:id/operational-legs` (lo que lee el toast). */
export interface TramoAgregadoRef {
  solo_operativa?: boolean | null;
  /** Aditivo del API 0.0.46. Ausente = API previo (todo entraba operativo). */
  comercial?: boolean | null;
  /** Aditivo del API 0.0.46: del cliente («…ofrecerá adoptarlo.») o tramo
      del cliente que el freno de cronología dejó operativo. null = nada. */
  aviso?: string | null;
}

/**
 * ¿El tramo que el API ACABA de crear quedó como del cliente? Se lee de la
 * RESPUESTA, nunca de lo que se pidió: con un API previo todo entraba como
 * operativo y el mensaje tiene que decir la verdad.
 */
export function tramoAgregadoEsComercial(r: TramoAgregadoRef): boolean {
  if (typeof r.comercial === "boolean") return r.comercial;
  return r.solo_operativa === false;
}

/**
 * Toast tras agregar el tramo (título + descripción opcional). El `aviso` del
 * API SIEMPRE se dice cuando llega: en un tramo operativo es el freno de
 * cronología («Este tramo es del cliente, pero va después de un tramo
 * operativo…») y la oficina TIENE que enterarse (`advertencia` ⇒ toast
 * ámbar).
 */
export function mensajeTramoAgregado(
  r: TramoAgregadoRef,
  vueloCompletado: boolean,
): { titulo: string; descripcion?: string; advertencia: boolean } {
  const comercial = tramoAgregadoEsComercial(r);
  const avisoApi = (r.aviso ?? "").trim();
  const base = vueloCompletado
    ? "Tramo agregado; el vuelo vuelve a EN VUELO"
    : comercial
      ? "Tramo del cliente agregado"
      : "Tramo operativo agregado (no se cotiza)";
  if (!comercial) {
    if (avisoApi) return { titulo: base, descripcion: avisoApi, advertencia: true };
    return vueloCompletado
      ? { titulo: base, descripcion: `${AVISO_TRAMO_NUEVO_OPERATIVO}.`, advertencia: false }
      : { titulo: base, advertencia: false };
  }
  return {
    titulo: base,
    descripcion: avisoApi || `${AVISO_TRAMO_NUEVO_COMERCIAL}.`,
    advertencia: false,
  };
}
