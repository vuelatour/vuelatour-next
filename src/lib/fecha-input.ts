/**
 * Fechas que se CAPTURAN en DD/MM/AAAA (6-nov-2026). Pedido del dueño:
 * «estandarizar todas las fechas al formato DD/MM/AAAA, en todos lados…
 * a veces salen como en la captura (11/06/2026 por 6 de noviembre), a lo
 * mejor por el idioma de la máquina, pero que por defecto todas salgan así».
 *
 * El `<input type="date">` nativo pinta la fecha con el idioma del NAVEGADOR
 * (en la oficina hay Chrome en inglés: MM/DD/AAAA) y ni `lang` ni CSS lo
 * cambian. Por eso `components/ui/input.tsx` pinta, para `type="date"` y
 * `type="datetime-local"`, un campo de TEXTO con máscara DD/MM/AAAA (o
 * DD/MM/AAAA HH:MM) y deja el nativo escondido detrás del icono del
 * calendario, solo como selector. El VALOR que viaja sigue siendo el ISO de
 * siempre («YYYY-MM-DD» / «YYYY-MM-DDTHH:mm»): nada cambia para formularios,
 * server actions ni el API. Aquí viven las conversiones, PURAS (prueba:
 * `__tests__/fecha-input.test.ts`).
 */

export type TipoFechaInput = "date" | "datetime-local";

export const PLACEHOLDER_FECHA = "DD/MM/AAAA";
export const PLACEHOLDER_FECHA_HORA = "DD/MM/AAAA HH:MM";
/** Largo del texto completo: «06/11/2026» · «06/11/2026 14:30». */
export const LARGO_FECHA = 10;
export const LARGO_FECHA_HORA = 16;

export function placeholderFecha(tipo: TipoFechaInput): string {
  return tipo === "datetime-local" ? PLACEHOLDER_FECHA_HORA : PLACEHOLDER_FECHA;
}

export function largoFecha(tipo: TipoFechaInput): number {
  return tipo === "datetime-local" ? LARGO_FECHA_HORA : LARGO_FECHA;
}

/** ¿Día real del calendario? (año 1900–2100; 31/02 no existe). */
export function fechaValida(anio: number, mes: number, dia: number): boolean {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) return false;
  if (anio < 1900 || anio > 2100 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * Lo que va tecleando el usuario ⇒ texto con máscara. Solo cuentan los
 * dígitos (se puede pegar «6/11/2026» o «06112026»); las diagonales, el
 * espacio y los dos puntos se ponen solos. Nunca más de 8 (o 12) dígitos.
 */
export function mascaraFecha(texto: string, tipo: TipoFechaInput = "date"): string {
  const maximo = tipo === "datetime-local" ? 12 : 8;
  const d = (texto ?? "").replace(/\D/g, "").slice(0, maximo);
  let out = "";
  for (let i = 0; i < d.length; i++) {
    if (i === 2 || i === 4) out += "/";
    if (i === 8) out += " ";
    if (i === 10) out += ":";
    out += d[i];
  }
  return out;
}

/** Texto COMPLETO y válido ⇒ ISO del input («YYYY-MM-DD» / «YYYY-MM-DDTHH:mm»); si no, null. */
export function isoDeTexto(texto: string, tipo: TipoFechaInput = "date"): string | null {
  const t = (texto ?? "").trim();
  if (tipo === "datetime-local") {
    const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(t);
    if (!m) return null;
    const [, dd, mm, aaaa, hh, mi] = m;
    if (!fechaValida(Number(aaaa), Number(mm), Number(dd))) return null;
    if (Number(hh) > 23 || Number(mi) > 59) return null;
    return `${aaaa}-${mm}-${dd}T${hh}:${mi}`;
  }
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const [, dd, mm, aaaa] = m;
  if (!fechaValida(Number(aaaa), Number(mm), Number(dd))) return null;
  return `${aaaa}-${mm}-${dd}`;
}

/**
 * ISO del input ⇒ texto DD/MM/AAAA (con « HH:MM» en datetime-local). Vacío o
 * ilegible ⇒ «» (jamás se enseña basura). Un datetime-local sin hora enseña
 * solo el día.
 */
export function textoDeIso(iso: string | null | undefined, tipo: TipoFechaInput = "date"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec((iso ?? "").trim());
  if (!m) return "";
  const [, aaaa, mm, dd, hh, mi] = m;
  const dia = `${dd}/${mm}/${aaaa}`;
  if (tipo === "datetime-local" && hh != null && mi != null) return `${dia} ${hh}:${mi}`;
  return dia;
}
