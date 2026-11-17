/**
 * COMPONENTES CON VIDA LÍMITE del avión (17-nov-2026, API 0.0.140, invariante
 * 135 del API). Pedido del cliente: «que se incluya en ese apartado de
 * mantenimiento también la lista de componentes del avión y su seguimiento…
 * saber cuánto tiempo le queda a un foco, a una llanta».
 *
 * FUENTE ÚNICA (PURA, sin React) de los textos y de las reglas de PINTADO.
 * Lo que le queda a una pieza (horas, días, estado) lo calcula el API con el
 * Hobbs del avión y la fecha de hoy en Cancún (`vida`); aquí NUNCA se
 * recalcula: solo se redacta. Ningún componente escribe estas frases a mano.
 */
import { fmtDateOnly } from "@/lib/datetime";
import type {
  ComponenteAeronave,
  ComponenteBody,
  EstadoVida,
  PiezaNuevaBody,
  ReemplazarComponenteBody,
  RetirarComponenteBody,
  VidaComponente,
} from "@/types/engineering";
import { mensajeErrorBase, type ErrorIngenieria } from "./ingenieria-errores";
import { textoHorasRestantes } from "./proximo-servicio";

// ── Catálogos de ayuda (sugerencias: el campo es libre) ─────────────────────

/** Nombres sugeridos al dar de alta (el operador puede escribir cualquier otro). */
export const SUGERENCIAS_NOMBRE_COMPONENTE: readonly string[] = [
  "Llanta principal",
  "Llanta de nariz",
  "Cámara de llanta",
  "Frenos (pastillas)",
  "Batería",
  "Batería del ELT",
  "Extintor",
  "Foco de aterrizaje",
  "Foco de taxi",
  "Luces de navegación",
  "Estrobos",
  "Beacon",
  "Filtro de aceite",
  "Filtro de aire",
  "Filtro de combustible",
  "Magneto",
  "Bujías",
  "Bomba de vacío",
  "Bomba de combustible",
  "Alternador",
  "Marcha",
  "Mangueras",
  "Cinturones de seguridad",
  "Chalecos salvavidas",
  "Botiquín",
];

export const CATEGORIAS_COMPONENTE: readonly string[] = [
  "Tren de aterrizaje",
  "Luces",
  "Motor (accesorios)",
  "Eléctrico",
  "Combustible",
  "Aviónica",
  "Emergencia",
  "Cabina",
  "Otro",
];

export const POSICIONES_COMPONENTE: readonly string[] = [
  "Izquierda",
  "Derecha",
  "Nariz",
  "Motor izquierdo",
  "Motor derecho",
  "Cola",
  "Cabina",
];

// ── Estado y tono ───────────────────────────────────────────────────────────

export const ETIQUETA_ESTADO_VIDA: Record<EstadoVida, string> = {
  VENCIDO: "Vencido",
  POR_VENCER: "Por vencer",
  SIN_DATOS: "Falta un dato",
  VIGENTE: "Vigente",
  SIN_LIMITE: "A condición",
};

export type TonoVida = "rojo" | "ambar" | "verde" | "gris";

/** Color del estado: rojo vencido, ámbar por vencer o sin dato, verde vigente. */
export function tonoVida(estado: EstadoVida | null | undefined): TonoVida {
  switch (estado) {
    case "VENCIDO":
      return "rojo";
    case "POR_VENCER":
    case "SIN_DATOS":
      return "ambar";
    case "VIGENTE":
      return "verde";
    default:
      return "gris";
  }
}

// Mismas clases que ya usan las cards vecinas (motores, mantenimientos).
export const CLASE_TEXTO_TONO_VIDA: Record<TonoVida, string> = {
  rojo: "text-destructive",
  ambar: "text-amber-600 dark:text-amber-400",
  verde: "text-emerald-600 dark:text-emerald-400",
  gris: "text-muted-foreground",
};

export const CLASE_BADGE_TONO_VIDA: Record<TonoVida, string> = {
  rojo: "bg-destructive/15 text-destructive border-destructive/30",
  ambar: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  verde: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  gris: "text-muted-foreground",
};

export const CLASE_BARRA_TONO_VIDA: Record<TonoVida, string> = {
  rojo: "bg-destructive",
  ambar: "bg-amber-500",
  verde: "bg-emerald-500",
  gris: "bg-muted-foreground/40",
};

// ── Números y tiempos ───────────────────────────────────────────────────────

const nf1 = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const nfCorto = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });

/** Horas con una décima: «5,480.2 h». */
export function horasTexto(n: number): string {
  return `${nf1.format(n)} h`;
}

/** Número sin ceros de cola: «500», «1,200», «62.5». */
export function numeroCorto(n: number): string {
  return nfCorto.format(n);
}

/** «1 día» / «N días». */
export function textoDias(dias: number): string {
  const d = Math.abs(Math.round(dias));
  return d === 1 ? "1 día" : `${d} días`;
}

/** «1 mes» / «N meses». */
export function textoMeses(meses: number): string {
  return meses === 1 ? "1 mes" : `${meses} meses`;
}

/**
 * Tiempo transcurrido en palabras de operador: «45 días», «8 meses»,
 * «2 años 3 meses». Es redacción (mes ≈ 30.44 días), no un cálculo de vida:
 * 365 días se leen «12 meses», no «11».
 */
export function textoTiempoTranscurrido(dias: number): string {
  const d = Math.max(0, Math.round(dias));
  if (d < 60) return textoDias(d);
  const meses = Math.floor((d + 0.5) / 30.4375);
  if (meses < 24) return textoMeses(meses);
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  const a = anios === 1 ? "1 año" : `${anios} años`;
  return resto === 0 ? a : `${a} ${textoMeses(resto)}`;
}

// ── Lo que le queda ─────────────────────────────────────────────────────────

/** «faltan 120.5 h» / «vencido por 3.2 h»; sin límite por horas ⇒ `null`. */
export function textoRestanteHoras(
  vida: Pick<VidaComponente, "horas_restantes">,
): string | null {
  return vida.horas_restantes == null
    ? null
    : textoHorasRestantes(vida.horas_restantes);
}

/**
 * «vence el 12/03/2027 · en 115 días» · «vence hoy» · «venció el 13/11/2026 ·
 * hace 4 días»; sin fecha límite ⇒ `null`.
 */
export function textoRestanteFecha(
  vida: Pick<VidaComponente, "vence_el" | "dias_restantes">,
): string | null {
  if (!vida.vence_el) return null;
  const fecha = fmtDateOnly(vida.vence_el);
  const d = vida.dias_restantes;
  if (d == null) return `vence el ${fecha}`;
  if (d === 0) return "vence hoy";
  return d > 0
    ? `vence el ${fecha} · en ${textoDias(d)}`
    : `venció el ${fecha} · hace ${textoDias(d)}`;
}

/** Qué dato falta, en palabras de operador. */
export function textoFaltante(campo: string): string {
  switch (campo) {
    case "horas_aeronave_instalacion":
      return "falta capturar el Hobbs al instalar";
    case "fecha_instalacion":
      return "falta capturar la fecha de instalación";
    case "horas_aeronave":
      return "el avión todavía no tiene horas registradas";
    default:
      return "falta un dato para calcular lo que le queda";
  }
}

export interface LineaRestante {
  texto: string;
  /** `true` = este renglón es el que decide el color del componente. */
  decide: boolean;
  /** `true` = es un dato que falta capturar (se pinta en ámbar). */
  falta?: boolean;
}

/**
 * Renglones de «lo que le queda» de un componente INSTALADO: horas y/o fecha
 * (el que decide el estado va marcado), los datos que faltan y, sin límites,
 * que se cambia a condición.
 */
export function lineasRestante(vida: VidaComponente): LineaRestante[] {
  const lineas: LineaRestante[] = [];
  const horas = textoRestanteHoras(vida);
  if (horas) lineas.push({ texto: horas, decide: vida.por === "HORAS" });
  const fecha = textoRestanteFecha(vida);
  if (fecha) lineas.push({ texto: fecha, decide: vida.por === "FECHA" });
  for (const f of vida.faltantes ?? []) {
    lineas.push({ texto: textoFaltante(f), decide: false, falta: true });
  }
  if (lineas.length === 0 && vida.estado === "SIN_LIMITE") {
    lineas.push({ texto: TEXTO_A_CONDICION, decide: false });
  }
  return lineas;
}

export const TEXTO_A_CONDICION = "sin límite: se cambia a condición";

/** «lleva 210.0 h · 8 meses instalado»; sin datos ⇒ `null`. */
export function textoEnServicio(
  vida: Pick<VidaComponente, "horas_en_servicio" | "dias_en_servicio">,
): string | null {
  const h = vida.horas_en_servicio;
  const d = vida.dias_en_servicio;
  if (h == null && d == null) return null;
  if (h != null && d != null) {
    return `lleva ${horasTexto(h)} · ${textoTiempoTranscurrido(d)} instalado`;
  }
  return h != null
    ? `lleva ${horasTexto(h)}`
    : `lleva ${textoTiempoTranscurrido(d as number)} instalado`;
}

/**
 * Cada cuándo se cambia: «cada 500 h o 12 meses» · «cada 500 h» · «cada 12
 * meses» · «vence el 12/03/2027» · «cada 500 h o el 12/03/2027» · «a
 * condición (sin límite)». La fecha EXACTA manda sobre los meses.
 */
export function etiquetaLimite(
  c: Pick<ComponenteAeronave, "limite_horas" | "limite_meses" | "fecha_vencimiento">,
): string {
  const horas = c.limite_horas != null ? `${numeroCorto(c.limite_horas)} h` : null;
  const calendario = c.fecha_vencimiento
    ? `el ${fmtDateOnly(c.fecha_vencimiento)}`
    : c.limite_meses != null
      ? textoMeses(c.limite_meses)
      : null;
  if (horas && calendario) return `cada ${horas} o ${calendario}`;
  if (horas) return `cada ${horas}`;
  if (c.fecha_vencimiento) return `vence ${calendario}`;
  if (calendario) return `cada ${calendario}`;
  return "a condición (sin límite)";
}

/**
 * Porcentaje de vida usada para la BARRA (0–100), con los derivados del API:
 * lo usado entre lo usado + lo que queda, de la dimensión que decide el
 * estado. Sin límite (o sin datos) ⇒ `null` y no se pinta barra.
 */
export function porcentajeVidaUsada(vida: VidaComponente): number | null {
  const porHoras = pct(vida.horas_en_servicio, vida.horas_restantes);
  const porFecha = pct(vida.dias_en_servicio, vida.dias_restantes);
  if (vida.por === "FECHA") return porFecha ?? porHoras;
  return porHoras ?? porFecha;
}

function pct(usado: number | null, queda: number | null): number | null {
  if (usado == null || queda == null) return null;
  const total = usado + queda;
  if (!(total > 0)) return null;
  return Math.min(100, Math.max(0, Math.round((usado / total) * 100)));
}

// ── Ficha ───────────────────────────────────────────────────────────────────

/** «Llanta principal · Izquierda». */
export function tituloComponente(
  c: Pick<ComponenteAeronave, "nombre" | "posicion">,
): string {
  return c.posicion ? `${c.nombre} · ${c.posicion}` : c.nombre;
}

/** «P/N 6.00-6 · S/N A123 · Goodyear»; sin datos ⇒ `null`. */
export function textoIdentificacion(
  c: Pick<ComponenteAeronave, "numero_parte" | "numero_serie" | "fabricante">,
): string | null {
  const partes = [
    c.numero_parte ? `P/N ${c.numero_parte}` : null,
    c.numero_serie ? `S/N ${c.numero_serie}` : null,
    c.fabricante,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : null;
}

/** «Instalado el 12/03/2026 · Hobbs 5,480.2 h · traía 35.0 h». */
export function textoInstalacion(
  c: Pick<
    ComponenteAeronave,
    "fecha_instalacion" | "horas_aeronave_instalacion" | "horas_previas"
  >,
): string {
  const partes = [
    c.fecha_instalacion
      ? `Instalado el ${fmtDateOnly(c.fecha_instalacion)}`
      : "Sin fecha de instalación",
    c.horas_aeronave_instalacion != null
      ? `Hobbs ${horasTexto(c.horas_aeronave_instalacion)}`
      : null,
    c.horas_previas > 0 ? `traía ${horasTexto(c.horas_previas)}` : null,
  ].filter(Boolean);
  return partes.join(" · ");
}

/** «Retirado el 17/11/2026 · Hobbs 5,600.0 h · estuvo 120.5 h · 8 meses». */
export function textoRetiro(c: ComponenteAeronave): string {
  const partes = [
    c.fecha_retiro ? `Retirado el ${fmtDateOnly(c.fecha_retiro)}` : "Retirado",
    c.horas_aeronave_retiro != null ? `Hobbs ${horasTexto(c.horas_aeronave_retiro)}` : null,
    c.vida.horas_en_servicio != null ? `estuvo ${horasTexto(c.vida.horas_en_servicio)}` : null,
    c.vida.dias_en_servicio != null
      ? textoTiempoTranscurrido(c.vida.dias_en_servicio)
      : null,
  ].filter(Boolean);
  return partes.join(" · ");
}

/** «Lo sustituyó otra pieza» / «Se retiró sin sustituto». */
export function textoSustitucion(
  c: Pick<ComponenteAeronave, "reemplazado_por_id">,
): string {
  return c.reemplazado_por_id ? "Se cambió por una pieza nueva" : "Se retiró sin sustituto";
}

// ── Mosaico del resumen ─────────────────────────────────────────────────────

export interface ResumenComponentes {
  total: number;
  vencidos: number;
  porVencer: number;
  sinDatos: number;
}

/** Cuenta los INSTALADOS por estado (el estado lo manda el API). */
export function resumenComponentes(
  componentes: readonly Pick<ComponenteAeronave, "vida">[],
): ResumenComponentes {
  const r: ResumenComponentes = { total: 0, vencidos: 0, porVencer: 0, sinDatos: 0 };
  for (const c of componentes) {
    r.total += 1;
    if (c.vida.estado === "VENCIDO") r.vencidos += 1;
    else if (c.vida.estado === "POR_VENCER") r.porVencer += 1;
    else if (c.vida.estado === "SIN_DATOS") r.sinDatos += 1;
  }
  return r;
}

const plural = (n: number, uno: string, varios: string) =>
  n === 1 ? `1 ${uno}` : `${n} ${varios}`;

/** Lo que dice el mosaico «Componentes» del resumen de mantenimiento. */
export function textoMosaicoComponentes(r: ResumenComponentes): {
  valor: string;
  hint: string;
  tono: TonoVida;
} {
  const instalados = plural(r.total, "instalado", "instalados");
  if (r.total === 0) {
    return {
      valor: "Sin componentes",
      hint: "Agrega los que quieras vigilar",
      tono: "gris",
    };
  }
  if (r.vencidos > 0) {
    return {
      valor: plural(r.vencidos, "vencido", "vencidos"),
      hint:
        r.porVencer > 0
          ? `y ${r.porVencer} por vencer · de ${instalados}`
          : `de ${instalados}`,
      tono: "rojo",
    };
  }
  if (r.porVencer > 0) {
    return {
      valor: `${r.porVencer} por vencer`,
      hint: `de ${instalados}`,
      tono: "ambar",
    };
  }
  if (r.sinDatos > 0) {
    return {
      valor: `Falta un dato en ${r.sinDatos}`,
      hint: `de ${instalados}`,
      tono: "ambar",
    };
  }
  return { valor: "Al día", hint: instalados, tono: "verde" };
}

// ── Formulario de alta / edición ────────────────────────────────────────────

/** Valores del formulario: todo texto, como lo teclea el operador. */
export interface ValoresComponente {
  nombre: string;
  categoria: string;
  posicion: string;
  numero_parte: string;
  numero_serie: string;
  fabricante: string;
  fecha_instalacion: string;
  horas_aeronave_instalacion: string;
  horas_previas: string;
  limite_horas: string;
  limite_meses: string;
  fecha_vencimiento: string;
  aviso_horas: string;
  aviso_dias: string;
  notas: string;
}

const txt = (v: unknown): string => (v == null ? "" : String(v));

/**
 * Valores con los que arranca el formulario. ALTA: la fecha de hoy (Cancún) y
 * el Hobbs actual del avión ya vienen puestos (lo normal es registrar la
 * pieza el día que se instala); EDICIÓN: lo guardado.
 */
export function valoresComponente(
  c: ComponenteAeronave | null | undefined,
  contexto: { horasAeronave?: number | null; hoy?: string | null } = {},
): ValoresComponente {
  if (!c) {
    return {
      nombre: "",
      categoria: "",
      posicion: "",
      numero_parte: "",
      numero_serie: "",
      fabricante: "",
      fecha_instalacion: contexto.hoy ?? "",
      horas_aeronave_instalacion:
        contexto.horasAeronave != null ? String(contexto.horasAeronave) : "",
      horas_previas: "",
      limite_horas: "",
      limite_meses: "",
      fecha_vencimiento: "",
      aviso_horas: "",
      aviso_dias: "",
      notas: "",
    };
  }
  return {
    nombre: c.nombre,
    categoria: txt(c.categoria),
    posicion: txt(c.posicion),
    numero_parte: txt(c.numero_parte),
    numero_serie: txt(c.numero_serie),
    fabricante: txt(c.fabricante),
    fecha_instalacion: txt(c.fecha_instalacion),
    horas_aeronave_instalacion: txt(c.horas_aeronave_instalacion),
    horas_previas: c.horas_previas > 0 ? String(c.horas_previas) : "",
    limite_horas: txt(c.limite_horas),
    limite_meses: txt(c.limite_meses),
    fecha_vencimiento: txt(c.fecha_vencimiento),
    aviso_horas: txt(c.aviso_horas),
    aviso_dias: txt(c.aviso_dias),
    notas: txt(c.notas),
  };
}

/** Texto → número (acepta «1,200.5»); vacío ⇒ `null`; basura ⇒ `NaN`. */
export function numeroDeTexto(v: string): number | null {
  const limpio = v.trim().replace(/,/g, "");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : Number.NaN;
}

export type ErroresFormulario<T> = Partial<Record<keyof T, string>>;

const ERROR_NUMERO = "Escribe un número";
const ERROR_NEGATIVO = "No puede ser negativo";
const ERROR_FECHA = "Fecha inválida";
const esFecha = (v: string) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v);

function errorNoNegativo(v: string): string | undefined {
  const n = numeroDeTexto(v);
  if (n === null) return undefined;
  if (Number.isNaN(n)) return ERROR_NUMERO;
  return n < 0 ? ERROR_NEGATIVO : undefined;
}

function errorLimiteHoras(v: string): string | undefined {
  const n = numeroDeTexto(v);
  if (n === null) return undefined;
  if (Number.isNaN(n)) return ERROR_NUMERO;
  return n > 0 ? undefined : "Debe ser mayor que cero (o déjalo vacío)";
}

function errorLimiteMeses(v: string): string | undefined {
  const n = numeroDeTexto(v);
  if (n === null) return undefined;
  if (Number.isNaN(n)) return ERROR_NUMERO;
  return Number.isInteger(n) && n >= 1 && n <= 600
    ? undefined
    : "Meses enteros, de 1 a 600 (o déjalo vacío)";
}

/** Mismos límites que el DTO del API; lo que no pase aquí no se manda. */
export function validarComponente(
  v: ValoresComponente,
): ErroresFormulario<ValoresComponente> {
  const e: ErroresFormulario<ValoresComponente> = {};
  const nombre = v.nombre.trim();
  if (nombre.length < 2) e.nombre = "Escribe el nombre del componente";
  else if (nombre.length > 120) e.nombre = "Máximo 120 caracteres";
  if (!esFecha(v.fecha_instalacion)) e.fecha_instalacion = ERROR_FECHA;
  if (!esFecha(v.fecha_vencimiento)) e.fecha_vencimiento = ERROR_FECHA;
  const numericos: (keyof ValoresComponente)[] = [
    "horas_aeronave_instalacion",
    "horas_previas",
    "aviso_horas",
    "aviso_dias",
  ];
  for (const k of numericos) {
    const err = errorNoNegativo(v[k]);
    if (err) e[k] = err;
  }
  const eh = errorLimiteHoras(v.limite_horas);
  if (eh) e.limite_horas = eh;
  const em = errorLimiteMeses(v.limite_meses);
  if (em) e.limite_meses = em;
  const dias = numeroDeTexto(v.aviso_dias);
  if (!e.aviso_dias && dias !== null && !Number.isInteger(dias)) {
    e.aviso_dias = "Días enteros";
  }
  return e;
}

const textoONull = (v: string): string | null => {
  const t = v.trim();
  return t === "" ? null : t;
};

/**
 * Cuerpo para el API. ALTA: lo vacío se OMITE (el API pone sus valores por
 * defecto). EDICIÓN: lo vacío viaja como `null` explícito para LIMPIAR el dato
 * (los avisos vacíos se omiten: conservan el que tenían).
 */
export function payloadComponente(
  v: ValoresComponente,
  modo: "alta" | "edicion",
): ComponenteBody {
  const completo = {
    nombre: v.nombre.trim(),
    categoria: textoONull(v.categoria),
    posicion: textoONull(v.posicion),
    numero_parte: textoONull(v.numero_parte),
    numero_serie: textoONull(v.numero_serie),
    fabricante: textoONull(v.fabricante),
    fecha_instalacion: textoONull(v.fecha_instalacion),
    horas_aeronave_instalacion: numeroDeTexto(v.horas_aeronave_instalacion),
    horas_previas: numeroDeTexto(v.horas_previas) ?? 0,
    limite_horas: numeroDeTexto(v.limite_horas),
    limite_meses: numeroDeTexto(v.limite_meses),
    fecha_vencimiento: textoONull(v.fecha_vencimiento),
    notas: textoONull(v.notas),
  };
  const body: ComponenteBody =
    modo === "edicion"
      ? completo
      : (Object.fromEntries(
          Object.entries(completo).filter(([, valor]) => valor !== null),
        ) as ComponenteBody);
  const avisoHoras = numeroDeTexto(v.aviso_horas);
  const avisoDias = numeroDeTexto(v.aviso_dias);
  if (avisoHoras !== null) body.aviso_horas = avisoHoras;
  if (avisoDias !== null) body.aviso_dias = avisoDias;
  return body;
}

// ── Retirar y reemplazar ────────────────────────────────────────────────────

export interface ValoresRetiro {
  fecha: string;
  horas_aeronave: string;
  motivo: string;
}

export interface ValoresReemplazo extends ValoresRetiro {
  numero_parte: string;
  numero_serie: string;
  fabricante: string;
  horas_previas: string;
  limite_horas: string;
  limite_meses: string;
  fecha_vencimiento: string;
  notas: string;
}

/** Retiro: hoy (Cancún) y el Hobbs actual ya vienen puestos. */
export function valoresRetiro(contexto: {
  horasAeronave?: number | null;
  hoy?: string | null;
}): ValoresRetiro {
  return {
    fecha: contexto.hoy ?? "",
    horas_aeronave: contexto.horasAeronave != null ? String(contexto.horasAeronave) : "",
    motivo: "",
  };
}

/**
 * Cambio de componente: la pieza nueva arranca con el MISMO número de parte,
 * fabricante y límites que la que sale (es lo normal), el número de serie
 * vacío y sin fecha exacta de vencimiento (esa era de la pieza vieja).
 */
export function valoresReemplazo(
  viejo: ComponenteAeronave,
  contexto: { horasAeronave?: number | null; hoy?: string | null },
): ValoresReemplazo {
  return {
    ...valoresRetiro(contexto),
    numero_parte: txt(viejo.numero_parte),
    numero_serie: "",
    fabricante: txt(viejo.fabricante),
    horas_previas: "",
    limite_horas: txt(viejo.limite_horas),
    limite_meses: txt(viejo.limite_meses),
    fecha_vencimiento: "",
    notas: "",
  };
}

export function validarRetiro(v: ValoresRetiro): ErroresFormulario<ValoresRetiro> {
  const e: ErroresFormulario<ValoresRetiro> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.fecha)) e.fecha = "Pon la fecha";
  const eh = errorNoNegativo(v.horas_aeronave);
  if (eh) e.horas_aeronave = eh;
  if (v.motivo.trim().length > 300) e.motivo = "Máximo 300 caracteres";
  return e;
}

export function validarReemplazo(
  v: ValoresReemplazo,
): ErroresFormulario<ValoresReemplazo> {
  const e: ErroresFormulario<ValoresReemplazo> = { ...validarRetiro(v) };
  const ep = errorNoNegativo(v.horas_previas);
  if (ep) e.horas_previas = ep;
  const eh = errorLimiteHoras(v.limite_horas);
  if (eh) e.limite_horas = eh;
  const em = errorLimiteMeses(v.limite_meses);
  if (em) e.limite_meses = em;
  if (!esFecha(v.fecha_vencimiento)) e.fecha_vencimiento = ERROR_FECHA;
  return e;
}

export function payloadRetiro(v: ValoresRetiro): RetirarComponenteBody {
  const body: RetirarComponenteBody = { fecha: v.fecha };
  const horas = numeroDeTexto(v.horas_aeronave);
  if (horas !== null) body.horas_aeronave = horas;
  const motivo = v.motivo.trim();
  if (motivo) body.motivo = motivo;
  return body;
}

/**
 * Los límites de la pieza nueva viajan SIEMPRE como se ven en el formulario
 * (número o `null`): lo que el operador ve es lo que se guarda, sin herencias
 * a ciegas.
 */
export function payloadReemplazo(v: ValoresReemplazo): ReemplazarComponenteBody {
  const nuevo: PiezaNuevaBody = {
    limite_horas: numeroDeTexto(v.limite_horas),
    limite_meses: numeroDeTexto(v.limite_meses),
  };
  const parte = v.numero_parte.trim();
  const serie = v.numero_serie.trim();
  const fabricante = v.fabricante.trim();
  const notas = v.notas.trim();
  const previas = numeroDeTexto(v.horas_previas);
  if (parte) nuevo.numero_parte = parte;
  if (serie) nuevo.numero_serie = serie;
  if (fabricante) nuevo.fabricante = fabricante;
  if (previas !== null && previas > 0) nuevo.horas_previas = previas;
  if (v.fecha_vencimiento) nuevo.fecha_vencimiento = v.fecha_vencimiento;
  if (notas) nuevo.notas = notas;
  return { ...payloadRetiro(v), nuevo };
}

// ── Confirmaciones (toda acción destructiva confirma) ───────────────────────

export interface TextoConfirmacion {
  titulo: string;
  descripcion: string;
  boton: string;
}

export function textoConfirmarReemplazo(
  c: Pick<ComponenteAeronave, "nombre" | "posicion" | "numero_serie">,
): TextoConfirmacion {
  const serie = c.numero_serie ? ` (S/N ${c.numero_serie})` : "";
  return {
    titulo: "Confirmar el cambio de componente",
    descripcion: `«${tituloComponente(c)}»${serie} pasa al historial como retirado y la pieza nueva empieza a contar desde el cambio. No se puede deshacer desde el panel.`,
    boton: "Sí, cambiar el componente",
  };
}

export function textoConfirmarRetiro(
  c: Pick<ComponenteAeronave, "nombre" | "posicion">,
): TextoConfirmacion {
  return {
    titulo: "Retirar componente",
    descripcion: `«${tituloComponente(c)}» pasa al historial como retirado SIN poner otro en su lugar y deja de vigilarse. Si lo vas a cambiar por una pieza nueva, usa «Reemplazar».`,
    boton: "Retirar",
  };
}

export function textoConfirmarEliminar(
  c: Pick<ComponenteAeronave, "nombre" | "posicion">,
): TextoConfirmacion {
  return {
    titulo: "Eliminar componente",
    descripcion: `«${tituloComponente(c)}» se elimina de la lista y del historial, junto con sus documentos. Úsalo solo si se capturó por error; si la pieza se quitó del avión, usa «Retirar».`,
    boton: "Eliminar",
  };
}

// ── Errores ─────────────────────────────────────────────────────────────────

export const TEXTO_COMPONENTES_NO_CARGARON =
  "No se pudieron cargar los componentes (no es que no haya).";

/** Mensaje en es-MX de un error del API al guardar, reemplazar, retirar o eliminar. */
export function mensajeErrorComponente(e: ErrorIngenieria): string {
  if (e.code === "COMPONENTE_YA_RETIRADO") {
    return "Ese componente ya estaba retirado. Recarga la página.";
  }
  return mensajeErrorBase(e);
}
