/**
 * PROPIETARIOS DEL AVIÓN (19-oct-2026, API 0.0.97, invariante 95 del API) —
 * FUENTE ÚNICA PURA de la card «Propietarios actuales» y de su ventana
 * «Editar propietarios».
 *
 * Pedido del cliente (captura de XA-VGV con dos dueños al 100 %): «no me deja
 * borrar al socio anterior y no es fácil editar nombres y porcentajes»,
 * «que pueda agregar un socio desde esta parte», «que se puedan quitar o
 * editar, incluidos los porcentajes» y «que no se pueda poner más del 100 %».
 *
 * Reglas:
 *  - `vigente_desde` / `vigente_hasta` son DÍAS de pared INCLUSIVOS (como en
 *    el API). «Quitar» = poner el ÚLTIMO día (el historial se conserva) o,
 *    si se agregó por error, BORRAR la fila.
 *  - Los vigentes de un mismo día nunca suman más de 100 % (espejo EXACTO de
 *    `excesoPorcentaje` del API: el 400 `PROPIETARIO_SUMA_EXCEDE` es el
 *    respaldo). Sumar menos se permite, con confirmación.
 *  - El panel NO decide repartos: solo arma el plan de llamadas (PATCH /
 *    DELETE / POST) en un orden que no choque con esa regla.
 */
import type { SearchableSelectOption } from "@/components/ui/searchable-select";
import type { AircraftOwner } from "@/types/aircraft";
import { fmtDateOnly } from "@/lib/datetime";
import { diaMas } from "@/lib/admin/conciliacion-auto";

// =============================================================================
// Roles y usuarios
// =============================================================================

/** Espejo del `@Roles` de POST/PATCH/DELETE `owners` y de `POST /users/socios`. */
export const ROLES_EDITAN_PROPIETARIOS = ["ADMIN"] as const;

/** Sin rol conocido (`/me` falló) se ofrece: el gate real es el API. */
export function puedeEditarPropietarios(rol: string | null | undefined): boolean {
  if (rol == null) return true;
  return (ROLES_EDITAN_PROPIETARIOS as readonly string[]).includes(rol);
}

export interface UsuarioOpcion {
  id: string;
  nombre: string;
  rol: string;
  estado: string;
  es_empresa?: boolean | null;
}

const ROL_LABEL: Record<string, string> = {
  ADMIN: "Administración",
  COORDINADOR: "Coordinación",
  FACTURACION: "Facturación",
  ANALISTA: "Analista",
  PILOTO: "Piloto",
  SOCIO: "Socio",
  MECANICO: "Mecánico",
  VISITANTE: "Visitante",
};

/** «Empresa» · «Socio» · el rol en es-MX (lo que se lee bajo el nombre). */
export function descripcionSocio(u: { rol: string; es_empresa?: boolean | null }): string {
  if (u.es_empresa) return "Empresa";
  return ROL_LABEL[u.rol] ?? u.rol;
}

function esSocioOEmpresa(u: UsuarioOpcion): boolean {
  return u.rol === "SOCIO" || u.es_empresa === true;
}

export const VALOR_NUEVO_SOCIO = "__nuevo_socio__";
export const ETIQUETA_NUEVO_SOCIO = "＋ Nuevo socio…";
export const NOMBRE_SOCIO_MAX = 100;
export const PLACEHOLDER_NUEVO_SOCIO = "Nombre de la persona o empresa";
export const ETIQUETA_ES_EMPRESA = "Es una empresa";
export const PLACEHOLDER_SOCIO = "Elige el socio";

/**
 * Opciones del selector: los SOCIOS y EMPRESAS (de cualquier estado: los
 * socios no entran al sistema y están INACTIVOS) primero, luego los demás
 * usuarios ACTIVOS (un ADMIN o un piloto también puede ser dueño), el
 * elegido aunque no califique (dato legado) y, al final, «＋ Nuevo socio…».
 * Antes la lista solo traía usuarios ACTIVOS: salían pilotos y oficina y
 * ningún socio real.
 */
export function opcionesSocios(
  usuarios: readonly UsuarioOpcion[],
  actualId?: string | null,
  opts: { conNuevo?: boolean } = {},
): SearchableSelectOption[] {
  const porNombre = (a: UsuarioOpcion, b: UsuarioOpcion) =>
    a.nombre.localeCompare(b.nombre, "es");
  const socios = usuarios.filter(esSocioOEmpresa).sort(porNombre);
  const otros = usuarios
    .filter((u) => !esSocioOEmpresa(u) && (u.estado === "ACTIVO" || u.id === actualId))
    .sort(porNombre);
  const opcion = (u: UsuarioOpcion): SearchableSelectOption => ({
    value: u.id,
    label: u.nombre,
    description: descripcionSocio(u),
  });
  const out = [...socios.map(opcion), ...otros.map(opcion)];
  if (opts.conNuevo) {
    out.push({
      value: VALOR_NUEVO_SOCIO,
      label: ETIQUETA_NUEVO_SOCIO,
      description: "Se da de alta sin acceso al sistema",
    });
  }
  return out;
}

/** Sin acentos ni mayúsculas, espacios de sobra fuera (para comparar nombres). */
export function normalizarNombre(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type ResolucionNuevoSocio =
  | { tipo: "INVALIDO"; error: string }
  | { tipo: "EXISTE"; usuario: UsuarioOpcion }
  | { tipo: "NUEVO"; nombre: string };

/**
 * Qué hacer con el nombre tecleado en «＋ Nuevo socio…»: vacío o muy largo ⇒
 * error; uno que ya existe (sin acentos ni mayúsculas) ⇒ se ELIGE en vez de
 * duplicarlo (el API además responde 409 `SOCIO_YA_EXISTE`); si no, se crea.
 */
export function resolverNuevoSocio(
  nombre: string,
  usuarios: readonly UsuarioOpcion[],
): ResolucionNuevoSocio {
  const limpio = nombre.replace(/\s+/g, " ").trim();
  if (limpio.length < 2) return { tipo: "INVALIDO", error: "Escribe el nombre del socio." };
  if (limpio.length > NOMBRE_SOCIO_MAX) {
    return { tipo: "INVALIDO", error: `Máximo ${NOMBRE_SOCIO_MAX} caracteres.` };
  }
  const clave = normalizarNombre(limpio);
  const existente = usuarios.find((u) => normalizarNombre(u.nombre) === clave);
  if (existente) return { tipo: "EXISTE", usuario: existente };
  return { tipo: "NUEVO", nombre: limpio };
}

export function textoSocioYaExistia(nombre: string): string {
  return `${nombre} ya estaba en la lista: se eligió.`;
}

export function textoSocioCreado(nombre: string): string {
  return `Socio agregado: ${nombre} (sin acceso al sistema).`;
}

// =============================================================================
// Porcentajes y fechas
// =============================================================================

export const TOLERANCIA_SUMA_PCT = 0.0005;

/** Número a partir de lo tecleado («40.92», «40,92», « 100 »); null si no es. */
export function pctNumero(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const texto = String(v).trim().replace(",", ".");
  if (texto === "") return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

/** Suma a 3 decimales en milésimas enteras: 0.1 + 0.2 = 0.3 exacto. */
export function sumaPorcentajes(valores: ReadonlyArray<string | number | null | undefined>): number {
  const milesimas = valores.reduce<number>((s, v) => s + Math.round((pctNumero(v) ?? 0) * 1000), 0);
  return milesimas / 1000;
}

/** «100 %» · «40.92 %» · «12.432 %» (sin ceros de cola). */
export function textoPorcentaje(n: number): string {
  return `${Number(n.toFixed(3))} %`;
}

export type EstadoSuma = "CIEN" | "MENOS" | "MAS";

export function estadoSuma(total: number): EstadoSuma {
  if (total > 100 + TOLERANCIA_SUMA_PCT) return "MAS";
  if (total < 100 - TOLERANCIA_SUMA_PCT) return "MENOS";
  return "CIEN";
}

/** Línea viva bajo las filas de la ventana. */
export function textoSuma(total: number): string {
  const e = estadoSuma(total);
  if (e === "CIEN") return "Suman 100 %";
  if (e === "MAS") return `Suman ${textoPorcentaje(total)}: no pueden pasar de 100 %`;
  return `Suman ${textoPorcentaje(total)}: falta ${textoPorcentaje(100 - total)} por asignar`;
}

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

export function esDia(v: unknown): v is string {
  if (typeof v !== "string" || !RE_DIA.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function diaAnterior(dia: string): string {
  return diaMas(dia, -1);
}

/** «01 ene 2020» (día de pared, sin corrimiento). */
export function fechaCorta(dia: string): string {
  return fmtDateOnly(dia);
}

// =============================================================================
// La card
// =============================================================================

/** «2 propietarios · 200 % asignado» */
export function textoResumenPropietarios(n: number, total: number): string {
  return `${n} ${n === 1 ? "propietario" : "propietarios"} · ${textoPorcentaje(total)} asignado`;
}

export const ETIQUETA_EDITAR_PROPIETARIOS = "Editar propietarios";
export const TITULO_EDITAR_PROPIETARIOS =
  "Agregar, quitar o corregir propietarios y sus porcentajes, todo desde aquí";
export const TEXTO_SIN_PROPIETARIOS = "Sin propietarios registrados.";
export const TEXTO_SIN_PERMISO_PROPIETARIOS = "Solo administración cambia los propietarios.";
export const TEXTO_HISTORIAL_NO_CARGO = "No se pudo leer el historial de propietarios.";

/** Aviso de la card; null cuando suman 100 %. Sin permiso no se promete el botón. */
export function alertaSumaCard(total: number, n: number, puedeEditar = true): string | null {
  if (n === 0) return null;
  const e = estadoSuma(total);
  if (e === "CIEN") return null;
  if (e === "MAS") {
    const salida = puedeEditar
      ? `Si uno sustituyó a otro, ponle al anterior su último día con «${ETIQUETA_EDITAR_PROPIETARIOS}».`
      : "Si uno sustituyó a otro, administración le pone al anterior su último día.";
    return `Los propietarios vigentes suman ${textoPorcentaje(total)}: no pueden pasar de 100 %. ${salida}`;
  }
  return `Los propietarios vigentes suman ${textoPorcentaje(total)}; falta ${textoPorcentaje(100 - total)} por asignar.`;
}

/** «desde 01 ene 2020» · «desde 18 ago 2026 · último día 19 oct 2026» · «01 ene 2020 – 07 jun 2026». */
export function lineaVigencia(o: Pick<AircraftOwner, "vigente_desde" | "vigente_hasta">, hoy: string): string {
  const desde = fechaCorta(o.vigente_desde);
  if (!o.vigente_hasta) return `desde ${desde}`;
  const hasta = fechaCorta(o.vigente_hasta);
  if (o.vigente_hasta < hoy) return `${desde} – ${hasta}`;
  return `desde ${desde} · último día ${hasta}`;
}

export function textoAnteriores(n: number): string {
  return `Propietarios anteriores (${n})`;
}

export const ETIQUETA_BORRAR_HISTORIAL = "Borrar del historial";
export function tituloBorrarAnterior(nombre: string): string {
  return `¿Borrar a ${nombre} del historial?`;
}
export const TEXTO_BORRAR_ANTERIOR =
  "Se borra como si nunca hubiera sido propietario: los repartos de los meses en que figuraba cambian. Úsalo solo si se agregó por error; si de verdad fue dueño, déjalo en el historial.";
export function toastAnteriorBorrado(nombre: string): string {
  return `${nombre} se borró del historial.`;
}

// =============================================================================
// Filas de la ventana «Editar propietarios»
// =============================================================================

export type QuitarFila = { modo: "cerrar"; hasta: string } | { modo: "borrar" };

export interface FilaPropietario {
  /** El id de la fila guardada, o `nueva-N`. */
  clave: string;
  /** null = todavía no existe en el servidor. */
  id: string | null;
  socio_id: string;
  /** Lo tecleado (texto): se valida con `pctNumero`. */
  porcentaje: string;
  vigente_desde: string;
  /** "" = abierto. */
  vigente_hasta: string;
  notas: string;
  /** «Quitar» pendiente de guardar; una fila NUEVA se quita de la lista sin esto. */
  quitar: QuitarFila | null;
}

export function filasDeVigentes(owners: readonly AircraftOwner[]): FilaPropietario[] {
  return owners.map((o) => ({
    clave: o.id,
    id: o.id,
    socio_id: o.socio_id,
    porcentaje: String(Number(o.porcentaje)),
    vigente_desde: o.vigente_desde,
    vigente_hasta: o.vigente_hasta ?? "",
    notas: o.notas ?? "",
    quitar: null,
  }));
}

export function filaNueva(hoy: string, n: number): FilaPropietario {
  return {
    clave: `nueva-${n}`,
    id: null,
    socio_id: "",
    porcentaje: "",
    vigente_desde: hoy,
    vigente_hasta: "",
    notas: "",
    quitar: null,
  };
}

export function filasActivas(filas: readonly FilaPropietario[]): FilaPropietario[] {
  return filas.filter((f) => f.quitar === null);
}

export function sumaDeFilas(filas: readonly FilaPropietario[]): number {
  return sumaPorcentajes(filasActivas(filas).map((f) => f.porcentaje));
}

// --- La regla del 100 % por día (espejo EXACTO del API) ---------------------

export interface VigenciaPct {
  id: string;
  nombre: string;
  porcentaje: number | string;
  vigente_desde: string;
  vigente_hasta: string | null;
}

export interface ExcesoPorcentaje {
  dia: string;
  suma: number;
  propietarios: { id: string; nombre: string; porcentaje: number }[];
}

/**
 * Los vigentes de UN MISMO DÍA nunca suman más de 100 %: barrido por los días
 * en que cambia el conjunto (cada primer día y el siguiente a cada último).
 * Devuelve el primer día que se pasa, o null.
 */
export function excesoPorcentaje(filas: readonly VigenciaPct[]): ExcesoPorcentaje | null {
  const cortes = new Set<string>();
  for (const f of filas) {
    cortes.add(f.vigente_desde);
    if (f.vigente_hasta !== null) cortes.add(diaMas(f.vigente_hasta, 1));
  }
  for (const dia of [...cortes].sort()) {
    const activos = filas.filter(
      (f) => f.vigente_desde <= dia && (f.vigente_hasta === null || f.vigente_hasta >= dia),
    );
    const suma = sumaPorcentajes(activos.map((f) => f.porcentaje));
    if (suma > 100 + TOLERANCIA_SUMA_PCT) {
      return {
        dia,
        suma,
        propietarios: activos.map((f) => ({ id: f.id, nombre: f.nombre, porcentaje: Number(f.porcentaje) })),
      };
    }
  }
  return null;
}

/** El MISMO texto del 400 `PROPIETARIO_SUMA_EXCEDE` del API. */
export function mensajeSumaExcede(e: ExcesoPorcentaje): string {
  const quienes = e.propietarios.map((p) => `${p.nombre} ${textoPorcentaje(p.porcentaje)}`).join(" + ");
  const [y, m, d] = e.dia.split("-");
  return `Los propietarios sumarían ${textoPorcentaje(e.suma)} el ${d}/${m}/${y} (${quienes}): no pueden pasar de 100 %. Pon el último día del que sale o baja los porcentajes.`;
}

/**
 * Las filas COMO QUEDARÍAN al guardar (cerradas con su último día; las
 * borradas fuera) más `extras`: los propietarios ANTERIORES del avión, que el
 * API también cuenta en su barrido (mover el primer día de uno hacia atrás
 * puede chocar con un régimen ya cerrado).
 */
export function filasResultantes(
  filas: readonly FilaPropietario[],
  nombres: ReadonlyMap<string, string>,
  extras: readonly VigenciaPct[] = [],
): VigenciaPct[] {
  const out: VigenciaPct[] = [...extras];
  for (const f of filas) {
    if (f.quitar?.modo === "borrar") continue;
    const porcentaje = pctNumero(f.porcentaje);
    if (porcentaje === null || !esDia(f.vigente_desde)) continue;
    let hasta: string | null = esDia(f.vigente_hasta) ? f.vigente_hasta : null;
    if (f.quitar?.modo === "cerrar") {
      if (!esDia(f.quitar.hasta)) continue;
      hasta = f.quitar.hasta;
    }
    out.push({
      id: f.clave,
      nombre: nombres.get(f.socio_id) ?? "Socio",
      porcentaje,
      vigente_desde: f.vigente_desde,
      vigente_hasta: hasta,
    });
  }
  return out;
}

// --- Quitar --------------------------------------------------------------------

export type MotivoUltimoDia = "RELEVO" | "AYER" | "HOY";

export interface SugerenciaUltimoDia {
  dia: string;
  motivo: MotivoUltimoDia;
  /** Con RELEVO: quién entra después. */
  relevo?: string;
}

/**
 * El último día que se propone al quitar a alguien: el día ANTERIOR a que
 * entró el propietario más antiguo que empezó después de él (el relevo: en
 * XA-VGV, Alejandro desde el 18-ago ⇒ Hernan hasta el 17-ago); si no hay
 * relevo, AYER (desde hoy ya no cuenta); si empezó hoy, HOY mismo (la
 * salida real es «se agregó por error»).
 */
export function sugerenciaUltimoDia(
  fila: FilaPropietario,
  filas: readonly FilaPropietario[],
  hoy: string,
  nombres: ReadonlyMap<string, string>,
): SugerenciaUltimoDia {
  const relevos = filas
    .filter((f) => f.clave !== fila.clave && f.quitar === null && esDia(f.vigente_desde) && f.vigente_desde > fila.vigente_desde)
    .sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde));
  if (relevos.length > 0) {
    const r = relevos[0];
    const dia = diaAnterior(r.vigente_desde);
    if (dia >= fila.vigente_desde) {
      return { dia, motivo: "RELEVO", relevo: nombres.get(r.socio_id) ?? "el nuevo propietario" };
    }
  }
  const ayer = diaMas(hoy, -1);
  if (ayer >= fila.vigente_desde) return { dia: ayer, motivo: "AYER" };
  return { dia: fila.vigente_desde, motivo: "HOY" };
}

export function textoSugerenciaUltimoDia(s: SugerenciaUltimoDia): string {
  if (s.motivo === "RELEVO") return `El día anterior a que entró ${s.relevo}: ${fechaCorta(s.dia)}.`;
  if (s.motivo === "AYER") return "Ayer: desde hoy ya no cuenta como propietario.";
  return "Empezó hoy: si se agregó por error, elige «Se agregó por error».";
}

export function tituloQuitar(nombre: string): string {
  return `${nombre} sale de los propietarios`;
}
export const OPCION_QUITAR_CERRAR = "Dejó de ser propietario";
export const AYUDA_QUITAR_CERRAR = "Se conserva en el historial: contó hasta su último día.";
export const ETIQUETA_ULTIMO_DIA = "Último día como propietario";
export const OPCION_QUITAR_BORRAR = "Se agregó por error";
export const AYUDA_QUITAR_BORRAR =
  "Se borra del historial: los repartos de los meses en que figuraba cambian.";
export const ETIQUETA_DESHACER_QUITAR = "No quitarlo";
export const ETIQUETA_QUITAR = "Quitar";
export const ETIQUETA_QUITAR_FILA_NUEVA = "Quitar";
export const ETIQUETA_AGREGAR_PROPIETARIO = "＋ Agregar propietario";
export const ETIQUETA_QUITAR_FECHA_FIN = "Quitar la fecha de fin";

/** Error de un último día tecleado para ESA fila (null = válido). */
export function errorUltimoDia(fila: FilaPropietario, dia: string, nombre: string): string | null {
  if (!esDia(dia)) return "Elige el último día.";
  if (dia < fila.vigente_desde) {
    return `${nombre} empezó el ${fechaCorta(fila.vigente_desde)}: no puede terminar antes. Si se agregó por error, elige «${OPCION_QUITAR_BORRAR}».`;
  }
  return null;
}

// --- Validación de la ventana ----------------------------------------------------

export interface ErroresFilas {
  porFila: Record<string, string>;
  /** La suma por día que se pasa de 100 % (bloquea el guardado). */
  general: string | null;
}

export function validarFilas(
  filas: readonly FilaPropietario[],
  nombres: ReadonlyMap<string, string>,
  extras: readonly VigenciaPct[] = [],
): ErroresFilas {
  const porFila: Record<string, string> = {};
  const vistos = new Map<string, string>();
  for (const f of filas) {
    const nombre = nombres.get(f.socio_id) ?? "Este propietario";
    if (f.quitar?.modo === "cerrar") {
      const e = errorUltimoDia(f, f.quitar.hasta, nombre);
      if (e) porFila[f.clave] = e;
      continue;
    }
    if (f.quitar?.modo === "borrar") continue;
    if (!f.socio_id) {
      porFila[f.clave] = PLACEHOLDER_SOCIO + ".";
      continue;
    }
    const pct = pctNumero(f.porcentaje);
    if (pct === null || pct < 0.001 || pct > 100) {
      porFila[f.clave] = "Porcentaje de 0.001 a 100.";
      continue;
    }
    if (!esDia(f.vigente_desde)) {
      porFila[f.clave] = "Elige el primer día.";
      continue;
    }
    if (f.vigente_hasta !== "" && (!esDia(f.vigente_hasta) || f.vigente_hasta < f.vigente_desde)) {
      porFila[f.clave] = "El último día no puede ser antes del primero.";
      continue;
    }
    const previa = vistos.get(f.socio_id);
    if (previa) {
      porFila[f.clave] = `${nombre} ya está en la lista.`;
      continue;
    }
    vistos.set(f.socio_id, f.clave);
  }
  const exceso =
    Object.keys(porFila).length === 0 ? excesoPorcentaje(filasResultantes(filas, nombres, extras)) : null;
  return { porFila, general: exceso ? mensajeSumaExcede(exceso) : null };
}

/** Los propietarios ANTERIORES (ya cerrados) como vigencias para el barrido. */
export function vigenciasDeAnteriores(anteriores: readonly AircraftOwner[]): VigenciaPct[] {
  return anteriores.map((o) => ({
    id: o.id,
    nombre: o.usuario?.nombre ?? "Socio",
    porcentaje: Number(o.porcentaje),
    vigente_desde: o.vigente_desde,
    vigente_hasta: o.vigente_hasta,
  }));
}

/** Del historial completo: los que YA terminaron (último día antes de hoy). */
export function propietariosAnteriores(historial: readonly AircraftOwner[], hoy: string): AircraftOwner[] {
  return historial
    .filter((o) => o.vigente_hasta !== null && o.vigente_hasta < hoy)
    .sort((a, b) => (b.vigente_hasta ?? "").localeCompare(a.vigente_hasta ?? ""));
}

// --- El plan de llamadas ---------------------------------------------------------

export interface PatchPropietario {
  socio_id?: string;
  porcentaje?: number;
  vigente_desde?: string;
  vigente_hasta?: string | null;
  notas?: string | null;
}

export interface AltaPropietario {
  socio_id: string;
  porcentaje: number;
  vigente_desde: string;
  vigente_hasta?: string;
  notas?: string;
}

export type PasoPlan =
  | { tipo: "borrar"; id: string; nombre: string }
  | { tipo: "cerrar"; id: string; hasta: string; nombre: string }
  | { tipo: "actualizar"; id: string; patch: PatchPropietario; nombre: string }
  | { tipo: "crear"; alta: AltaPropietario; nombre: string };

/** Solo lo que CAMBIÓ respecto a la fila guardada; null si nada. */
export function cambiosDeFila(original: AircraftOwner, fila: FilaPropietario): PatchPropietario | null {
  const patch: PatchPropietario = {};
  if (fila.socio_id !== original.socio_id) patch.socio_id = fila.socio_id;
  const pct = pctNumero(fila.porcentaje);
  if (pct !== null && Math.round(pct * 1000) !== Math.round(Number(original.porcentaje) * 1000)) {
    patch.porcentaje = pct;
  }
  if (fila.vigente_desde !== original.vigente_desde) patch.vigente_desde = fila.vigente_desde;
  const hastaOriginal = original.vigente_hasta ?? "";
  if (fila.vigente_hasta !== hastaOriginal) patch.vigente_hasta = fila.vigente_hasta === "" ? null : fila.vigente_hasta;
  const notasOriginal = original.notas ?? "";
  if (fila.notas.trim() !== notasOriginal.trim()) patch.notas = fila.notas.trim() === "" ? null : fila.notas.trim();
  return Object.keys(patch).length === 0 ? null : patch;
}

/**
 * Los pasos a ejecutar, en un orden que no choque con «nunca más del 100 %»:
 * primero lo que QUITA (borrar, cerrar, bajar porcentajes) y al final lo que
 * SUMA (subir porcentajes, agregar). Un plan vacío = sin cambios.
 */
export function planPropietarios(
  filas: readonly FilaPropietario[],
  originales: readonly AircraftOwner[],
  nombres: ReadonlyMap<string, string>,
): PasoPlan[] {
  const porId = new Map(originales.map((o) => [o.id, o]));
  const nombreDe = (socioId: string) => nombres.get(socioId) ?? "Socio";
  const borrar: PasoPlan[] = [];
  const cerrar: PasoPlan[] = [];
  const bajan: PasoPlan[] = [];
  const suben: PasoPlan[] = [];
  const crear: PasoPlan[] = [];
  for (const f of filas) {
    if (f.id === null) {
      if (f.quitar) continue;
      const pct = pctNumero(f.porcentaje);
      if (pct === null) continue;
      const alta: AltaPropietario = { socio_id: f.socio_id, porcentaje: pct, vigente_desde: f.vigente_desde };
      if (f.vigente_hasta) alta.vigente_hasta = f.vigente_hasta;
      if (f.notas.trim()) alta.notas = f.notas.trim();
      crear.push({ tipo: "crear", alta, nombre: nombreDe(f.socio_id) });
      continue;
    }
    const original = porId.get(f.id);
    if (!original) continue;
    const nombre = original.usuario?.nombre ?? nombreDe(f.socio_id);
    if (f.quitar?.modo === "borrar") {
      borrar.push({ tipo: "borrar", id: f.id, nombre });
      continue;
    }
    if (f.quitar?.modo === "cerrar") {
      cerrar.push({ tipo: "cerrar", id: f.id, hasta: f.quitar.hasta, nombre });
      continue;
    }
    const patch = cambiosDeFila(original, f);
    if (!patch) continue;
    const paso: PasoPlan = { tipo: "actualizar", id: f.id, patch, nombre };
    const sube = patch.porcentaje !== undefined && patch.porcentaje > Number(original.porcentaje);
    (sube ? suben : bajan).push(paso);
  }
  return [...borrar, ...cerrar, ...bajan, ...suben, ...crear];
}

export function descripcionPaso(p: PasoPlan): string {
  switch (p.tipo) {
    case "borrar":
      return `${p.nombre}: borrado del historial`;
    case "cerrar":
      return `${p.nombre}: último día ${fechaCorta(p.hasta)}`;
    case "crear":
      return `${p.nombre}: agregado con ${textoPorcentaje(p.alta.porcentaje)} desde ${fechaCorta(p.alta.vigente_desde)}`;
    case "actualizar": {
      const partes: string[] = [];
      if (p.patch.porcentaje !== undefined) partes.push(`${textoPorcentaje(p.patch.porcentaje)}`);
      if (p.patch.socio_id !== undefined) partes.push("otra persona");
      if (p.patch.vigente_desde !== undefined) partes.push(`desde ${fechaCorta(p.patch.vigente_desde)}`);
      if (p.patch.vigente_hasta !== undefined) {
        partes.push(p.patch.vigente_hasta === null ? "sin fecha de fin" : `último día ${fechaCorta(p.patch.vigente_hasta)}`);
      }
      if (p.patch.notas !== undefined) partes.push("notas");
      return `${p.nombre}: ${partes.join(", ")}`;
    }
  }
}

export const TITULO_VENTANA_PROPIETARIOS = "Editar propietarios";
export const DESCRIPCION_VENTANA_PROPIETARIOS =
  "Cambia porcentajes, quita o agrega propietarios y da de alta un socio nuevo desde aquí. Los vigentes deben sumar 100 % y nunca más.";
export const ETIQUETA_GUARDAR_PROPIETARIOS = "Guardar cambios";
export const ETIQUETA_GUARDANDO_PROPIETARIOS = "Guardando…";
export const TEXTO_SIN_CAMBIOS_PROPIETARIOS = "No cambiaste nada.";
export const TEXTO_USUARIOS_NO_CARGARON =
  "No se pudo cargar la lista de socios: recarga la página para elegir o dar de alta uno.";

/** Confirmación cuando los vigentes quedan por DEBAJO de 100 %. */
export function textoConfirmarMenosDeCien(total: number): string {
  return `Los propietarios quedarán en ${textoPorcentaje(total)}, no en 100 %: el reparto a socios solo repartirá esa parte.`;
}

export const TITULO_CONFIRMAR_GUARDAR = "¿Guardar los cambios?";
export const ETIQUETA_CONFIRMAR_GUARDAR = "Sí, guardar";
export const ETIQUETA_REVISAR = "Revisar";

/** Lo destructivo se dice antes de guardar: a quién se borra del historial. */
export function textoConfirmarBorrados(nombres: readonly string[]): string {
  if (nombres.length === 0) return "";
  const quien = nombres.length === 1 ? nombres[0] : nombres.join(", ");
  return `Se ${nombres.length === 1 ? "borrará" : "borrarán"} del historial como si nunca ${nombres.length === 1 ? "hubiera" : "hubieran"} sido propietario: ${quien}. Los repartos de los meses en que figuraba${nombres.length === 1 ? "" : "n"} cambian y no se puede deshacer.`;
}

/** ¿El plan necesita confirmación antes de llamar al API? */
export function planPideConfirmacion(plan: readonly PasoPlan[], total: number): boolean {
  return plan.some((p) => p.tipo === "borrar") || estadoSuma(total) === "MENOS";
}

export function toastPropietariosGuardados(n: number): string {
  return n === 1 ? "Propietarios guardados (1 cambio)." : `Propietarios guardados (${n} cambios).`;
}

/** Un paso falló: cuántos sí se aplicaron (ya están guardados) y cuál no. */
export function textoGuardadoParcial(hechos: number, total: number, paso: PasoPlan, error: string): string {
  const aplicados =
    hechos === 0
      ? "No se aplicó ningún cambio."
      : `Se aplicaron ${hechos} de ${total} cambios (ya están guardados).`;
  return `${aplicados} Falló «${descripcionPaso(paso)}»: ${error}`;
}
