/**
 * BÚSQUEDA «tipo Algolia, sin contratar Algolia» (12-oct-2026). Pedido del
 * cliente: «en los buscadores podemos ampliar capacidades de búsqueda».
 * FUENTE ÚNICA de cómo se busca en el panel (tablas, selectores con buscador
 * y listas de candidatos): sin acentos ni mayúsculas, por PALABRAS en
 * cualquier orden (todas deben aparecer), con tolerancia a UNA letra de
 * más/menos/cambiada o dos letras invertidas en palabras de 5+ letras, y
 * entendiendo números como los escribe la oficina («2,801.40», «$2801.40»).
 * Puro: sin React, sin red.
 */

/** Largo mínimo de una palabra buscada para admitir un error de dedo. */
export const LARGO_MIN_TOLERANCIA = 5;

/** Sin acentos, en minúsculas, sin signos y con los números «limpios». */
export function normalizarTexto(s: string | null | undefined): string {
  if (!s) return "";
  return (
    String(s)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      // Miles con coma y el signo de pesos: «$2,801.40» ⇒ «2801.40».
      .replace(/(\d),(?=\d{3}(\D|$))/g, "$1")
      .replace(/\$/g, " ")
      // Signos que no distinguen nada: solo separan palabras. La coma se
      // conserva SOLO entre dígitos («1,5 L» es un decimal europeo).
      .replace(/,(?!\d)|(?<!\d),/g, " ")
      .replace(/[·|/\\()[\]{}"“”'’;:!¡?¿]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Palabras distintas de la consulta (ya normalizadas, sin vacíos). */
export function tokensDe(consulta: string | null | undefined): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const t of normalizarTexto(consulta).split(" ")) {
    if (!t || vistos.has(t)) continue;
    vistos.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Distancia de edición (Damerau–Levenshtein con transposición adyacente),
 * con tope: devuelve `max + 1` en cuanto se rebasa.
 */
export function distanciaEdicion(a: string, b: string, max = 1): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i += 1) {
    const cur: number[] = [i];
    let mejor = i;
    for (let j = 1; j <= lb; j += 1) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur.push(v);
      if (v < mejor) mejor = v;
    }
    if (mejor > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb];
}

/** Una palabra del texto «se parece» al token (un error de dedo). */
function pareceA(palabra: string, token: string): boolean {
  if (token.length < LARGO_MIN_TOLERANCIA || palabra.length < LARGO_MIN_TOLERANCIA - 1) return false;
  return distanciaEdicion(palabra, token, 1) <= 1;
}

/**
 * Puntos de UN token contra el texto normalizado: 0 = no coincide. Palabra
 * exacta 3 · inicio de palabra 2 · dentro de una palabra 1 · parecida 0.5.
 */
export function puntosDeToken(textoNorm: string, token: string): number {
  if (!token) return 0;
  const palabras = textoNorm.split(" ");
  let mejor = 0;
  for (const p of palabras) {
    if (p === token) return 3;
    if (p.startsWith(token)) mejor = Math.max(mejor, 2);
    else if (p.includes(token)) mejor = Math.max(mejor, 1);
    else if (mejor < 0.5 && pareceA(p, token)) mejor = 0.5;
  }
  // Un token con espacios internos no existe (se tokeniza), pero una
  // secuencia como «2801.40» puede estar pegada a otra cosa: substring.
  if (mejor === 0 && textoNorm.includes(token)) mejor = 1;
  return mejor;
}

/**
 * Puntos del texto contra la consulta completa: TODAS las palabras deben
 * coincidir (Y); 0 si alguna falta o si la consulta está vacía.
 */
export function puntuacionBusqueda(texto: string | null | undefined, consulta: string | null | undefined): number {
  const tokens = tokensDe(consulta);
  if (tokens.length === 0) return 0;
  const norm = normalizarTexto(texto);
  if (!norm) return 0;
  let total = 0;
  for (const t of tokens) {
    const p = puntosDeToken(norm, t);
    if (p === 0) return 0;
    total += p;
  }
  return total;
}

/** ¿El texto coincide con la consulta? Consulta vacía ⇒ todo coincide. */
export function coincideBusqueda(texto: string | null | undefined, consulta: string | null | undefined): boolean {
  if (tokensDe(consulta).length === 0) return true;
  return puntuacionBusqueda(texto, consulta) > 0;
}

/**
 * Filtra y ordena por relevancia (más puntos primero; empate = el orden
 * original). Con consulta vacía devuelve la lista tal cual.
 */
export function filtrarPorBusqueda<T>(
  items: readonly T[],
  consulta: string | null | undefined,
  textoDe: (item: T) => string | null | undefined,
): T[] {
  if (tokensDe(consulta).length === 0) return [...items];
  return items
    .map((item, i) => ({ item, i, p: puntuacionBusqueda(textoDe(item), consulta) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .map((x) => x.item);
}
