/**
 * MODELO DE IA configurable — FUENTE ÚNICA del panel (2-oct-2026, API 0.0.51).
 * PURO (sin React ni red): lo pinta `configuracion/modelo-ia-card.tsx` y lo
 * valida `setModeloIaAction`.
 *
 * Pedido del cliente: «dejar una opción en la configuración para adaptar el
 * modelo que quieran utilizar, aunque ahorita dejaremos por default el que
 * estamos usando actualmente». Sin elección (lo de hoy) el API no manda
 * cabecera y pyservices usa su `ANTHROPIC_MODEL` (`claude-opus-4-8`).
 *
 * El CATÁLOGO es una COPIA literal del de `vuelatour-api/src/common/
 * ia-modelo.util.ts`: mismo id, nombre, descripción, orden y tarifa. Si el
 * API cambia un renglón, se cambia aquí en el mismo cambio — la prueba de
 * paridad (`__tests__/ia-modelo.test.ts`) lo exige leyendo el código del API.
 * Pyservices NO lleva catálogo: solo comparte la regex del id
 * (`app/services/modelo_ia.py`). Las TARIFAS por prefijo son copia de
 * `TARIFAS` de `vuelatour-api/src/modules/ia-uso/ia-uso.service.ts` (prefijo
 * desconocido ⇒ el API registra el consumo con costo 0).
 */
import { fmtUsd } from "@/lib/format";
import type { ModeloIa, ModeloIaCatalogoApi } from "@/types/ia-modelo";

/** Clave en `configuracion_sistema` (espejo de `CONFIG_IA_MODELO` del API). */
export const CLAVE_CONFIG_MODELO_IA = "ia_modelo";

/** USD por MILLÓN de tokens (entrada = lo que se le manda; salida = la respuesta). */
export interface TarifaModeloIa {
  inUsdPorMillon: number;
  outUsdPorMillon: number;
}

export interface ModeloIaCatalogo {
  id: string;
  /** Nombre corto que ve el operador. */
  nombre: string;
  /** Una línea: para qué sirve / cuánto cuesta frente a los demás. Puede ir vacía. */
  descripcion: string;
  tarifa: TarifaModeloIa;
}

/**
 * COPIA de `TARIFAS` del API (por PREFIJO del id: el id real trae sufijos de
 * versión, p. ej. `claude-haiku-4-5-20251001`). Orden del API.
 */
export const TARIFAS_IA_POR_PREFIJO: ReadonlyArray<{ prefijo: string } & TarifaModeloIa> = [
  { prefijo: "claude-opus-4-8", inUsdPorMillon: 5, outUsdPorMillon: 25 },
  { prefijo: "claude-opus-4-7", inUsdPorMillon: 5, outUsdPorMillon: 25 },
  { prefijo: "claude-opus-4-6", inUsdPorMillon: 5, outUsdPorMillon: 25 },
  // Opus 5.5 ANTES que `claude-opus-5`: gana la PRIMERA coincidencia por
  // prefijo y `claude-opus-5-5` también empieza con `claude-opus-5`.
  { prefijo: "claude-opus-5-5", inUsdPorMillon: 4, outUsdPorMillon: 20 },
  { prefijo: "claude-opus-5", inUsdPorMillon: 5, outUsdPorMillon: 25 },
  { prefijo: "claude-sonnet-4-6", inUsdPorMillon: 3, outUsdPorMillon: 15 },
  { prefijo: "claude-sonnet-5", inUsdPorMillon: 2, outUsdPorMillon: 10 },
  { prefijo: "claude-haiku-4-5", inUsdPorMillon: 1, outUsdPorMillon: 5 },
];

/**
 * CATÁLOGO de modelos que se ofrecen (COPIA del `CATALOGO_BASE` del API, con
 * la tarifa que le da `TARIFAS`). El primero es el que usa HOY el servidor.
 *
 * SOLO modelos que, como el de hoy, NO piensan cuando pyservices omite
 * `thinking` (revisión del API del 2-oct-2026): Sonnet 5 y Opus 5.5 corren
 * thinking ADAPTATIVO y esos tokens se comen los `max_tokens` chicos de
 * pyservices (la lectura de un ticket o tacómetro podía salir truncada).
 * Siguen elegibles por «Otro» (con su aviso y su tarifa).
 */
export const CATALOGO_MODELOS_IA: ReadonlyArray<ModeloIaCatalogo> = [
  {
    id: "claude-opus-4-8",
    nombre: "Claude Opus 4.8",
    descripcion: "el que usa hoy el servidor; el más preciso",
    tarifa: { inUsdPorMillon: 5, outUsdPorMillon: 25 },
  },
  {
    id: "claude-sonnet-4-6",
    nombre: "Claude Sonnet 4.6",
    descripcion: "más barato (≈ 40 % menos por token)",
    tarifa: { inUsdPorMillon: 3, outUsdPorMillon: 15 },
  },
  {
    id: "claude-haiku-4-5-20251001",
    nombre: "Claude Haiku 4.5",
    descripcion: "el más barato y rápido; menos preciso en tickets difíciles",
    tarifa: { inUsdPorMillon: 1, outUsdPorMillon: 5 },
  },
];

/**
 * Id aceptable (espejo de `esIdModeloValido` del API y de `modelo_actual()`
 * de pyservices): un id FUERA del catálogo se acepta si cumple esto.
 */
export const REGEX_ID_MODELO_IA = /^claude-[a-z0-9.-]{3,80}$/;

/** Valor de la opción «Otro (escribir id)» del selector (no cumple la regex: no choca con un id). */
export const OPCION_OTRO_MODELO_IA = "__otro__";

// ── Textos (es-MX) ──────────────────────────────────────────────────────────

export const TITULO_MODELO_IA = "Modelo de IA";
export const DESCRIPCION_MODELO_IA =
  "El modelo de Claude que lee los tickets, tacómetros, PDFs y hace las sugerencias. Si no eliges uno, se usa el del servidor.";
export const ETIQUETA_DEFAULT_SERVIDOR = "default del servidor";
export const ETIQUETA_ELEGIDO_AQUI = "elegido en Configuración";
export const ETIQUETA_SELECTOR_MODELO_IA = "Modelo a usar";
export const ETIQUETA_OTRO_MODELO_IA = "Otro (escribir id)";
export const AYUDA_OTRO_MODELO_IA = "Para un modelo que no está en la lista.";
export const ETIQUETA_GUARDAR_MODELO_IA = "Guardar";
export const ETIQUETA_VOLVER_SERVIDOR_IA = "Volver al del servidor";
/** COPIA de `AVISO_SIN_TARIFA` del API (mismo texto en las dos pantallas). */
export const TEXTO_SIN_TARIFA_IA =
  "Sin tarifa conocida: el consumo se registra con costo 0 hasta agregar su tarifa.";
/** COPIA de `AVISO_FUERA_DE_CATALOGO` del API: un id mal escrito tumba las lecturas. */
export const TEXTO_FUERA_DE_CATALOGO_IA =
  "Este modelo no está en el catálogo: verifica que el id exista en Anthropic; si no existe, las lecturas con IA fallarán hasta corregirlo.";
/** COPIA de `MENSAJE_MODELO_INVALIDO` del API (el 400 y el campo dicen lo mismo). */
export const TEXTO_ID_MODELO_INVALIDO =
  "El id del modelo no es válido: debe empezar con «claude-» y llevar solo minúsculas, números, puntos o guiones (por ejemplo, claude-sonnet-4-6).";
export const TEXTO_MODELO_IA_NO_CARGO =
  "No se pudo cargar qué modelo de IA está en uso. Recarga la página para reintentar.";
export const TEXTO_SERVIDOR_SIN_CONFIRMAR =
  "No se pudo consultar al servidor de IA. Si todavía no está actualizado, seguirá usando su propio modelo hasta que lo esté.";
export const TEXTO_SIN_PERMISO_MODELO_IA = "Solo un administrador puede cambiar el modelo de IA.";
export const TEXTO_MODELO_IA_NO_DISPONIBLE = "Disponible cuando se actualice el servidor.";
export const TEXTO_ERROR_GUARDAR_MODELO_IA = "No se pudo guardar el modelo de IA. Intenta de nuevo.";
/** 401 (sesión vencida con la página abierta): el API lo dice en inglés. */
export const TEXTO_SESION_VENCIDA_MODELO_IA = "Tu sesión venció: vuelve a iniciar sesión e intenta de nuevo.";

// ── Reglas ──────────────────────────────────────────────────────────────────

/** Sin espacios y en minúsculas (los ids de Anthropic lo son). */
export function normalizarIdModeloIa(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

/** ¿Es un id que el API y pyservices aceptan? (sin normalizar: exacto). */
export function esIdModeloValido(id: unknown): id is string {
  return typeof id === "string" && REGEX_ID_MODELO_IA.test(id);
}

export function modeloDelCatalogo(id: string | null | undefined): ModeloIaCatalogo | null {
  if (!id) return null;
  return CATALOGO_MODELOS_IA.find((m) => m.id === id) ?? null;
}

/**
 * Tarifa del id con la MISMA regla del API (`costoIaUsd`): el primer prefijo
 * que coincide; ninguno ⇒ `null` (el consumo se registra con costo 0).
 */
export function tarifaModeloIa(id: string | null | undefined): TarifaModeloIa | null {
  const m = normalizarIdModeloIa(id);
  if (!m) return null;
  const t = TARIFAS_IA_POR_PREFIJO.find((x) => m.startsWith(x.prefijo));
  return t ? { inUsdPorMillon: t.inUsdPorMillon, outUsdPorMillon: t.outUsdPorMillon } : null;
}

/** «$5 / $25 por millón de tokens». */
export function textoTarifaIa(t: TarifaModeloIa): string {
  return `${fmtUsd(t.inUsdPorMillon)} / ${fmtUsd(t.outUsdPorMillon)} por millón de tokens`;
}

/**
 * Nombre para el operador: el del catálogo del panel; si no está, el que
 * mande el catálogo del API; si tampoco, el id tal cual.
 */
export function nombreModeloIa(
  id: string,
  catalogoApi?: ReadonlyArray<ModeloIaCatalogoApi> | null,
): string {
  const local = modeloDelCatalogo(id);
  if (local) return local.nombre;
  const api = catalogoApi?.find((m) => m?.id === id)?.nombre;
  return typeof api === "string" && api.trim() ? api.trim() : id;
}

/** «Claude Opus 4.8 (claude-opus-4-8)»; un id sin nombre se pinta una sola vez. */
export function etiquetaModeloIa(
  id: string,
  catalogoApi?: ReadonlyArray<ModeloIaCatalogoApi> | null,
): string {
  const nombre = nombreModeloIa(id, catalogoApi);
  return nombre === id ? id : `${nombre} (${id})`;
}

/** Opciones del selector: el catálogo (nombre + descripción + tarifa) y «Otro». */
export function opcionesModeloIa(): { value: string; label: string; description: string }[] {
  return [
    ...CATALOGO_MODELOS_IA.map((m) => ({
      value: m.id,
      label: m.nombre,
      description: [m.descripcion, textoTarifaIa(m.tarifa)].filter(Boolean).join(" · "),
    })),
    { value: OPCION_OTRO_MODELO_IA, label: ETIQUETA_OTRO_MODELO_IA, description: AYUDA_OTRO_MODELO_IA },
  ];
}

/** Lo que hay en el selector: una opción del catálogo, «Otro» + texto, o nada. */
export interface SeleccionModeloIa {
  opcion: string;
  otro: string;
}

/** El modelo que hoy está EN USO (el elegido o, sin elección, el del servidor). */
export function modeloEnUsoIa(datos: Pick<ModeloIa, "configurado" | "default_servidor" | "efectivo">): string | null {
  return datos.efectivo ?? datos.configurado ?? datos.default_servidor ?? null;
}

/** El selector arranca en el modelo EN USO (un id fuera del catálogo ⇒ «Otro» con su id). */
export function seleccionInicialModeloIa(
  datos: Pick<ModeloIa, "configurado" | "default_servidor" | "efectivo">,
): SeleccionModeloIa {
  const enUso = modeloEnUsoIa(datos);
  if (!enUso) return { opcion: "", otro: "" };
  if (modeloDelCatalogo(enUso)) return { opcion: enUso, otro: "" };
  return { opcion: OPCION_OTRO_MODELO_IA, otro: enUso };
}

export type ValidacionModeloIa =
  | { ok: true; modelo: string }
  | { ok: false; motivo: "vacio" | "invalido"; texto: string | null };

/** El id que se guardaría con la selección actual (normalizado y validado). */
export function validarSeleccionModeloIa(sel: SeleccionModeloIa): ValidacionModeloIa {
  if (sel.opcion === OPCION_OTRO_MODELO_IA) {
    const id = normalizarIdModeloIa(sel.otro);
    if (!id) return { ok: false, motivo: "vacio", texto: null };
    return esIdModeloValido(id)
      ? { ok: true, modelo: id }
      : { ok: false, motivo: "invalido", texto: TEXTO_ID_MODELO_INVALIDO };
  }
  if (!sel.opcion) return { ok: false, motivo: "vacio", texto: null };
  return esIdModeloValido(sel.opcion)
    ? { ok: true, modelo: sel.opcion }
    : { ok: false, motivo: "invalido", texto: TEXTO_ID_MODELO_INVALIDO };
}

/**
 * Error bajo el campo «Id del modelo» (opción «Otro»): solo después de que el
 * operador SALIÓ del campo (`tocado`). Mientras escribe («c», «claude-»…) no
 * se le marca en rojo —ni se dispara el lector de pantalla a media captura—:
 * basta con que «Guardar» siga apagado. Ya tocado, se revalida al escribir.
 */
export function errorCampoOtroModeloIa(validacion: ValidacionModeloIa, tocado: boolean): string | null {
  if (!tocado || validacion.ok || validacion.motivo !== "invalido") return null;
  return validacion.texto;
}

/**
 * ¿«Guardar» cambiaría algo? Elegir el mismo que ya está en uso no hace
 * nada (sin elección, elegir el del servidor tampoco: seguiría igual).
 */
export function hayCambioModeloIa(
  datos: Pick<ModeloIa, "configurado" | "default_servidor" | "efectivo">,
  modelo: string | null,
): boolean {
  if (!modelo) return false;
  return modelo !== modeloEnUsoIa(datos);
}

/** «Modelo en uso: …» — la etiqueta y la marca de dónde sale. */
export function textoModeloEnUsoIa(
  datos: Pick<ModeloIa, "configurado" | "default_servidor" | "efectivo" | "catalogo">,
): { modelo: string; marca: string } {
  const enUso = modeloEnUsoIa(datos);
  const marca = datos.configurado ? ETIQUETA_ELEGIDO_AQUI : ETIQUETA_DEFAULT_SERVIDOR;
  if (!enUso) return { modelo: "el del servidor (no se pudo consultar cuál es)", marca };
  return { modelo: etiquetaModeloIa(enUso, datos.catalogo), marca };
}

/**
 * Hay un modelo elegido pero pyservices no contestó cuál es su default
 * (`default_servidor` null): un pyservices previo IGNORA la cabecera, así que
 * no se puede afirmar que la elección ya aplica.
 */
export function avisoServidorSinConfirmarIa(datos: Pick<ModeloIa, "configurado" | "default_servidor">): string | null {
  return datos.configurado && !datos.default_servidor ? TEXTO_SERVIDOR_SIN_CONFIRMAR : null;
}

/**
 * ESPEJO de `avisoModeloIa` del API: `null` sin modelo o con uno del
 * catálogo; fuera del catálogo, «verifica que el id exista» y —si tampoco
 * tiene tarifa— el de costo 0.
 */
export function avisoModeloIa(modelo: string | null | undefined): string | null {
  if (!esIdModeloValido(modelo) || modeloDelCatalogo(modelo)) return null;
  return tarifaModeloIa(modelo)
    ? TEXTO_FUERA_DE_CATALOGO_IA
    : `${TEXTO_FUERA_DE_CATALOGO_IA} ${TEXTO_SIN_TARIFA_IA}`;
}

export interface NotaModeloIa {
  tono: "neutro" | "ambar";
  texto: string;
}

/** «Tarifa: $5 / $25 por millón de tokens (entrada / salida, USD).» */
function textoLineaTarifa(t: TarifaModeloIa): string {
  return `Tarifa: ${textoTarifaIa(t)} (entrada / salida, USD).`;
}

/**
 * Nota de un modelo (bajo el selector y bajo «Modelo en uso»): del catálogo
 * ⇒ su tarifa (neutra); fuera del catálogo ⇒ ÁMBAR con el aviso del API y,
 * si se conoce, la tarifa.
 */
export function notaModeloIa(modelo: string | null | undefined): NotaModeloIa | null {
  if (!modelo) return null;
  const t = tarifaModeloIa(modelo);
  const aviso = avisoModeloIa(modelo);
  if (aviso) return { tono: "ambar", texto: t ? `${aviso} ${textoLineaTarifa(t)}` : aviso };
  return t ? { tono: "neutro", texto: textoLineaTarifa(t) } : { tono: "ambar", texto: TEXTO_SIN_TARIFA_IA };
}

/**
 * Nota del modelo EN USO: el `aviso` que manda el API manda (es del
 * configurado); sin la llave (API distinto) se usa el espejo. Sin aviso, la
 * tarifa del modelo en uso.
 */
export function notaModeloEnUsoIa(
  datos: Pick<ModeloIa, "configurado" | "default_servidor" | "efectivo" | "aviso">,
): NotaModeloIa | null {
  const aviso = datos.aviso !== undefined ? datos.aviso : avisoModeloIa(datos.configurado);
  if (aviso) return { tono: "ambar", texto: aviso };
  const t = tarifaModeloIa(modeloEnUsoIa(datos));
  return t ? { tono: "neutro", texto: textoLineaTarifa(t) } : null;
}

/**
 * Quién hizo el último cambio: «Elegido por Mari el 2 oct 2026, 10:15 a.m.»
 * o, tras «Volver al del servidor», «Se regresó al modelo del servidor
 * (Mari, 2 oct 2026, 10:15 a.m.).». Sin fecha (nunca se ha guardado) no se
 * dice nada. `fecha` ya viene formateada (hora Cancún) por quien llama: este
 * módulo es PURO.
 */
export function textoUltimoCambioModeloIa(
  datos: Pick<ModeloIa, "configurado" | "actualizado_at" | "actualizado_por_nombre">,
  fecha: string,
): string | null {
  if (!datos.actualizado_at) return null;
  const quien = datos.actualizado_por_nombre?.trim();
  const cuando = fecha.trim();
  if (!datos.configurado) {
    return `Se regresó al modelo del servidor (${quien ? `${quien}, ` : ""}${cuando}).`;
  }
  const texto = `Elegido${quien ? ` por ${quien}` : ""} el ${cuando}`;
  // La hora de es-MX ya cierra con punto («10:15 a.m.»): no se duplica.
  return texto.endsWith(".") ? texto : `${texto}.`;
}

const ALCANCE_MODELO_IA = "Las próximas lecturas de tickets, tacómetros, PDFs y sugerencias";
const PIE_CONFIRMAR_MODELO_IA = "El consumo se seguirá registrando por lectura.";

/** Confirmación de «Guardar» (contrato del 2-oct-2026). */
export function textoConfirmarModeloIa(nombre: string): string {
  return `${ALCANCE_MODELO_IA} usarán ${nombre}. ${PIE_CONFIRMAR_MODELO_IA}`;
}

/** Confirmación de «Volver al del servidor» (con su nombre si se sabe). */
export function textoConfirmarVolverServidorIa(
  defaultServidor: string | null | undefined,
  catalogoApi?: ReadonlyArray<ModeloIaCatalogoApi> | null,
): string {
  const quien = defaultServidor
    ? `el modelo del servidor, ${nombreModeloIa(defaultServidor, catalogoApi)}`
    : "el modelo que tenga configurado el servidor";
  return `${ALCANCE_MODELO_IA} usarán ${quien}. ${PIE_CONFIRMAR_MODELO_IA}`;
}

/** Qué se está confirmando: guardar el elegido o volver al del servidor. */
export type ConfirmacionModeloIa = { tipo: "guardar"; modelo: string } | { tipo: "servidor" };

export interface TextosConfirmacionModeloIa {
  titulo: string;
  texto: string;
  /**
   * ÁMBAR dentro de la descripción: un id FUERA del catálogo (opción «Otro»)
   * repite en el paso que confirma que, si no existe en Anthropic, TODAS las
   * lecturas con IA fallarán hasta corregirlo (nadie lo prueba al guardar).
   * `null` para un modelo del catálogo y para «Volver al del servidor».
   */
  aviso: string | null;
  /** Etiqueta del botón que confirma. */
  accion: string;
}

/** Textos del diálogo de confirmación (título, cuerpo, aviso y botón). */
export function textosConfirmacionModeloIa(
  c: ConfirmacionModeloIa,
  datos: Pick<ModeloIa, "default_servidor" | "catalogo">,
): TextosConfirmacionModeloIa {
  if (c.tipo === "servidor") {
    return {
      titulo: "¿Volver al modelo del servidor?",
      texto: textoConfirmarVolverServidorIa(datos.default_servidor, datos.catalogo),
      aviso: null,
      accion: "Sí, usar el del servidor",
    };
  }
  return {
    titulo: "¿Cambiar el modelo de IA?",
    texto: textoConfirmarModeloIa(nombreModeloIa(c.modelo, datos.catalogo)),
    aviso: avisoModeloIa(c.modelo),
    accion: "Sí, cambiar",
  };
}

/** Toast tras guardar. */
export function textoGuardadoModeloIa(
  datos: Pick<ModeloIa, "configurado" | "default_servidor" | "efectivo" | "catalogo">,
): string {
  const enUso = modeloEnUsoIa(datos);
  const nombre = enUso ? nombreModeloIa(enUso, datos.catalogo) : null;
  if (!datos.configurado) {
    return nombre
      ? `Listo. Se usará el modelo del servidor (${nombre}).`
      : "Listo. Se usará el modelo del servidor.";
  }
  return `Listo. Las próximas lecturas usarán ${nombre ?? datos.configurado}.`;
}

/** Mensajes del API que no se le enseñan al operador (inglés / técnicos). */
const MENSAJE_TECNICO =
  /^(Required role\b|Cannot (GET|PUT|POST|PATCH|DELETE)\b|Internal server error|fetch failed|Request failed|Bad Request|Forbidden|Not Found|Unauthorized|Invalid or expired token|Missing Bearer token|Malformed token)/i;

/** Error de guardado → texto es-MX. El texto del API en español gana salvo en los casos conocidos. */
export function mensajeErrorModeloIa(err: {
  code?: string | null;
  status?: number | null;
  error?: string | null;
}): string {
  const code = err.code ?? "";
  if (code === "MODELO_INVALIDO") return TEXTO_ID_MODELO_INVALIDO;
  // 401: la sesión venció con la página abierta («Invalid or expired token»,
  // «Missing Bearer token», «Malformed token», «Unauthorized» del API).
  if (err.status === 401 || code === "UNAUTHORIZED") return TEXTO_SESION_VENCIDA_MODELO_IA;
  if (err.status === 403 || code === "FORBIDDEN") return TEXTO_SIN_PERMISO_MODELO_IA;
  if (err.status === 404 || code === "NOT_FOUND") return TEXTO_MODELO_IA_NO_DISPONIBLE;
  const api = err.error?.trim();
  if (api && !MENSAJE_TECNICO.test(api)) return api;
  if (code === "BAD_REQUEST") return TEXTO_ID_MODELO_INVALIDO;
  return TEXTO_ERROR_GUARDAR_MODELO_IA;
}
