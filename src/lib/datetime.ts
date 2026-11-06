/**
 * Fechas y horas — SIEMPRE en zona horaria de Cancún (America/Cancun = UTC−5,
 * sin horario de verano). La BD guarda `timestamptz` en UTC; aquí convertimos a
 * Cancún para mostrar y, en los inputs, interpretamos lo que el usuario escribe
 * como hora de Cancún (no la del navegador).
 */

export const CANCUN_TZ = "America/Cancun";
/** Etiqueta para aclarar la zona en la UI. */
export const TZ_LABEL = "hora de Cancún (UTC−5)";

/** Minutos que Cancún va detrás de UTC (fijo, sin DST). */
const CANCUN_OFFSET_MIN = 5 * 60;

function valid(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ===== DD/MM/AAAA en todos lados (6-nov-2026) =====
// Pedido del dueño: «estandarizar todas las fechas al formato DD/MM/AAAA, en
// todos lados». Estas funciones son la FUENTE ÚNICA de los textos de fecha del
// panel: numéricas, con el día de CANCÚN (UTC−5, sin DST) y la hora de 12 h
// de siempre («10:40 a.m.»). Los inputs de fecha van aparte
// (`components/ui/input.tsx` + `lib/fecha-input.ts`).

/** Día de la semana corto en español, índice de `getUTCDay`. */
const DIAS_CORTOS_ES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** Partes de un instante en HORA CANCÚN: se resta el offset fijo y se leen las partes UTC. */
function partesCancun(d: Date) {
  const w = new Date(d.getTime() - CANCUN_OFFSET_MIN * 60_000);
  return {
    dd: dosDigitos(w.getUTCDate()),
    mm: dosDigitos(w.getUTCMonth() + 1),
    aaaa: String(w.getUTCFullYear()),
    diaSemana: w.getUTCDay(),
    hh: dosDigitos(w.getUTCHours()),
    mi: dosDigitos(w.getUTCMinutes()),
  };
}

/** «06/11/2026»: el día calendario en Cancún de un instante. */
function diaCancun(d: Date): string {
  const p = partesCancun(d);
  return `${p.dd}/${p.mm}/${p.aaaa}`;
}

/** Hora de 12 h en es-MX («10:40 a.m.»), hora Cancún; `dosDigitos` ⇒ «03:00 p.m.». */
function hora12(d: Date, dosDig = false): string {
  return new Intl.DateTimeFormat("es-MX", {
    hour: dosDig ? "2-digit" : "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: CANCUN_TZ,
  }).format(d);
}

/** timestamptz → «06/11/2026, 10:40 a.m.» (hora Cancún). */
export function fmtDateTime(iso?: string | null): string {
  const d = valid(iso);
  if (!d) return "—";
  return `${diaCancun(d)}, ${hora12(d)}`;
}

/** Fecha + hora para celdas de tabla: «12/06/2026, 02:30 p.m.» (hora Cancún). */
export function fmtDateTimeShort(iso?: string | null): string {
  const d = valid(iso);
  if (!d) return "—";
  return `${diaCancun(d)}, ${hora12(d, true)}`;
}

/** timestamptz → «06/11/2026» (el día calendario en Cancún). */
export function fmtDate(iso?: string | null): string {
  const d = valid(iso);
  if (!d) return "—";
  return diaCancun(d);
}

/**
 * timestamptz → «jue 03/09/2026, 09:45 a.m.» (hora Cancún). Para citas/eventos:
 * el día de la semana ayuda a ubicar la cita de un vistazo.
 */
export function fmtWeekdayDateTime(iso?: string | null): string {
  const d = valid(iso);
  if (!d) return "—";
  const p = partesCancun(d);
  return `${DIAS_CORTOS_ES[p.diaSemana]} ${p.dd}/${p.mm}/${p.aaaa}, ${hora12(d, true)}`;
}

/** timestamptz → «05/09/2026 14:32» (hora Cancún, 24 h): celdas compactas. */
export function fmtDateTime24(iso?: string | null): string {
  const d = valid(iso);
  if (!d) return "—";
  const p = partesCancun(d);
  return `${p.dd}/${p.mm}/${p.aaaa} ${p.hh}:${p.mi}`;
}

/**
 * Columna `date` (YYYY-MM-DD) → «jue 03/09/2026» (día de la semana +
 * DD/MM/AAAA) SIN desplazar el día. Vacío ⇒ «—»; ilegible ⇒ el texto tal cual.
 */
export function fmtWeekdayDateOnly(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.slice(0, 10));
  if (!m) return dateStr;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${DIAS_CORTOS_ES[d.getUTCDay()]} ${m[3]}/${m[2]}/${m[1]}`;
}

/** timestamptz → "10:00" (hora Cancún). */
export function fmtTime(iso?: string | null): string {
  const d = valid(iso);
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CANCUN_TZ,
  }).format(d);
}

/**
 * Columna `date` (YYYY-MM-DD, sin hora) → «06/11/2026» SIN desplazar el día.
 * (Para vencimientos, multas, mantenimientos, gastos por día, etc.) Vacío ⇒
 * «—»; ilegible ⇒ el texto tal cual (nunca «Invalid Date»).
 */
export function fmtDateOnly(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.slice(0, 10));
  if (!m) return dateStr;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Input `datetime-local`: "YYYY-MM-DDTHH:mm" (que el usuario captura en HORA
 * DE CANCÚN) → ISO UTC para enviar al API.
 */
export function cancunInputToIso(local: string): string {
  if (!local) return "";
  // Interpreta la pared como si fuera UTC y le suma el offset de Cancún.
  const asIfUtc = new Date(`${local.slice(0, 16)}:00Z`);
  if (Number.isNaN(asIfUtc.getTime())) return "";
  return new Date(asIfUtc.getTime() + CANCUN_OFFSET_MIN * 60_000).toISOString();
}

/**
 * ISO UTC → "YYYY-MM-DDTHH:mm" en HORA DE CANCÚN, para precargar un input
 * `datetime-local`.
 */
export function isoToCancunInput(iso?: string | null): string {
  const d = valid(iso);
  if (!d) return "";
  const wall = new Date(d.getTime() - CANCUN_OFFSET_MIN * 60_000);
  return wall.toISOString().slice(0, 16);
}

/** Hoy en Cancún como YYYY-MM-DD (para rangos de periodo). */
export function todayCancun(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CANCUN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Primer día del mes actual en Cancún como YYYY-MM-DD. */
export function startOfMonthCancun(): string {
  return `${todayCancun().slice(0, 7)}-01`;
}

/**
 * Días de calendario que faltan para una fecha date-only (YYYY-MM-DD),
 * contados desde HOY en Cancún. 0 = vence hoy; negativo = ya venció.
 * Nunca usar `new Date(iso) - Date.now()` con date-only: parsea medianoche
 * UTC y en Cancún (UTC−5) corre el vencimiento un día (pólizas "vencidas"
 * desde las 19:00 del día anterior).
 */
export function daysUntilCancun(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const target = dateStr.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return null;
  // Ambas como UTC-medianoche: la diferencia de días de calendario es exacta.
  const a = Date.parse(`${target}T00:00:00Z`);
  const b = Date.parse(`${todayCancun()}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

/**
 * Ventana de edición de cotizaciones (regla del cliente, jul 2026): una
 * cotización —aún CONFIRMADA— solo se ajusta mientras su vuelo sea del MES
 * CORRIENTE o el ANTERIOR (hora Cancún). Más atrás pertenece a cierres
 * pasados. Sin fecha de vuelo = editable (aún no se programa).
 */
export function cotizacionEditablePorFecha(
  fechaVuelo: string | null | undefined,
): boolean {
  if (!fechaVuelo) return true;
  const ahoraCancun = new Date(Date.now() - CANCUN_OFFSET_MIN * 60_000);
  // 00:00 Cancún del día 1 del mes ANTERIOR, expresado en ms UTC.
  const inicioMesAnterior =
    Date.UTC(ahoraCancun.getUTCFullYear(), ahoraCancun.getUTCMonth() - 1, 1) +
    CANCUN_OFFSET_MIN * 60_000;
  return new Date(fechaVuelo).getTime() >= inicioMesAnterior;
}

/**
 * Meses en español (minúsculas) para fechas LARGAS «7 de octubre de 2026».
 * Fuente única para los textos nuevos (5-oct-2026, revisión del modal de
 * fecha de la cotización): no se arma otra tabla de meses en cada módulo.
 */
export const MESES_LARGOS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/**
 * Día de PARED «YYYY-MM-DD» (ya en hora Cancún) → «7 de octubre de 2026».
 * Sin `Date` ni `Intl`: el día no se corre por zona. Vacío o ilegible ⇒ «—».
 * Para un instante ISO, primero sacar su día Cancún (`isoToCancunInput`).
 */
export function fechaLargaDia(ymd?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((ymd ?? "").trim());
  if (!m) return "—";
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return "—";
  return `${dia} de ${MESES_LARGOS_ES[mes - 1]} de ${m[1]}`;
}
