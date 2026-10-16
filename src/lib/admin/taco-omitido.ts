/**
 * Tacómetro OMITIDO por tramo (15-oct-2026, API 0.0.81) — FUENTE ÚNICA del
 * panel para textos y decisiones de UI.
 *
 * Pedido del cliente (captura del vuelo #300): «necesito una opción para
 * omitir la captura del tacómetro porque falló el tacómetro y no había forma
 * de registrarlo, debemos poder completarlo para que no salga la alerta en
 * reportes» … «Debe tener el porqué se omitió el tacómetro y saber quién lo
 * registró así».
 *
 * Reglas (las decide el API; aquí solo se pintan):
 *  - el tramo omitido NO exige llegada, aporta 0 h (nadie inventa lecturas)
 *    y queda auditado (quién, cuándo, motivo);
 *  - el vuelo NO se completa solo: la oficina pulsa «Completar vuelo» (o
 *    «Iniciar y completar» si nunca se inició en la app);
 *  - una llegada REAL posterior retira la omisión sola (en el API).
 *
 * PURO: sin React ni red, sin dinero. Los textos están CONGELADOS en
 * `lib/admin/__tests__/taco-omitido.test.ts`: nadie los redacta por su cuenta.
 */

import { esErrorTecnico, MSG_SERVIDOR_NO_RESPONDIO } from "@/lib/admin/errores-tecnicos";
import { fmtDateTime, fmtDateTimeShort } from "@/lib/datetime";

/** Roles de oficina que pueden omitir/deshacer (espejo de `taco/confirm` en el API). */
export const ROLES_OMITIR_TACO = ["ADMIN", "COORDINADOR", "FACTURACION"] as const;
/**
 * Roles que pueden «Completar vuelo» / «Iniciar y completar»: espejo EXACTO
 * de `@Roles` de `POST :id/start` y `POST :id/complete` en el API. FACTURACION
 * omite pero NO completa (el API le responde 403 «Required role: …» en
 * inglés): a ella el panel no le ofrece el botón ni la acción del toast.
 */
export const ROLES_COMPLETAR_VUELO = ["ADMIN", "COORDINADOR", "PILOTO"] as const;
export const MOTIVO_OMISION_MIN = 10;
export const MOTIVO_OMISION_MAX = 500;
export const MOTIVOS_OMISION_FRECUENTES = [
  "Falló el tacómetro",
  "Lectura ilegible y sin forma de recuperarla",
  "No se tomó la foto",
] as const;

// Botón y ayuda (card «Tacómetros por tramo» y Tacómetros en vivo)
export const BOTON_OMITIR_TACO = "Omitir tacómetro";
export const AYUDA_OMITIR_TACO =
  "No hubo forma de capturar la lectura (falló el tacómetro, foto ilegible…): el tramo deja de pedirla, aporta 0 h y queda registrado quién y por qué.";

// Diálogo de omisión
export const tituloOmitir = (ruta: string) => `Omitir tacómetro · ${ruta}`;
export const CONSECUENCIAS_OMITIR = [
  "El tramo deja de pedir la lectura de llegada: sale de Tacómetros en vivo, de los avisos al piloto y del pre-cierre.",
  "Aporta 0 h al avión y al cierre: el sistema NO inventa ninguna lectura.",
  "Queda registrado quién lo omitió, cuándo y por qué (se ve en el vuelo, en el reporte por vuelo y en el balance).",
  "Si después aparece la lectura real, captúrala: la omisión se retira sola.",
] as const;
export const ETIQUETA_MOTIVO_OMISION = "Motivo (obligatorio)";
export const PLACEHOLDER_MOTIVO_OMISION =
  "Ej. Falló el tacómetro; no hubo forma de registrar la llegada";
export const AYUDA_CHIPS_MOTIVO = "Motivos frecuentes (puedes editarlos):";
export const contadorMotivo = (n: number) =>
  `${n}/${MOTIVO_OMISION_MAX} · mínimo ${MOTIVO_OMISION_MIN}`;
export const ERROR_MOTIVO_CORTO = `Escribe el motivo (mínimo ${MOTIVO_OMISION_MIN} caracteres).`;
export const BOTON_CONFIRMAR_OMITIR = "Omitir tacómetro";
export const BOTON_OMITIENDO = "Omitiendo…";

// Tramo omitido (card, taco-live, encabezado y lista)
export const BADGE_TACO_OMITIDO = "Tacómetro omitido";
export const BADGE_OMITIDO_CORTO = "Omitido";

/** «Omitido por Itzi · 15 oct 2026, 10:40 a.m. · Falló el tacómetro» (hora Cancún). */
export const textoOmitidoPor = (p: {
  nombre?: string | null;
  at?: string | null;
  motivo?: string | null;
}) =>
  `Omitido por ${p.nombre?.trim() || "oficina"}${p.at ? ` · ${fmtDateTime(p.at)}` : ""}${
    p.motivo ? ` · ${p.motivo}` : ""
  }`;

export const NOTA_TRAMO_OMITIDO =
  "No pide lectura y aporta 0 h. Si al final hay lectura, captúrala con «Corregir» y la omisión se retira sola.";
export const TITULO_BADGE_LISTA_OMITIDO =
  "Tacómetro omitido en algún tramo (sin lectura, con motivo): abre el vuelo para ver el motivo.";

/** Lo mínimo de un tramo para decir «T1 CET → CUN: Omitido por …». */
export interface EscalaOmitidaRef {
  orden: number;
  origen_iata: string;
  destino_iata: string;
  cancelada_at?: string | null;
  taco_omitido_at?: string | null;
  taco_omitido_motivo?: string | null;
  taco_omitido_por_nombre?: string | null;
}

/**
 * `title` del badge del encabezado del vuelo: una línea por tramo omitido
 * («T1 CET → CUN: Omitido por Itzi · … · Falló el tacómetro»), unidas con
 * salto de línea. El número es la POSICIÓN entre los tramos vivos por
 * `orden` (el mismo «Tramo N» de la card y de la app; nunca «T100»).
 */
export function tituloBadgeOmitido(escalas: readonly EscalaOmitidaRef[]): string {
  const vivas = escalas
    .filter((e) => !e.cancelada_at)
    .sort((a, b) => a.orden - b.orden);
  const lineas: string[] = [];
  vivas.forEach((e, i) => {
    if (!esTramoOmitido(e)) return;
    lineas.push(
      `T${i + 1} ${e.origen_iata} → ${e.destino_iata}: ${textoOmitidoPor({
        nombre: e.taco_omitido_por_nombre,
        at: e.taco_omitido_at,
        motivo: e.taco_omitido_motivo,
      })}`,
    );
  });
  return lineas.join("\n");
}

// Deshacer
export const BOTON_DESHACER_OMISION = "Deshacer";
export const tituloDeshacer = (ruta: string) => `Deshacer la omisión · ${ruta}`;
export const DESCRIPCION_DESHACER_OMISION =
  "El tramo vuelve a pedir su lectura de llegada (el piloto recibe un aviso). Si el vuelo estaba COMPLETADO, regresa a EN VUELO hasta que se capture. Queda registrado quién lo deshizo.";
export const BOTON_CONFIRMAR_DESHACER = "Deshacer la omisión";
export const BOTON_DESHACIENDO = "Deshaciendo…";

// Toasts
export const TOAST_OMITIDO = "Tacómetro omitido: el tramo ya no pide lectura (aporta 0 h).";
export const TOAST_OMITIDO_FALTAN = "Tacómetro omitido. Aún faltan lecturas en otros tramos.";
export const toastOmitidoCompletable = (folio: number) =>
  `Tacómetro omitido. El vuelo #${folio} ya se puede completar.`;
export const toastOmitidoIniciar = (folio: number) =>
  `Tacómetro omitido. El vuelo #${folio} nunca se inició en la app: inícialo y complétalo.`;
/** Sin permiso de completar (FACTURACION): lo dice y no ofrece la acción. */
export const toastOmitidoCompletableSinPermiso = (folio: number) =>
  `Tacómetro omitido. El vuelo #${folio} ya se puede completar: avisa a coordinación para completarlo.`;
export const toastOmitidoIniciarSinPermiso = (folio: number) =>
  `Tacómetro omitido. El vuelo #${folio} nunca se inició en la app: avisa a coordinación para iniciarlo y completarlo.`;
export const ACCION_COMPLETAR_VUELO = "Completar vuelo";
export const ACCION_INICIAR_Y_COMPLETAR = "Iniciar y completar";
export const TOAST_OMISION_DESHECHA =
  "Omisión deshecha: el tramo vuelve a pedir su lectura (el piloto recibió un aviso).";
export const TOAST_VUELO_COMPLETADO = (folio: number) => `Vuelo #${folio} completado`;
export const ERROR_API_PREVIO_OMITIR =
  "Esta opción necesita el API 0.0.81 (omitir tacómetro). Avisa a sistemas.";

// «Completar vuelo» de un vuelo PROPIO con omisiones (barra de acciones)
export const tituloCompletarConOmision = (folio: number) => `¿Completar vuelo #${folio}?`;
export const descripcionCompletarConOmision = (n: number) =>
  `${n} tramo${n === 1 ? "" : "s"} con tacómetro OMITIDO (sin lectura, 0 h) y el resto con su llegada. Al completarlo entra al cierre con las horas que sí se capturaron.`;
export const tituloIniciarYCompletar = (folio: number) =>
  `¿Iniciar y completar el vuelo #${folio}?`;
export const DESCRIPCION_INICIAR_Y_COMPLETAR =
  "Este vuelo nunca se inició en la app. Se marcará EN VUELO y, enseguida, COMPLETADO con las horas que sí se capturaron.";

/**
 * «Iniciar y completar» a medias: el `start` pasó (el vuelo YA quedó EN
 * VUELO) pero el `complete` falló. Se dice tal cual para que la oficina no
 * crea que no pasó nada; la barra ya ofrece «Completar vuelo».
 */
export const errorIniciadoSinCompletar = (mensaje?: string | null) =>
  `El vuelo ya quedó EN VUELO, pero no se pudo completar: ${
    esErrorTecnico({ error: mensaje }) ? "el servidor no respondió" : mensaje
  }. Pulsa «Completar vuelo».`;

// Pre-cierre (renglón tacometros_omitidos)
export const motivoTramoOmitidoPreCierre = (t: {
  omitido_por_nombre?: string | null;
  omitido_at?: string | null;
  motivo?: string | null;
}) =>
  `Omitido por ${t.omitido_por_nombre?.trim() || "oficina"}${
    t.omitido_at ? ` (${fmtDateTimeShort(t.omitido_at)})` : ""
  }: ${t.motivo ?? "sin motivo"}`;

// ---------------------------------------------------------------------------
// Predicados (sin dinero: solo decisiones de UI)
// ---------------------------------------------------------------------------

type TacoValor = string | number | null | undefined;

interface EscalaTacoRef {
  cancelada_at?: string | null;
  taco_salida?: TacoValor;
  taco_llegada?: TacoValor;
  taco_omitido_at?: string | null;
}

/** ¿Tramo con tacómetro omitido? Solo la fecha manda (el CHECK del API garantiza el motivo). */
export function esTramoOmitido(e: { taco_omitido_at?: string | null }): boolean {
  return e.taco_omitido_at != null && e.taco_omitido_at !== "";
}

/**
 * Fila de Tacómetros en vivo: `omitido: true` (llave nueva del API) o, por si
 * acaso, la fecha de la omisión. Aquí (puro) y no en el tablero: la página
 * (server component) también la usa para su contador «por revisar».
 */
export function escalaLiveOmitida(e: {
  omitido?: boolean;
  taco_omitido_at?: string | null;
}): boolean {
  return e.omitido === true || esTramoOmitido(e);
}

/** ¿Este tramo todavía exige su lectura de llegada? Vivo, sin llegada y no omitido. */
export function tramoExigeLlegada(e: EscalaTacoRef): boolean {
  return !e.cancelada_at && e.taco_llegada == null && !esTramoOmitido(e);
}

/** Largo del motivo como lo cuenta el API (trim + espacios dobles → uno). */
export function largoMotivoOmision(motivo: string): number {
  return motivo.trim().replace(/\s+/g, " ").length;
}

/** ¿El motivo alcanza el mínimo? (el API vuelve a validar: 400 MOTIVO_INVALIDO). */
export function motivoOmisionValido(motivo: string): boolean {
  const n = largoMotivoOmision(motivo);
  return n >= MOTIVO_OMISION_MIN && n <= MOTIVO_OMISION_MAX;
}

/**
 * ¿Se ofrece «Omitir tacómetro»? Rol de oficina, vuelo propio que no está
 * COMPLETADO ni CANCELADO, tramo vivo, sin llegada y no omitido. Un vuelo
 * nunca iniciado (RESERVA…CONFIRMADO, caso #301/#279) SÍ se puede omitir.
 */
export function puedeOmitirTaco(p: {
  rol: string | null | undefined;
  escala: {
    cancelada_at?: string | null;
    taco_llegada?: TacoValor;
    taco_omitido_at?: string | null;
  };
  vuelo: { estado: string; es_externo: boolean };
}): boolean {
  return esRolOmitirTaco(p.rol) && tramoOmitible(p);
}

/** ¿El rol puede completar (e iniciar) el vuelo? (`ROLES_COMPLETAR_VUELO`). */
export function esRolCompletarVuelo(rol: string | null | undefined): boolean {
  return !!rol && (ROLES_COMPLETAR_VUELO as readonly string[]).includes(rol);
}

/** ¿El rol es de oficina con permiso de omitir/deshacer? */
export function esRolOmitirTaco(rol: string | null | undefined): boolean {
  return !!rol && (ROLES_OMITIR_TACO as readonly string[]).includes(rol);
}

/**
 * La parte de `puedeOmitirTaco` que no depende del rol (la card recibe el
 * permiso ya resuelto como booleano): vuelo propio no COMPLETADO/CANCELADO y
 * tramo vivo, sin llegada y no omitido.
 */
export function tramoOmitible(p: {
  escala: {
    cancelada_at?: string | null;
    taco_llegada?: TacoValor;
    taco_omitido_at?: string | null;
  };
  vuelo: { estado: string; es_externo: boolean };
}): boolean {
  if (p.vuelo.es_externo) return false;
  if (p.vuelo.estado === "CANCELADO" || p.vuelo.estado === "COMPLETADO") return false;
  if (p.escala.cancelada_at) return false;
  if (p.escala.taco_llegada != null) return false;
  return !esTramoOmitido(p.escala);
}

/**
 * Falta algún tacómetro en un tramo vivo NO omitido (badge «Tacómetro
 * incompleto» del detalle y botón «Propagar lecturas»). Sin tramos vivos ⇒
 * true (mismo criterio que el badge del API). Un omitido sin salida NO falta.
 */
export function faltaTacoSinOmitidos(escalas: readonly EscalaTacoRef[]): boolean {
  const vivas = escalas.filter((e) => !e.cancelada_at);
  if (vivas.length === 0) return true;
  return vivas.some(
    (e) => !esTramoOmitido(e) && (e.taco_salida == null || e.taco_llegada == null),
  );
}

const ESTADOS_NUNCA_INICIADO = ["RESERVA", "SOLICITUD", "COTIZADO", "CONFIRMADO"];

/**
 * ¿Ofrecer «Completar vuelo» / «Iniciar y completar» por omisión? Solo un
 * vuelo PROPIO con al menos un tramo omitido y ninguna llegada exigible
 * pendiente. Sin omitidos el estado lo deriva la captura (como siempre).
 */
export function completableConOmision(
  vuelo: { estado: string; es_externo: boolean },
  escalas: readonly EscalaTacoRef[],
): { completable: boolean; requiereIniciar: boolean; omitidos: number } {
  const vivas = escalas.filter((e) => !e.cancelada_at);
  const omitidos = vivas.filter(esTramoOmitido).length;
  const exigibles = vivas.filter(tramoExigeLlegada);
  if (vuelo.es_externo || omitidos === 0 || vivas.length === 0 || exigibles.length > 0) {
    return { completable: false, requiereIniciar: false, omitidos };
  }
  return {
    completable: vuelo.estado === "EN_VUELO",
    requiereIniciar: ESTADOS_NUNCA_INICIADO.includes(vuelo.estado),
    omitidos,
  };
}

/**
 * Lista de vuelos: ¿pedir `taco-status` de este vuelo? Todo vuelo PROPIO no
 * cancelado — también los nunca iniciados (RESERVA…CONFIRMADO), que pueden
 * llevar un tramo omitido pendiente de «Iniciar y completar» (#301/#279).
 */
export function pideTacoStatusEnLista(v: { es_externo: boolean; estado: string }): boolean {
  return !v.es_externo && v.estado !== "CANCELADO";
}

/**
 * Lista de vuelos: el triángulo «tacómetro incompleto» solo aplica a vuelos
 * en curso o cerrados (el API dice `falta: true` de un vuelo futuro sin
 * lecturas, y eso no es una falta).
 */
export function faltaTacoEnLista(estado: string, falta: boolean | undefined): boolean {
  return falta === true && (estado === "EN_VUELO" || estado === "COMPLETADO");
}

/**
 * Toast tras omitir: qué sigue (completar, iniciar y completar, o nada).
 * `puedeCompletar` = `esRolCompletarVuelo(rol)`: sin él (FACTURACION) el
 * toast pide avisar a coordinación y NO trae acción (el API le daría 403).
 */
export function mensajeOmision(
  r: { vuelo: { folio: number; completable: boolean; requiere_iniciar?: boolean } },
  faltanOtras: boolean,
  puedeCompletar: boolean,
): { texto: string; accion: "completar" | "iniciar_y_completar" | null } {
  if (r.vuelo.completable) {
    return puedeCompletar
      ? { texto: toastOmitidoCompletable(r.vuelo.folio), accion: "completar" }
      : { texto: toastOmitidoCompletableSinPermiso(r.vuelo.folio), accion: null };
  }
  if (r.vuelo.requiere_iniciar) {
    return puedeCompletar
      ? { texto: toastOmitidoIniciar(r.vuelo.folio), accion: "iniciar_y_completar" }
      : { texto: toastOmitidoIniciarSinPermiso(r.vuelo.folio), accion: null };
  }
  return { texto: faltanOtras ? TOAST_OMITIDO_FALTAN : TOAST_OMITIDO, accion: null };
}

/**
 * Mensaje de un fallo de omitir/deshacer. Un 404 SIN el código de negocio
 * `ESCALA_NO_EXISTE` es «Cannot POST/DELETE» (API previo sin la ruta); un
 * texto técnico se cambia por «el servidor no respondió»; lo demás es el
 * mensaje es-MX del API tal cual.
 */
export function errorDeOmision(res: {
  error?: string;
  code?: string;
  status?: number;
}): string {
  if (res.status === 404 && res.code !== "ESCALA_NO_EXISTE") return ERROR_API_PREVIO_OMITIR;
  if (esErrorTecnico(res)) return MSG_SERVIDOR_NO_RESPONDIO;
  return res.error as string;
}
