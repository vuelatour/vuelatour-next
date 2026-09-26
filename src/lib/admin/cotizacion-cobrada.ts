import { fmtUsd } from "@/lib/format";
import { pendienteCobro } from "@/lib/admin/cobros";
import type { MeResponse } from "@/types/me";
import { ROLES_EDITAN_COTIZACION } from "@/lib/admin/quote-sheet-interna";

/**
 * EDITAR UNA COTIZACIÓN QUE YA TIENE COBROS — permiso POR PERSONA
 * (26-sep-2026, API 0.0.37). Lógica PURA del panel; prueba:
 * `__tests__/cotizacion-cobrada.test.ts`.
 *
 * El pedido (Alejandro por WhatsApp, capturas de las cotizaciones #305 y
 * #317): «un vuelo que se cobró en efectivo pero estaba cotizado como para
 * transferencia, entonces tenía IVA: decía 754 dólares, pero entró el cobro
 * en efectivo por 600 dólares. Quiero editar para quitarle el IVA, porque si
 * no dice que es un cobro parcial… Yo necesito que eso se desbloquee para mí,
 * no para todos. Entiendo que para todos está bien que no le metan mano. Pero
 * yo o Pablo sí necesitamos poder entrar y hacer modificaciones.»
 *
 * Por eso es por PERSONA y no por rol: todos los de oficina son ADMIN. La
 * lista vive en Configuración (`editores_cotizacion_cobrada`) y el API la
 * resuelve para cada usuario en `/me.permisos.editar_cotizacion_cobrada`.
 *
 * Qué NO hace el panel: tocar cobros ni calcular dinero propio. El total
 * nuevo es el del MOTOR (`/calculate`) y lo cobrado es el del API
 * (`cobrosEnUsd` del snapshot del vuelo); aquí solo se hace la RESTA visible
 * con la MISMA tolerancia de redondeo de siempre (`pendienteCobro`).
 */

/** ¿Este usuario puede editar cotizaciones cobradas? (API previo ⇒ false). */
export function puedeEditarCotizacionCobrada(
  me: Pick<MeResponse, "permisos"> | null | undefined,
): boolean {
  return me?.permisos?.editar_cotizacion_cobrada === true;
}

/**
 * ¿El API ya conoce los permisos por persona? (`/me.permisos` presente). Con
 * un API previo no se pide la lista de editores: no existe la ruta.
 */
export function apiConPermisosPorPersona(
  me: Pick<MeResponse, "permisos"> | null | undefined,
): boolean {
  return me?.permisos != null && typeof me.permisos === "object";
}

/** Chip ámbar de la barra del total (en vez de «Bloqueada · vuelo cobrado»). */
export const CHIP_EDICION_CON_COBROS = "Cobrada · editable con permiso";

/** Tooltip del chip. */
export const TITULO_CHIP_EDICION_CON_COBROS =
  "Tienes permiso especial para corregir cotizaciones que ya tienen cobros. Los cobros no se modifican.";

/**
 * Prefijo con el que el API guarda el motivo de la versión (espejo del API
 * 0.0.37). El panel NO lo manda —lo antepone el API—; solo lo muestra en la
 * vista previa «Queda en el historial como…» para no prometer otro texto.
 */
export const PREFIJO_MOTIVO_CON_COBROS = "[Con cobros · permiso especial] ";

/** Monto en USD con su moneda y nunca con 1 decimal: «$600 USD». */
export function usd(n: number): string {
  return `${fmtUsd(n)} USD`;
}

/** Cobros MXN sin T.C. (el API no los puede sumar): se dicen, no se esconden. */
export function textoCobrosSinTc(count: number | null | undefined): string | null {
  const n = Number(count ?? 0);
  if (!(n > 0)) return null;
  return n === 1
    ? "Hay 1 cobro en MXN sin tipo de cambio: no entra en el cobrado ni en el saldo."
    : `Hay ${n} cobros en MXN sin tipo de cambio: no entran en el cobrado ni en el saldo.`;
}

/**
 * Banda ámbar sobre el papel (contrato del 26-sep-2026). `cobradoUsd` es el
 * neto del API (`cobrosEnUsd`); los cobros MXN sin T.C. se avisan aparte.
 */
export function textoBandaEdicionConCobros(input: {
  cobradoUsd: number;
  cobrosSinTc?: number | null;
}): { titulo: string; detalle: string | null } {
  return {
    titulo:
      `Esta cotización ya tiene cobros por ${usd(input.cobradoUsd)}. ` +
      "Tienes permiso para corregirla: al guardar cambia el total y el saldo " +
      "se recalcula con los cobros que ya existen (los cobros no se modifican).",
    detalle: textoCobrosSinTc(input.cobrosSinTc),
  };
}

/**
 * Confirmación ÚNICA al primer cambio (misma mecánica que CONFIRMADO/RESERVA
 * con tripulación). Si ADEMÁS aplica la de tripulación, su cuerpo se agrega
 * al final — un solo diálogo, nunca dos seguidos.
 */
export function textoConfirmarEdicionConCobros(input: {
  folio: number | string | null | undefined;
  cobradoUsd: number;
  /** Cuerpo de `textoConfirmarEdicionCotizacion` cuando también aplica. */
  cuerpoTripulacion?: string | null;
}): { titulo: string; cuerpo: string } {
  const folio =
    input.folio != null && `${input.folio}`.trim() !== "" ? ` #${input.folio}` : "";
  const extra = input.cuerpoTripulacion?.trim();
  return {
    titulo: `La cotización${folio} ya tiene cobros. ¿Corregirla?`,
    cuerpo:
      `Ya se cobraron ${usd(input.cobradoUsd)}. Con tu permiso especial puedes ` +
      "corregir la cotización (p. ej. quitar el IVA si se pagó en efectivo): al " +
      "guardar cambia el total y el saldo se recalcula con los cobros que ya " +
      "existen. Los cobros NO se modifican." +
      (extra ? ` ${extra}` : ""),
  };
}

/** Resultado de la resta «total nuevo − cobrado». */
export type SaldoTrasEdicion =
  | { tipo: "saldo"; montoUsd: number }
  | { tipo: "liquidada"; montoUsd: 0 }
  | { tipo: "sobrecobro"; montoUsd: number };

/**
 * Saldo que quedará al guardar: `totalNuevoUsd` del MOTOR y `cobradoUsd` del
 * API. La tolerancia de redondeo (1 USD) es la de `pendienteCobro`, en los
 * dos sentidos: 0.40 de más o de menos es «liquidada», no deuda ni
 * sobrecobro.
 */
export function saldoTrasEdicion(
  totalNuevoUsd: number,
  cobradoUsd: number,
): SaldoTrasEdicion {
  const total = Number(totalNuevoUsd) || 0;
  const cobrado = Number(cobradoUsd) || 0;
  const falta = pendienteCobro(total, cobrado);
  if (falta > 0) return { tipo: "saldo", montoUsd: falta };
  const sobra = pendienteCobro(cobrado, total);
  if (sobra > 0) return { tipo: "sobrecobro", montoUsd: sobra };
  return { tipo: "liquidada", montoUsd: 0 };
}

/** «Saldo nuevo $154 USD» · «Sobrecobro $154 USD» · «Saldo nuevo $0 USD · liquidada». */
export function textoSaldoTrasEdicion(s: SaldoTrasEdicion): string {
  if (s.tipo === "saldo") return `Saldo nuevo ${usd(s.montoUsd)}`;
  if (s.tipo === "sobrecobro") return `Sobrecobro ${usd(s.montoUsd)}`;
  return `Saldo nuevo ${usd(0)} · liquidada`;
}

/**
 * Renglones del diálogo «Guardar vN» con cobros: antes→después del total y
 * el saldo que queda. `totalAntesUsd` es el guardado (`monto_total_usd`).
 */
export function resumenGuardadoConCobros(input: {
  totalAntesUsd: number;
  totalNuevoUsd: number;
  cobradoUsd: number;
}): { total: string; cobrado: string; saldo: SaldoTrasEdicion; saldoTexto: string } {
  const saldo = saldoTrasEdicion(input.totalNuevoUsd, input.cobradoUsd);
  const antes = Number(input.totalAntesUsd) || 0;
  const nuevo = Number(input.totalNuevoUsd) || 0;
  return {
    total:
      fmtUsd(antes) === fmtUsd(nuevo)
        ? `Total ${usd(nuevo)} (sin cambio)`
        : `Total ${fmtUsd(antes)} → ${usd(nuevo)}`,
    cobrado: `Cobrado ${usd(input.cobradoUsd)} (no cambia)`,
    saldo,
    saldoTexto: textoSaldoTrasEdicion(saldo),
  };
}

// =====================================================================
// CONFIGURACIÓN: «Editan cotizaciones cobradas»
// =====================================================================

/** Respuesta de GET/PUT /v1/config/editores-cotizacion-cobrada. */
export interface EditoresCotizacionCobrada {
  usuario_ids: string[];
  usuarios: { id: string; nombre: string }[];
  /** Solo quien YA está en la lista puede cambiarla. */
  puede_modificar: boolean;
  /**
   * ADITIVO (API 0.0.37): oficina ACTIVA que el PUT acepta (ADMIN,
   * COORDINADOR, FACTURACION). La página solo ofrece a quien puede GUARDAR
   * una cotización (`ROLES_EDITAN_COTIZACION`) más los ya elegidos. Sin el
   * campo, el panel arma la lista con `/v1/users`.
   */
  candidatos?: { id: string; nombre: string; rol?: string }[];
}

/**
 * Códigos de error del PUT (contrato del 26-sep-2026 + el CAS del API). El
 * texto del API manda cuando llega (es-MX y con nombres); esto es el
 * respaldo cuando no trae mensaje.
 */
export const ERRORES_EDITORES = {
  SOLO_EDITORES_COTIZACION_COBRADA:
    "Solo quien ya puede editar cotizaciones cobradas puede cambiar esta lista.",
  LISTA_VACIA: "La lista no puede quedar vacía: al menos una persona debe poder editarlas.",
  USUARIOS_INVALIDOS:
    "Alguno de los usuarios elegidos ya no está activo en la oficina. Recarga la página.",
  EDITORES_CAMBIARON:
    "Alguien más cambió la lista mientras la editabas. Recarga y vuelve a intentar.",
} as const;

/** ¿El rechazo pide recargar la lista (otro la cambió o ya no es válida)? */
export function errorEditoresPideRecargar(code: string | undefined): boolean {
  return (
    code === "EDITORES_CAMBIARON" ||
    code === "USUARIOS_INVALIDOS" ||
    code === "SOLO_EDITORES_COTIZACION_COBRADA"
  );
}

/** Mensaje legible de un rechazo del PUT (el del API; si no, por código). */
export function mensajeErrorEditores(code: string | undefined, mensajeApi?: string): string {
  const api = mensajeApi?.trim();
  if (api) return api;
  if (code && code in ERRORES_EDITORES) {
    return ERRORES_EDITORES[code as keyof typeof ERRORES_EDITORES];
  }
  return "No se pudo guardar la lista.";
}

/** Nombres de la lista guardada, en su orden (sin nombre ⇒ «usuario dado de baja»). */
export function nombresEditores(datos: Pick<EditoresCotizacionCobrada, "usuario_ids" | "usuarios">): string[] {
  return datos.usuario_ids.map(
    (id) => datos.usuarios.find((u) => u.id === id)?.nombre?.trim() || "usuario dado de baja",
  );
}

/**
 * Nombres para la RAZÓN del candado («Solo pueden editarla: …»): solo los
 * que el API resolvió — un id sin nombre no se nombra (sería pedirle permiso
 * a alguien que ya no está). Con `candidatos` (oficina ACTIVA, API 0.0.37)
 * se nombra solo a quien sigue activo: es el MISMO criterio del 409
 * `COTIZACION_COBRADA`, así la pantalla y el rechazo nombran a las mismas
 * personas.
 */
export function nombresParaRazon(
  datos:
    | Pick<EditoresCotizacionCobrada, "usuario_ids" | "usuarios" | "candidatos">
    | null
    | undefined,
): string[] {
  if (!datos) return [];
  // Mismo criterio que el 409 del API: solo se nombra a quien de verdad puede
  // guardar una cotización (ADMIN/COORDINADOR). Un FACTURACION en la lista no
  // se nombra: /me le da false y el API no lo deja pasar.
  const activos = datos.candidatos
    ? new Set(
        datos.candidatos
          .filter((c) => !c.rol || ROLES_EDITAN_COTIZACION.has(c.rol))
          .map((c) => c.id),
      )
    : null;
  return datos.usuario_ids
    .filter((id) => !activos || activos.has(id))
    .map((id) => datos.usuarios.find((u) => u.id === id)?.nombre?.trim() ?? "")
    .filter(Boolean);
}

/** Qué cambia entre lo guardado y lo elegido. */
export function diffEditores(
  guardados: readonly string[],
  elegidos: readonly string[],
): { agregados: string[]; quitados: string[] } {
  const g = new Set(guardados);
  const e = new Set(elegidos);
  return {
    agregados: [...e].filter((id) => !g.has(id)),
    quitados: [...g].filter((id) => !e.has(id)),
  };
}

/**
 * Texto de la confirmación al guardar la lista (regla del cliente: todo lo
 * que quita algo se confirma). `meQuito` = el usuario se quita a sí mismo:
 * perdería el permiso Y la posibilidad de volver a cambiar la lista.
 */
export function textoConfirmarEditores(input: {
  agregados: string[];
  quitados: string[];
  meQuito: boolean;
}): string {
  const partes: string[] = [];
  if (input.agregados.length > 0) {
    partes.push(`Podrán editar cotizaciones cobradas: ${input.agregados.join(", ")}.`);
  }
  if (input.quitados.length > 0) {
    partes.push(`Dejarán de poder editarlas: ${input.quitados.join(", ")}.`);
  }
  if (input.meQuito) {
    partes.push(
      "Te estás quitando a ti: ya no podrás editar cotizaciones cobradas ni volver a cambiar esta lista.",
    );
  }
  return partes.join(" ");
}
