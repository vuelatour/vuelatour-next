/**
 * Corregir la FECHA del gasto desde «Vincular gasto» (14-oct-2026, API 0.0.76).
 *
 * Pedido de la oficina en `/admin/conciliacion?f=pendientes`: «poder editar
 * desde esa pantalla la fecha del gasto, solo para ajustar bien». Decisión del
 * 13-oct-2026: la fecha del gasto es la FECHA DEL PAGO (la del cargo / SPEI),
 * no la de la factura; el cruce automático sigue a ±3 días (`MATCH_DAYS` del
 * API) y NO se amplía. Caso de la captura: el boleto de ferry de Winjet
 * ($321.54, 10 oct) contra el cargo de $345.00 del 12 oct.
 *
 * Fuente ÚNICA (PURA: sin React ni red, con prueba) de las reglas y los
 * textos del botón «Fecha» del renglón, del diálogo anidado
 * (`corregir-fecha-gasto-dialog.tsx`) y de la server action
 * `corregirFechaGastoAction` (`PATCH /v1/expenses/:id/fecha`, invariante 74
 * del API). El API vuelve a validar TODO (medio bancario, fecha, mes del
 * vuelo, confirmación con SU texto) y JAMÁS dispara el auto-cruce: liga la
 * persona con «Vincular». El panel no calcula dinero: solo avisa.
 *
 * Revisión del 14-oct-2026: el candado del mes del vuelo viaja en la ficha
 * (`candado_mes_vuelo`) y el panel ya no invita a una fecha que el API
 * rechaza; un gasto que se concilió mientras tanto (409
 * FECHA_GASTO_YA_CONCILIADO) sale de la lista; un fallo de red o 5xx dice
 * que NO se sabe si se guardó (y la lista se vuelve a pedir); el 401 dice
 * «Tu sesión expiró»; la tarjeta con 1 a 3 días de desfase abre con la
 * fecha del ticket; el mapa de fechas corregidas cede ante una lectura
 * NUEVA del servidor.
 */

import { DIAS_FECHA_ANTIGUA, DIAS_PASADO_SOSPECHOSO } from "@/lib/admin/fecha-gasto";
import { CODIGO_MES_CERRADO, textoMesCerradoRespaldo } from "./mes-cerrado";
import { esDiaValido } from "@/lib/admin/url-params";
import { MEDIOS_BANCARIOS_CONCILIACION, esCandidatoNoBancario } from "@/lib/admin/conciliacion-no-bancario";
import {
  MSG_SESION_EXPIRADA,
  MSG_SIN_CONEXION,
  esRutaInexistente,
  estadoLoteCargo,
  fichaCandidatoGasto,
} from "@/lib/admin/conciliacion-lote";
import { etiquetaCandidatoGasto } from "@/lib/admin/conciliacion-auto";
import { fmtMontoConciliacion, numeroDe } from "@/lib/admin/conciliacion-parcial";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import { esErrorTecnico } from "@/lib/admin/errores-tecnicos";
import { fmtDateOnly, MESES_LARGOS_ES } from "@/lib/datetime";
import type { CambioFechaGasto, GastoCandidato } from "@/types/conciliacion";

// ───────────────────────────── Constantes ─────────────────────────────

/**
 * Días de margen del cruce automático: ESPEJO de `const MATCH_DAYS = 3;` de
 * `conciliacion.service.ts` del API (prueba de paridad con el repo hermano).
 * Con tarjeta, el banco registra el cargo 1 a 3 días después del ticket y el
 * cruce ya lo tolera: ni la nota de tarjeta ni el aviso bajo un marcado
 * piden corregir una fecha a 3 días o menos.
 */
export const DIAS_MARGEN_CRUCE = 3;

/**
 * Los `code` del API para esta ruta (invariante 74, `CODIGO_CAMBIO_FECHA` de
 * `cambio-fecha-gasto.util.ts`; prueba de paridad con el repo hermano).
 */
export const CODIGOS_FECHA_GASTO = [
  "FECHA_GASTO_INVALIDA",
  "FECHA_GASTO_FUTURA",
  "FECHA_GASTO_MUY_ANTIGUA",
  "FECHA_GASTO_SOLO_BANCARIOS",
  "FECHA_GASTO_CAMBIO",
  "FECHA_GASTO_FUERA_DEL_MES_DEL_VUELO",
  "FECHA_GASTO_CONFIRMAR",
  "FECHA_GASTO_YA_CONCILIADO",
] as const;

export const BOTON_FECHA_FILA = "Fecha";
export const AYUDA_CORREGIR_FECHA =
  "¿El gasto trae la fecha de la factura? Corrígela con «Fecha» en su renglón: la fecha del gasto es la del pago.";
export const TITULO_CORREGIR_FECHA = "Corregir la fecha del gasto";
export const ETIQUETA_FECHA_PAGO = "Fecha del pago";
export const BOTON_GUARDAR_FECHA = "Guardar fecha";
export const TEXTO_GUARDANDO_FECHA = "Guardando…";
export const NOTA_FECHA_SOLO_FECHA =
  "Guardar solo cambia la fecha: no vincula el gasto. El cambio queda registrado con tu nombre.";
export const NOTA_TARJETA_DESFASE =
  "Con tarjeta, el banco registra el cargo 1 a 3 días después del ticket y el cruce automático ya lo tolera: cambia la fecha solo si la del ticket está mal.";
export const NOTA_HORA_CARGA_MOVIDA = "La hora de la carga de combustible pasó al mismo día.";
export const BOTON_DESHACER_FECHA = "Deshacer";
export const TITULO_NO_SE_DESHIZO = "No se pudo deshacer el cambio de fecha";
export const TITULO_CONFIRMAR_CAMBIO_MES = "¿Cambiar el gasto de mes?";
export const TITULO_CONFIRMAR_MES_TERMINADO = "¿Cambiar la fecha en un mes que ya terminó?";
export const BOTON_CONFIRMAR_MES_TERMINADO = "Sí, cambiar la fecha";
export const TEXTO_CONFIRMAR_SIN_DETALLE = "Este cambio mueve dinero entre meses en los libros: confírmalo.";
export const MSG_FECHA_INCOMPLETA = "Escribe una fecha completa (día, mes y año).";
export const MSG_FECHA_IGUAL = "Es la misma fecha que ya tiene el gasto.";
export const MSG_FECHA_MUY_ANTIGUA =
  "Es de hace más de un año: revisa el año. Una fecha tan antigua se corrige en Gastos → Verificar / editar.";
export const MSG_FECHA_API_VIEJO =
  "El servidor todavía no corrige fechas desde Conciliación (falta actualizar el API). Corrígela en Gastos → Verificar / editar.";
export const MSG_FECHA_SIN_PERMISO = "Tu usuario no puede corregir la fecha de un gasto desde Conciliación.";
export const MSG_FECHA_CONFLICTO =
  "Alguien modificó este gasto en este momento: no se cambió la fecha. Vuelve a intentarlo.";
export const MSG_GASTO_NO_EXISTE_FECHA = "Ese gasto ya no existe: la lista se actualizó.";
/** 409 FECHA_GASTO_YA_CONCILIADO (alguien lo ligó a un cargo mientras el diálogo seguía abierto). */
export const MSG_FECHA_YA_CONCILIADO =
  "Este gasto ya quedó conciliado con un cargo del banco mientras tanto: su fecha es la de ese pago. La lista se actualizó.";
export const MSG_FECHA_DATOS_RECHAZADOS =
  "La fecha no se cambió: el servidor no aceptó los datos. Recarga la página y vuelve a intentarlo.";
export const MSG_FECHA_SIN_CAMBIO = "El gasto ya tenía esa fecha: no se cambió nada.";

/**
 * Sin respuesta útil del servidor (red cortada, 5xx, HTML de Railway): NO se
 * sabe si la fecha se guardó — el PATCH pudo llegar y escribir antes de que
 * se perdiera la respuesta (las mutaciones no se reintentan). Revisión del
 * 14-oct-2026: antes decía «La fecha no se cambió», y un reintento respondía
 * «El gasto ya tenía esa fecha»: dos mensajes que negaban un cambio real.
 * La lista se vuelve a pedir para que el renglón diga la fecha VIGENTE.
 */
export const MSG_FECHA_TECNICO =
  "No se pudo confirmar si la fecha se guardó: el servidor no respondió. La lista se volvió a pedir: revisa la fecha del gasto antes de intentarlo otra vez.";
/** «Deshacer» sin respuesta útil: tampoco se sabe si se deshizo. */
export const TITULO_DESHACER_INCIERTO = "No se pudo confirmar si se deshizo el cambio de fecha";
export const MSG_DESHACER_INCIERTO =
  "El servidor no respondió: revisa la fecha del gasto en la lista antes de volver a cambiarla.";

/** Cierre fijo de la descripción del diálogo (la regla del 13-oct-2026). */
const FRASE_FECHA_ES_PAGO = "La fecha del gasto es la del PAGO (la del cargo del banco), no la de la factura.";
/**
 * Con TARJETA a 3 días o menos del cargo (revisión del 14-oct-2026): el
 * diálogo no puede decir «la del cargo del banco» y a la vez la nota de
 * tarjeta «cambia la fecha solo si la del ticket está mal» (ticket o banco es
 * decisión pendiente del cliente). Sin el paréntesis; la nota lo explica.
 */
const FRASE_FECHA_ES_PAGO_TARJETA = "La fecha del gasto es la del PAGO, no la de la factura.";

/** class-validator del API (DTO estricto): el panel mandó algo que el API no acepta. */
const RE_DATOS_RECHAZADOS = /should not exist|must be|debe ser AAAA-MM-DD|debe ser true o false/i;

// ───────────────────────────── Fechas ─────────────────────────────

/** Fecha del candidato (`fecha` de `gastos-candidatos`, `fecha_gasto` de la IA) o null si no es un día válido. */
export function fechaDeCandidato(c: Pick<GastoCandidato, "fecha" | "fecha_gasto"> | null | undefined): string | null {
  const crudo = c?.fecha ?? c?.fecha_gasto ?? "";
  const f = typeof crudo === "string" ? crudo.slice(0, 10) : "";
  return esDiaValido(f) ? f : null;
}

/**
 * Días de `desde` a `hasta` (positivo si `hasta` es posterior), con la cuenta
 * a mediodía UTC del API (`diasEntreDiasCancun`): 365 días atrás pasa, 366
 * no. NaN si alguno no es un día.
 */
export function diasEntreDias(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
}

/** `dia` + `n` días (`YYYY-MM-DD`), con la misma aritmética a mediodía UTC. Un día inválido vuelve tal cual. */
export function sumarDias(dia: string, n: number): string {
  if (!esDiaValido(dia) || !Number.isFinite(n)) return dia;
  const t = Date.parse(`${dia}T12:00:00Z`) + Math.trunc(n) * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** «2026-09» (o «2026-09-30») ⇒ «septiembre 2026», el formato de `etiquetaMes` del API. */
export function mesTexto(mes: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(mes ?? "");
  const nombre = m ? MESES_LARGOS_ES[Number(m[2]) - 1] : undefined;
  return m && nombre ? `${nombre} ${m[1]}` : mes;
}

/** `min`/`max` del campo de fecha: de hace 365 días a HOY (Cancún). */
export function limitesFechaPago(hoy: string): { min: string; max: string } {
  return { min: sumarDias(hoy, -DIAS_FECHA_ANTIGUA), max: hoy };
}

/** «La fecha del pago no puede ser posterior a hoy (14 oct 2026).» */
export function textoFechaFutura(hoy: string): string {
  return `La fecha del pago no puede ser posterior a hoy (${fmtDateOnly(hoy)}).`;
}

/**
 * ¿Se puede guardar `nueva`? null = sí; si no, el texto para el operador. La
 * comparten el diálogo (apaga «Guardar fecha») y la server action (no sale a
 * la red). En este orden: día incompleto, la misma fecha, futura, de hace más
 * de 365 días.
 */
export function validarNuevaFechaGasto(nueva: string, actual: string, hoy: string): string | null {
  if (!esDiaValido(nueva)) return MSG_FECHA_INCOMPLETA;
  if (nueva === actual) return MSG_FECHA_IGUAL;
  if (nueva > hoy) return textoFechaFutura(hoy);
  if (diasEntreDias(nueva, hoy) > DIAS_FECHA_ANTIGUA) return MSG_FECHA_MUY_ANTIGUA;
  return null;
}

/**
 * ¿Se puede guardar `nueva` para ESTE gasto? `validarNuevaFechaGasto` + el
 * candado del mes del vuelo que manda el API en la ficha
 * (`bloqueoMesDelVuelo`). La comparten el campo (texto bajo el campo,
 * «Guardar fecha» apagado) y el envío del diálogo. La server action solo
 * valida lo genérico (no tiene la ficha): el API vuelve a decidir todo.
 */
export function bloqueoNuevaFechaGasto(
  c: Pick<GastoCandidato, "candado_mes_vuelo">,
  nueva: string,
  actual: string,
  hoy: string,
): string | null {
  return validarNuevaFechaGasto(nueva, actual, hoy) ?? bloqueoMesDelVuelo(c, nueva, actual);
}

// ───────────────────────────── Candidato ─────────────────────────────

const limpio = (t: string | null | undefined): string | null => {
  const s = typeof t === "string" ? t.trim() : "";
  return s === "" ? null : s;
};

/**
 * ¿El renglón ofrece «Fecha»? Solo un gasto BANCARIO (tarjeta, transferencia,
 * PayWise, pago domiciliado) con fecha legible: en efectivo la fecha decide
 * qué reposición de caja chica lo cubre y se corrige en Gastos (el API lo
 * rechaza con 409 `FECHA_GASTO_SOLO_BANCARIOS`). Sin `medio_pago` (API
 * previo o ficha incompleta) ⇒ false: falla cerrado.
 */
export function puedeCorregirFechaDeCandidato(c: GastoCandidato | null | undefined): boolean {
  if (!c) return false;
  const medio = (c.medio_pago ?? "").trim();
  return MEDIOS_BANCARIOS_CONCILIACION.includes(medio) && !esCandidatoNoBancario(c) && fechaDeCandidato(c) != null;
}

/** Largo máximo de la nota que identifica al gasto en el nombre del botón. */
const LARGO_NOTA_ETIQUETA = 40;

/**
 * `aria-label` y `title` del botón del renglón, con el gasto que corrige
 * (revisión del 14-oct-2026: varios gastos del mismo día tenían botones con
 * el MISMO nombre y en la lista de botones de un lector de pantalla no se
 * distinguían): «Corregir la fecha del gasto: Taxi / estacionamiento ·
 * $321.54 MXN · 10 oct 2026 · vuelo #436 · Winjet · Boleto Adulto ferry
 * CZM-PDC». La etiqueta del renglón (`etiquetaCandidatoGasto`, la misma que se
 * ve) + el vuelo + la primera línea de la nota o el lugar (si no hay
 * proveedor, que ya va en la etiqueta), recortada.
 */
export function etiquetaBotonFecha(c: GastoCandidato): string {
  const nota = limpio(c.proveedor) ? null : (limpio(c.lugar) ?? limpio(c.notas_primera_linea) ?? limpio(c.nota));
  const partes = [
    etiquetaCandidatoGasto(fichaCandidatoGasto(c)),
    c.vuelo_folio != null ? `vuelo #${c.vuelo_folio}` : null,
    nota && nota.length > LARGO_NOTA_ETIQUETA ? `${nota.slice(0, LARGO_NOTA_ETIQUETA - 1).trimEnd()}…` : nota,
  ].filter((p): p is string => Boolean(p));
  return partes.length > 0 ? `${TITULO_CORREGIR_FECHA}: ${partes.join(" · ")}` : TITULO_CORREGIR_FECHA;
}

/**
 * ¿El API rechazaría mover la fecha del gasto a `nueva`? ESPEJO del 409
 * FECHA_GASTO_FUERA_DEL_MES_DEL_VUELO con la regla que manda el propio API en
 * la ficha (`candado_mes_vuelo`, revisión del 14-oct-2026): el gasto es de un
 * vuelo y su fecha solo se mueve dentro del mes que ya tiene (`actual`) o al
 * mes del vuelo. El panel no decide QUÉ categorías tienen candado: si la
 * ficha no lo trae (o es de un API previo), null y decide el API. Devuelve el
 * texto del bloqueo (el mismo del API) o null.
 */
export function bloqueoMesDelVuelo(
  c: Pick<GastoCandidato, "candado_mes_vuelo">,
  nueva: string,
  actual: string,
): string | null {
  const dia = c.candado_mes_vuelo?.vuelo_dia ?? "";
  if (!esDiaValido(dia) || !esDiaValido(nueva) || !esDiaValido(actual)) return null;
  const mesVuelo = dia.slice(0, 7);
  const mesNuevo = nueva.slice(0, 7);
  if (mesNuevo === mesVuelo || mesNuevo === actual.slice(0, 7)) return null;
  const folio = c.candado_mes_vuelo?.vuelo_folio;
  return `No se puede: este gasto es del vuelo ${folio != null ? `#${folio} ` : ""}(${fmtDateOnly(dia)}). Con fecha de ${mesTexto(mesNuevo)} quedaría en otro mes que su vuelo y el balance de ${mesTexto(mesVuelo)} lo marcaría como pendiente («fecha FUERA del periodo del libro»). Déjale una fecha de ${mesTexto(mesVuelo)}; para vincularlo no hace falta cambiarla.`;
}

/**
 * Bajo un renglón MARCADO cuya fecha está a más de 3 días del cargo: «La
 * fecha del gasto (18 sep 2026) está a 12 días de este cargo (30 sep 2026).
 * Si este cargo es su pago, corrígela con «Fecha».». null si no aplica (no
 * se puede corregir, el cruce ya tolera la diferencia, o —revisión del
 * 14-oct-2026— el API rechazaría la fecha del cargo por el mes del vuelo:
 * no se invita a algo que no se puede; para vincularlo no hace falta).
 */
export function nudgeFechaMarcado(c: GastoCandidato, fechaCargo: string | null | undefined): string | null {
  if (!puedeCorregirFechaDeCandidato(c)) return null;
  const f = fechaDeCandidato(c);
  const cargo = typeof fechaCargo === "string" ? fechaCargo.slice(0, 10) : "";
  if (!f || !esDiaValido(cargo)) return null;
  const d = Math.abs(diasEntreDias(f, cargo));
  if (d <= DIAS_MARGEN_CRUCE) return null;
  if (bloqueoMesDelVuelo(c, cargo, f)) return null;
  return `La fecha del gasto (${fmtDateOnly(f)}) está a ${d} días de este cargo (${fmtDateOnly(cargo)}). Si este cargo es su pago, corrígela con «${BOTON_FECHA_FILA}».`;
}

/**
 * ¿Tarjeta con un desfase que el cruce ya tolera? TARJETA_CORP con la fecha
 * actual a 3 días o menos del cargo: el banco registra el cargo 1 a 3 días
 * después del ticket. Decide la nota de tarjeta, la frase de la descripción y
 * la fecha con que abre el campo (revisión del 14-oct-2026).
 */
export function esDesfaseTarjetaTolerado(
  c: Pick<GastoCandidato, "medio_pago">,
  fechaActual: string,
  fechaCargo: string,
): boolean {
  const cargo = (fechaCargo ?? "").slice(0, 10);
  return (
    (c.medio_pago ?? "").trim() === "TARJETA_CORP" &&
    esDiaValido(fechaActual) &&
    esDiaValido(cargo) &&
    Math.abs(diasEntreDias(fechaActual, cargo)) <= DIAS_MARGEN_CRUCE
  );
}

/**
 * La fecha con que ABRE el campo del diálogo: la del CARGO (dos clics:
 * «Fecha» y «Guardar fecha»), salvo una tarjeta con desfase tolerado, que abre
 * con la fecha ACTUAL (la del ticket) y deja el atajo «Usar la fecha del
 * cargo»: el camino por default ya no hace lo que la nota de tarjeta pide no
 * hacer (revisión del 14-oct-2026, caso Winjet: ticket del 10-oct, cargo del
 * 12-oct).
 */
export function fechaInicialCorregirFecha(c: GastoCandidato, fechaCargo: string): string {
  const cargo = (fechaCargo ?? "").slice(0, 10);
  const actual = fechaDeCandidato(c);
  return actual && esDesfaseTarjetaTolerado(c, actual, cargo) ? actual : cargo;
}

/**
 * Descripción del diálogo: «Taxi / estacionamiento · $321.54 MXN · Winjet ·
 * Boleto Adulto ferry CZM-PDC. La fecha del gasto es la del PAGO (la del
 * cargo del banco), no la de la factura.» Quién: proveedor, lugar o la
 * primera línea de las notas (el orden de `lineaGastoLote`). Con una tarjeta
 * de desfase tolerado (`fechaCargo`), sin «(la del cargo del banco)».
 */
export function descripcionCorregirFecha(c: GastoCandidato, fechaCargo?: string | null): string {
  const quien = limpio(c.proveedor) ?? limpio(c.lugar) ?? limpio(c.notas_primera_linea) ?? limpio(c.nota);
  const categoria = limpio(c.categoria);
  const partes = [
    categoria ? categoriaGastoLabel(categoria) : null,
    `${fmtMontoConciliacion(c.monto)} ${limpio(c.moneda) ?? "MXN"}`,
    quien,
  ].filter((p): p is string => Boolean(p));
  const actual = fechaDeCandidato(c);
  const tarjeta = actual != null && esDesfaseTarjetaTolerado(c, actual, fechaCargo ?? "");
  return `${partes.join(" · ")}. ${tarjeta ? FRASE_FECHA_ES_PAGO_TARJETA : FRASE_FECHA_ES_PAGO}`;
}

/** «Fecha actual del gasto: 10 oct 2026». */
export function textoFechaActual(f: string): string {
  return `Fecha actual del gasto: ${fmtDateOnly(f)}`;
}

/** Atajo bajo el campo: «Usar la fecha del cargo (12 oct 2026)». */
export function botonUsarFechaCargo(f: string): string {
  return `Usar la fecha del cargo (${fmtDateOnly(f)})`;
}

// ───────────────────────────── Avisos del diálogo ─────────────────────────────

export type ClaveAvisoFecha = "monto" | "sospechosa" | "mes" | "ventana" | "parcial" | "tarjeta";

export interface AvisoFechaPago {
  clave: ClaveAvisoFecha;
  tono: "ambar" | "neutro";
  texto: string;
}

/**
 * Lo que el diálogo dice bajo el campo, en orden fijo (ninguno bloquea; el
 * API decide):
 *  - monto (ámbar): el cargo es MAYOR que lo que el gasto puede recibir, así
 *    que con la fecha no basta (el caso Winjet: $23.46). Un cruzado o en
 *    otra moneda no lleva este aviso (la suma no aplica);
 *  - sospechosa (ámbar): la fecha tecleada es de hace más de 60 días;
 *  - mes (neutro): la fecha nueva cambia el gasto de mes;
 *  - ventana (neutro): con la fecha nueva el gasto sale de la ventana de la
 *    lista;
 *  - parcial (neutro): ya tiene una parte pagada con otro cargo;
 *  - tarjeta (neutro): con tarjeta, 1 a 3 días de desfase son normales.
 * Los que dependen de la fecha nueva se omiten mientras no sea un día.
 */
export function avisosFechaPago(e: {
  candidato: GastoCandidato;
  nueva: string;
  fechaActual: string;
  fechaCargo: string;
  montoCargo: string | number;
  monedaCuenta: string | null;
  hoy: string;
  dias: number;
}): AvisoFechaPago[] {
  const c = e.candidato;
  const avisos: AvisoFechaPago[] = [];
  const nuevaValida = esDiaValido(e.nueva);
  const cargo = (e.fechaCargo ?? "").slice(0, 10);
  const cargoValido = esDiaValido(cargo);
  const actualValida = esDiaValido(e.fechaActual);

  const lote = estadoLoteCargo({ montoCargo: e.montoCargo, monedaCuenta: e.monedaCuenta, gastos: [c] });
  if (lote.faltan) {
    const fmt = (v: number) => fmtMontoConciliacion(v, lote.moneda);
    const gasto =
      numeroDe(c.monto_vinculado) > 0 ? `lo que le falta al gasto (${fmt(lote.suma)})` : `el gasto (${fmt(lote.suma)})`;
    avisos.push({
      clave: "monto",
      tono: "ambar",
      texto: `Ojo: con la fecha no basta para vincularlo solo: el cargo (${fmt(lote.cargo)}) es mayor que ${gasto} por ${fmt(lote.diferencia)}. Si el ticket dice otro monto, corrígelo en Gastos; si el cargo pagó varios gastos, márcalos todos.`,
    });
  }

  if (nuevaValida && e.nueva !== cargo) {
    const hace = diasEntreDias(e.nueva, e.hoy);
    if (hace > DIAS_PASADO_SOSPECHOSO) {
      avisos.push({ clave: "sospechosa", tono: "ambar", texto: `Es de hace ${hace} días: revisa el año.` });
    }
  }

  if (nuevaValida && actualValida && e.nueva.slice(0, 7) !== e.fechaActual.slice(0, 7)) {
    avisos.push({
      clave: "mes",
      tono: "neutro",
      texto: `Cambia de mes: de ${mesTexto(e.fechaActual)} a ${mesTexto(e.nueva)}.`,
    });
  }

  if (nuevaValida && cargoValido && Math.abs(diasEntreDias(e.nueva, cargo)) > e.dias) {
    avisos.push({
      clave: "ventana",
      tono: "neutro",
      texto: `Con esa fecha el gasto queda a más de ${e.dias} días de este cargo: dejará de salir en esta lista al volver a buscar.`,
    });
  }

  const ligado = numeroDe(c.monto_vinculado);
  if (ligado > 0) {
    avisos.push({
      clave: "parcial",
      tono: "neutro",
      texto: `Ya tiene ${fmtMontoConciliacion(ligado, limpio(c.moneda) ?? e.monedaCuenta)} pagados con otro cargo del banco: la fecha cambia para todo el gasto.`,
    });
  }

  if (esDesfaseTarjetaTolerado(c, e.fechaActual, cargo)) {
    avisos.push({ clave: "tarjeta", tono: "neutro", texto: NOTA_TARJETA_DESFASE });
  }

  return avisos;
}

// ───────────────────────────── Fechas corregidas en la lista ─────────────────────────────

interface ConFecha {
  id: string;
  fecha?: string | null;
  fecha_gasto?: string | null;
}

/**
 * Lo que esta sesión sabe de la fecha de un gasto: la que el API acaba de
 * guardar (`fecha`) y las que ya NO son vigentes (`reemplaza`: la que tenía
 * antes de cada corrección, o la que el renglón pintaba cuando el API dijo
 * que alguien la cambió).
 */
export interface FechaCorregida {
  fecha: string;
  reemplaza: readonly string[];
}
/** id del gasto ⇒ su fecha corregida. */
export type FechasCorregidas = Readonly<Record<string, FechaCorregida>>;

const entradaDe = (mapa: FechasCorregidas, id: string): FechaCorregida | undefined =>
  Object.prototype.hasOwnProperty.call(mapa, id) ? mapa[id] : undefined;

/**
 * Anota en el mapa que el gasto `id` ahora tiene `fecha` y que `vista` (la
 * que pintaba el renglón; normalmente la fecha anterior) ya no es la vigente.
 * Una fecha que vuelve («Deshacer») deja de estar entre las reemplazadas. Sin
 * cambio ⇒ el MISMO mapa (no repinta).
 */
export function registrarFechaCorregida(
  mapa: FechasCorregidas,
  id: string,
  fecha: string,
  vista?: string | null,
): FechasCorregidas {
  if (!esDiaValido(fecha)) return mapa;
  const prev = entradaDe(mapa, id);
  const candidatas = [...(prev?.reemplaza ?? []), prev?.fecha, (vista ?? "").slice(0, 10)];
  const reemplaza = [...new Set(candidatas)].filter(
    (f): f is string => typeof f === "string" && esDiaValido(f) && f !== fecha,
  );
  if (prev && prev.fecha === fecha && reemplaza.every((f) => prev.reemplaza.includes(f))) return mapa;
  return { ...mapa, [id]: { fecha, reemplaza } };
}

/**
 * El renglón con la fecha que el API acaba de guardar. SOLO si el renglón
 * todavía trae una fecha que el mapa sabe REEMPLAZADA: la copia guardada de
 * un marcado o del sugerido de la IA, o una respuesta que venía en camino al
 * guardar. Si el servidor ya devuelve OTRA fecha (alguien la cambió después),
 * manda la lectura nueva (revisión del 14-oct-2026: antes el mapa le ganaba
 * siempre y el diálogo mandaba como `fecha_anterior` una fecha que ya no
 * existía). Sin corrección (o ya con esa fecha) devuelve el MISMO objeto.
 */
export function conFechaCorregida<T extends ConFecha>(c: T, mapa: FechasCorregidas): T {
  const e = entradaDe(mapa, c.id);
  if (!e) return c;
  const vigente = (c.fecha ?? c.fecha_gasto ?? "").slice(0, 10);
  if (vigente === e.fecha || !e.reemplaza.includes(vigente)) return c;
  return { ...c, fecha: e.fecha, fecha_gasto: e.fecha };
}

/**
 * La lista con las fechas corregidas: el diálogo NO vuelve a pedir los
 * candidatos (eso escondería los no marcados mientras carga). Mapa vacío o
 * sin coincidencias ⇒ la MISMA referencia; si no, un arreglo nuevo donde solo
 * cambian los renglones corregidos (los demás conservan su referencia).
 */
export function conFechasCorregidas<T extends ConFecha>(lista: readonly T[], mapa: FechasCorregidas): T[] {
  if (Object.keys(mapa).length === 0) return lista as T[];
  let cambio = false;
  const nueva = lista.map((c) => {
    const n = conFechaCorregida(c, mapa);
    if (n !== c) cambio = true;
    return n;
  });
  return cambio ? nueva : (lista as T[]);
}

// ───────────────────────────── Respuesta de la action ─────────────────────────────

/** Lo que devuelve `corregirFechaGastoAction` (o el respaldo sin conexión del diálogo). */
export interface RespuestaCorregirFecha {
  ok: boolean;
  data?: CambioFechaGasto;
  error?: string;
  code?: string;
  status?: number;
  details?: unknown;
}

/**
 * `no_existe` = el gasto ya no está en la lista: se borró (404) o se concilió
 * mientras tanto (409 FECHA_GASTO_YA_CONCILIADO); el padre lo desmarca y
 * vuelve a pedir la lista. `incierto` = NO se sabe si se guardó (red, 5xx):
 * el padre vuelve a pedir la lista para pintar la fecha vigente.
 */
export type ResultadoCorregirFecha =
  | { tipo: "ok"; data: CambioFechaGasto }
  | { tipo: "confirmar"; titulo: string; texto: string; boton: string }
  | { tipo: "bloqueo"; texto: string }
  | { tipo: "fecha_vigente"; fecha: string; texto: string }
  | { tipo: "no_existe"; texto: string }
  | { tipo: "incierto"; texto: string }
  | { tipo: "error"; texto: string };

const detalle = (d: unknown): Record<string, unknown> | null =>
  d != null && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, unknown>) : null;

/** «Alguien cambió la fecha de este gasto mientras tanto: ahora dice 11 oct 2026. Revisa y vuelve a guardar.» */
export function textoFechaVigente(f: string): string {
  return `Alguien cambió la fecha de este gasto mientras tanto: ahora dice ${fmtDateOnly(f)}. Revisa y vuelve a guardar.`;
}

type FalloFecha = { ok?: boolean; error?: string | null; code?: string | null; status?: number | null };

/**
 * ¿NO se sabe si la fecha se guardó? Sin respuesta, un `ok` sin datos, un 5xx
 * (incluida la orilla de Railway/Vercel), el HTML de un API reiniciando
 * (`PARSE_ERROR`), un error de red («fetch failed», «Failed to fetch», «Load
 * failed», «unexpected response») o la action que ni contestó. Un 4xx es
 * determinista (el API respondió y no escribió): jamás incierto.
 */
export function esResultadoIncierto(r: FalloFecha | null | undefined): boolean {
  if (!r) return true;
  if (r.ok) return !(r as { data?: unknown }).data;
  const status = r.status ?? 0;
  if (status >= 400 && status < 500) return false;
  return (
    status >= 500 ||
    r.code === "PARSE_ERROR" ||
    esErrorTecnico({ error: r.error, code: r.code }) ||
    r.error === MSG_SIN_CONEXION
  );
}

/**
 * Texto para el operador de CUALQUIER fallo (el diálogo y «Deshacer»), en
 * orden: versión (CAS), API previo, sesión vencida (401), permiso, gasto
 * borrado (cualquier otro 404) o conciliado mientras tanto, resultado
 * INCIERTO (red/5xx: «No se pudo confirmar si la fecha se guardó…»), DTO
 * rechazado o un 4xx con texto técnico; si no, el texto del API tal cual (los
 * FECHA_GASTO_* ya vienen en español, igual que los textos locales de la
 * action). Ningún texto en inglés del API llega al operador.
 */
export function mensajeErrorFechaGasto(r: FalloFecha | null | undefined): string {
  if (!r) return MSG_FECHA_TECNICO;
  const code = r.code ?? "";
  if (code === "CONFLICTO_VERSION") return MSG_FECHA_CONFLICTO;
  if (code === "RUTA_NO_DISPONIBLE" || esRutaInexistente(r)) return MSG_FECHA_API_VIEJO;
  if (r.status === 401) return MSG_SESION_EXPIRADA;
  if (r.status === 403) return MSG_FECHA_SIN_PERMISO;
  if (code === "GASTO_NO_EXISTE" || r.status === 404) return MSG_GASTO_NO_EXISTE_FECHA;
  if (code === "FECHA_GASTO_YA_CONCILIADO") return MSG_FECHA_YA_CONCILIADO;
  if (esResultadoIncierto(r)) return MSG_FECHA_TECNICO;
  if (r.status === 400 && RE_DATOS_RECHAZADOS.test(r.error ?? "")) return MSG_FECHA_DATOS_RECHAZADOS;
  if (esErrorTecnico({ error: r.error, code: r.code })) return MSG_FECHA_DATOS_RECHAZADOS;
  return (r.error ?? "").trim() || MSG_FECHA_TECNICO;
}

/**
 * Qué hace el diálogo con la respuesta:
 *  - ok ⇒ el padre cierra, corrige la lista y avisa;
 *  - FECHA_GASTO_CONFIRMAR ⇒ caja ámbar con el texto DEL API y el botón
 *    «Sí, pasarlo a octubre 2026» / «Sí, cambiar la fecha»;
 *  - FUERA_DEL_MES_DEL_VUELO / SOLO_BANCARIOS ⇒ bloqueo con el texto del API;
 *  - FECHA_GASTO_CAMBIO con la fecha vigente ⇒ se toma esa como la actual;
 *  - GASTO_NO_EXISTE (o un 404 que no es «ruta inexistente») o
 *    FECHA_GASTO_YA_CONCILIADO ⇒ sale de la lista y se vuelve a pedir;
 *  - red, 5xx o sin respuesta ⇒ incierto: NO se sabe si se guardó;
 *  - lo demás ⇒ error con `mensajeErrorFechaGasto`.
 */
export function resultadoCorregirFecha(r: RespuestaCorregirFecha | null | undefined): ResultadoCorregirFecha {
  if (!r) return { tipo: "incierto", texto: MSG_FECHA_TECNICO };
  if (r.ok && r.data) return { tipo: "ok", data: r.data };
  const code = r.code ?? "";
  const d = detalle(r.details);

  if (code === "FECHA_GASTO_CONFIRMAR") {
    const texto = esErrorTecnico({ error: r.error, code: r.code }) ? TEXTO_CONFIRMAR_SIN_DETALLE : (r.error ?? "").trim();
    if (d?.cambia_de_mes === false) {
      return { tipo: "confirmar", titulo: TITULO_CONFIRMAR_MES_TERMINADO, texto, boton: BOTON_CONFIRMAR_MES_TERMINADO };
    }
    const etiqueta = typeof d?.etiqueta_mes_despues === "string" ? d.etiqueta_mes_despues.trim() : "";
    return {
      tipo: "confirmar",
      titulo: TITULO_CONFIRMAR_CAMBIO_MES,
      texto,
      boton: etiqueta ? `Sí, pasarlo a ${etiqueta}` : BOTON_CONFIRMAR_MES_TERMINADO,
    };
  }

  if (code === "FECHA_GASTO_FUERA_DEL_MES_DEL_VUELO" || code === "FECHA_GASTO_SOLO_BANCARIOS") {
    return { tipo: "bloqueo", texto: mensajeErrorFechaGasto(r) };
  }

  // Mes cerrado (16-oct-2026, API 0.0.88): bloquea esa fecha hasta reabrir;
  // el texto es el del API tal cual.
  if (code === CODIGO_MES_CERRADO) {
    return { tipo: "bloqueo", texto: (r.error ?? "").trim() || textoMesCerradoRespaldo(null) };
  }

  if (code === "FECHA_GASTO_CAMBIO") {
    const vigente = typeof d?.fecha_actual === "string" ? d.fecha_actual.slice(0, 10) : "";
    if (esDiaValido(vigente)) return { tipo: "fecha_vigente", fecha: vigente, texto: textoFechaVigente(vigente) };
    return { tipo: "error", texto: mensajeErrorFechaGasto(r) };
  }

  if (
    code === "GASTO_NO_EXISTE" ||
    (r.status === 404 && code !== "RUTA_NO_DISPONIBLE" && !esRutaInexistente(r))
  ) {
    return { tipo: "no_existe", texto: MSG_GASTO_NO_EXISTE_FECHA };
  }

  if (code === "FECHA_GASTO_YA_CONCILIADO") return { tipo: "no_existe", texto: MSG_FECHA_YA_CONCILIADO };

  if (esResultadoIncierto(r)) return { tipo: "incierto", texto: MSG_FECHA_TECNICO };

  return { tipo: "error", texto: mensajeErrorFechaGasto(r) };
}

// ───────────────────────────── Avisos (toasts) ─────────────────────────────

/**
 * Tras guardar: «Fecha del gasto corregida: 10 oct 2026 → 12 oct 2026», con
 * la línea del API (mes terminado) y/o la de la hora de carga movida como
 * descripción; sin ninguna, sin descripción. Si el gasto ya tenía esa fecha,
 * «El gasto ya tenía esa fecha: no se cambió nada.». La hora de carga solo se
 * menciona si el API dice que ESTA llamada la movió
 * (`fecha_hora_carga_movida`, revisión del 14-oct-2026): `fecha_hora_carga`
 * es la de la fila y una carga que ya caía en el día nuevo no se toca.
 */
export function toastFechaCorregida(r: CambioFechaGasto): { titulo: string; descripcion?: string } {
  if (!r.cambio) return { titulo: MSG_FECHA_SIN_CAMBIO };
  const titulo = `Fecha del gasto corregida: ${fmtDateOnly(r.fecha_anterior)} → ${fmtDateOnly(r.fecha_gasto)}`;
  const partes = [limpio(r.aviso), r.fecha_hora_carga_movida === true ? NOTA_HORA_CARGA_MOVIDA : null].filter(
    (p): p is string => Boolean(p),
  );
  return partes.length > 0 ? { titulo, descripcion: partes.join(" ") } : { titulo };
}

/** Tras «Deshacer»: «Fecha restaurada: 10 oct 2026». */
export function toastFechaRestaurada(r: Pick<CambioFechaGasto, "fecha_gasto">): string {
  return `Fecha restaurada: ${fmtDateOnly(r.fecha_gasto)}`;
}
