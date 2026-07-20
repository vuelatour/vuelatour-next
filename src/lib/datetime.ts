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

/** timestamptz → "08 jun 2026, 10:00" (hora Cancún). */
export function fmtDateTime(iso?: string | null): string {
  const d = valid(iso);
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: CANCUN_TZ,
  }).format(d);
}

/** timestamptz → "08 jun 2026" (el día calendario en Cancún). */
/** Fecha + hora cortas en TZ Cancun ("12 jun, 14:30"). Para celdas de tabla. */
export function fmtDateTimeShort(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Cancun",
  });
}

export function fmtDate(iso?: string | null): string {
  const d = valid(iso);
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: CANCUN_TZ,
  }).format(d);
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
 * Columna `date` (YYYY-MM-DD, sin hora) → "08 jun 2026" SIN desplazar el día.
 * (Para vencimientos, multas, mantenimientos, gastos por día, etc.)
 */
export function fmtDateOnly(dateStr?: string | null): string {
  if (!dateStr) return "—";
  // Toma solo la parte de fecha y la fija a mediodía UTC para evitar cualquier
  // corrimiento de día por zona horaria.
  const ymd = dateStr.slice(0, 10);
  const d = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
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
