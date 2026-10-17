/**
 * RECÁLCULO LOCAL DE UNA HOJA DEL LIBRO EN PANTALLA (16-oct-2026, AFAC por
 * vuelo) — PURO: sin React, sin red.
 *
 * Pedido del cliente (captura de «otros movimientos» con el costo real AFAC
 * del #364 capturado en $3,000.00 y el remanente todavía en $3,619.98):
 * «pero falta que el remanente se ajuste cuando se agregue el costo real del
 * egreso, no?». El costo real se guarda al instante, pero el libro nuevo lo
 * arma el servidor (15 s de espera + las decenas de segundos que tarda el
 * general) y mientras tanto la fila se leía contradictoria.
 *
 * Aquí NO hay regla de negocio: se recalculan las FÓRMULAS VISIBLES de la
 * propia hoja que dependen de la celda tecleada, exactamente como lo haría
 * Excel al escribir en una celda — el remanente de la fila
 * (`=ROUND(G21-D21,2)`), los TOTALES (`=ROUND(SUM(D4:D60),2)`) y el bloque
 * «AFAC DEL PERIODO». pyservices solo deja una fórmula viva cuando reproduce
 * al centavo el número del API (`xlsx_formulas`), así que evaluarla con el
 * dato nuevo da lo que el servidor va a mandar. El libro nuevo REEMPLAZA todo
 * esto al llegar (los cambios locales se descartan en `depurarCambiosAfac`).
 *
 * Alcance, a propósito chico (lo demás se queda como lo mandó el servidor):
 *  - solo referencias de la MISMA hoja (A1, $A$1 y rangos dentro de SUM);
 *  - números, + − × ÷, signo, paréntesis, `ROUND(x; n)` y `SUM(...)`;
 *  - solo celdas con formato de dinero (`#,##0.00` / `"$"#,##0.00`), las
 *    únicas cuyo texto se sabe escribir igual que el libro.
 * Una fórmula que no se puede evaluar (otra hoja, otra función, un texto)
 * NO se toca y todo lo que depende de ella tampoco: nunca se mezcla un
 * número recalculado con uno viejo.
 */
import { fmtDecimal } from "@/lib/format";
import type { LibroExcelCelda, LibroExcelEstilo } from "@/types/libro-excel";

/** Llave «r:c» de una celda (1-based, como la manda pyservices). */
export function llaveCelda(r: number, c: number): string {
  return `${r}:${c}`;
}

/** Colores del formato condicional «negativos en rojo» de los libros
 *  (preset de Excel «Relleno rojo claro con texto rojo oscuro»,
 *  `_rojo_si_negativo` de pyservices). */
export const FONDO_NEGATIVO = "FFC7CE";
export const TEXTO_NEGATIVO = "9C0006";

/** Tooltip de una celda recalculada en pantalla. */
export const TITULO_CELDA_RECALCULADA =
  "Recalculado en pantalla con lo que capturaste; el libro del servidor lo confirma en unos segundos.";

/** Tope de celdas que expande un rango (defensa: un rango enorme no se evalúa). */
const TOPE_CELDAS_RANGO = 20_000;

// =============================================================================
// Fórmulas: tokens, árbol y evaluación
// =============================================================================

type Nodo =
  | { tipo: "num"; v: number }
  | { tipo: "ref"; r: number; c: number }
  | { tipo: "rango"; r1: number; c1: number; r2: number; c2: number }
  | { tipo: "fn"; nombre: "ROUND" | "SUM"; args: Nodo[] }
  | { tipo: "bin"; op: "+" | "-" | "*" | "/"; a: Nodo; b: Nodo }
  | { tipo: "neg"; a: Nodo };

class NoSoportada extends Error {}

/** Letras de columna → número (A = 1, Z = 26, AA = 27). */
function numeroColumna(letras: string): number {
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

type Token =
  | { t: "num"; v: number }
  | { t: "ref"; r: number; c: number }
  | { t: "fn"; nombre: string }
  | { t: "op"; v: string };

const RE_TOKEN =
  /\s*(?:(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\$?([A-Z]{1,3})\$?(\d+)(?![\w(])|([A-Z][A-Z0-9.]*)\s*(?=\()|([-+*/(),:;]))/y;

function tokens(formula: string): Token[] {
  const texto = formula.startsWith("=") ? formula.slice(1) : formula;
  const out: Token[] = [];
  RE_TOKEN.lastIndex = 0;
  let i = 0;
  while (i < texto.length) {
    if (/\s/.test(texto[i])) {
      i += 1;
      continue;
    }
    RE_TOKEN.lastIndex = i;
    const m = RE_TOKEN.exec(texto);
    if (!m || m.index !== i) throw new NoSoportada(`token en ${i}`);
    if (m[1] !== undefined) out.push({ t: "num", v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ t: "ref", r: Number(m[3]), c: numeroColumna(m[2]) });
    else if (m[4] !== undefined) out.push({ t: "fn", nombre: m[4].toUpperCase() });
    else out.push({ t: "op", v: m[5] === ";" ? "," : m[5] });
    i = RE_TOKEN.lastIndex;
  }
  return out;
}

/** El árbol de la fórmula, o NoSoportada (otra hoja, otra función, texto…). */
function analizar(formula: string): Nodo {
  const tk = tokens(formula);
  let p = 0;
  const ver = () => tk[p];
  const esOp = (v: string) => {
    const x = tk[p];
    return x !== undefined && x.t === "op" && x.v === v;
  };
  const exigir = (v: string) => {
    if (!esOp(v)) throw new NoSoportada(`se esperaba ${v}`);
    p += 1;
  };

  function expr(): Nodo {
    let a = termino();
    while (esOp("+") || esOp("-")) {
      const op = (tk[p] as { v: "+" | "-" }).v;
      p += 1;
      a = { tipo: "bin", op, a, b: termino() };
    }
    return a;
  }
  function termino(): Nodo {
    let a = factor();
    while (esOp("*") || esOp("/")) {
      const op = (tk[p] as { v: "*" | "/" }).v;
      p += 1;
      a = { tipo: "bin", op, a, b: factor() };
    }
    return a;
  }
  function factor(): Nodo {
    if (esOp("-")) {
      p += 1;
      return { tipo: "neg", a: factor() };
    }
    if (esOp("+")) {
      p += 1;
      return factor();
    }
    return primario();
  }
  function primario(): Nodo {
    const x = ver();
    if (!x) throw new NoSoportada("fin inesperado");
    if (x.t === "num") {
      p += 1;
      return { tipo: "num", v: x.v };
    }
    if (x.t === "ref") {
      p += 1;
      if (esOp(":")) {
        p += 1;
        const y = ver();
        if (!y || y.t !== "ref") throw new NoSoportada("rango");
        p += 1;
        return {
          tipo: "rango",
          r1: Math.min(x.r, y.r),
          c1: Math.min(x.c, y.c),
          r2: Math.max(x.r, y.r),
          c2: Math.max(x.c, y.c),
        };
      }
      return { tipo: "ref", r: x.r, c: x.c };
    }
    if (x.t === "fn") {
      if (x.nombre !== "ROUND" && x.nombre !== "SUM") throw new NoSoportada(x.nombre);
      p += 1;
      exigir("(");
      const args: Nodo[] = [];
      if (!esOp(")")) {
        args.push(expr());
        while (esOp(",")) {
          p += 1;
          args.push(expr());
        }
      }
      exigir(")");
      if (x.nombre === "ROUND" && args.length !== 2) throw new NoSoportada("ROUND");
      return { tipo: "fn", nombre: x.nombre, args };
    }
    if (esOp("(")) {
      p += 1;
      const a = expr();
      exigir(")");
      return a;
    }
    throw new NoSoportada("primario");
  }

  const raiz = expr();
  if (p !== tk.length) throw new NoSoportada("sobran tokens");
  return raiz;
}

/** Las celdas de la MISMA hoja que cita una fórmula (los rangos, expandidos).
 *  Se leen del texto aunque la fórmula no se pueda evaluar: así se sabe si
 *  depende de lo tecleado. Las referencias a otra hoja («'x'!B3», «x!B3») no
 *  cuentan. Un rango más grande que el tope ⇒ null (no se sabe). */
export function referenciasDeFormula(formula: string): string[] | null {
  const sinOtrasHojas = formula.replace(
    /(?:'[^']*'|[A-Za-z0-9_.]+)!\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?/g,
    " ",
  );
  const re = /(?<![A-Za-z0-9_$!.])\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?(?![\w(])/g;
  const out: string[] = [];
  let total = 0;
  for (const m of sinOtrasHojas.matchAll(re)) {
    const c1 = numeroColumna(m[1]);
    const r1 = Number(m[2]);
    if (m[3] === undefined) {
      out.push(llaveCelda(r1, c1));
      continue;
    }
    const c2 = numeroColumna(m[3]);
    const r2 = Number(m[4]);
    const [ra, rb] = r1 <= r2 ? [r1, r2] : [r2, r1];
    const [ca, cb] = c1 <= c2 ? [c1, c2] : [c2, c1];
    total += (rb - ra + 1) * (cb - ca + 1);
    if (total > TOPE_CELDAS_RANGO) return null;
    for (let r = ra; r <= rb; r += 1) for (let c = ca; c <= cb; c += 1) out.push(llaveCelda(r, c));
  }
  return out;
}

/** ROUND de Excel: medio hacia afuera, sobre el número a 15 cifras (como lo
 *  ve Excel), sin «-0». */
export function redondearExcel(x: number, decimales: number): number {
  const d = Math.trunc(decimales);
  const f = 10 ** d;
  const y = Number((Math.abs(x) * f).toPrecision(15));
  const r = (Math.sign(x) * Math.round(y)) / f;
  return r === 0 ? 0 : r;
}

type Valor = number | string | boolean | null;

function evaluar(n: Nodo, valor: (k: string) => Valor): number {
  switch (n.tipo) {
    case "num":
      return n.v;
    case "ref": {
      const v = valor(llaveCelda(n.r, n.c));
      if (v === null || v === "") return 0;
      if (typeof v === "number") return v;
      throw new NoSoportada("texto en una operación");
    }
    case "rango":
      throw new NoSoportada("rango fuera de SUM");
    case "neg":
      return -evaluar(n.a, valor);
    case "bin": {
      const a = evaluar(n.a, valor);
      const b = evaluar(n.b, valor);
      if (n.op === "+") return a + b;
      if (n.op === "-") return a - b;
      if (n.op === "*") return a * b;
      if (b === 0) throw new NoSoportada("división entre cero");
      return a / b;
    }
    case "fn": {
      if (n.nombre === "ROUND") return redondearExcel(evaluar(n.args[0], valor), evaluar(n.args[1], valor));
      let s = 0;
      for (const a of n.args) {
        if (a.tipo === "rango") {
          for (let r = a.r1; r <= a.r2; r += 1)
            for (let c = a.c1; c <= a.c2; c += 1) {
              const v = valor(llaveCelda(r, c));
              if (typeof v === "number") s += v;
            }
        } else if (a.tipo === "ref") {
          const v = valor(llaveCelda(a.r, a.c));
          if (typeof v === "number") s += v;
        } else s += evaluar(a, valor);
      }
      return s;
    }
  }
}

// =============================================================================
// Texto con el formato de la celda
// =============================================================================

/** El texto de un número con el formato de DINERO de la celda, igual que el
 *  `formatear` de pyservices («-619.98», «-$619.98», «$1,700.00»). Otro
 *  formato (o uno con sección negativa propia) ⇒ null: no se sabe escribir. */
export function textoDineroComoLibro(valor: number, nf: string | null | undefined): string | null {
  const secciones = (nf ?? "").split(";");
  const primera = secciones[0] ?? "";
  if (secciones.length > 1 && valor < 0 && secciones[1]) return null;
  const conPesos = /^"\$"#,##0\.00$|^\$#,##0\.00$/.test(primera);
  if (!conPesos && primera !== "#,##0.00") return null;
  const base = fmtDecimal(Math.abs(valor), 2);
  return `${valor < 0 ? "-" : ""}${conPesos ? "$" : ""}${base}`;
}

// =============================================================================
// Recálculo de las dependientes
// =============================================================================

interface Estado {
  /** El valor cambió (o es una celda tecleada). */
  sucio: boolean;
  /** No se pudo recalcular algo de lo que depende: se queda como vino. */
  obsoleto: boolean;
  valor: Valor;
  /** El texto nuevo (solo en una fórmula recalculada). */
  texto?: string;
}

/**
 * Las celdas de la hoja con las fórmulas que dependen (directa o
 * indirectamente) de `cambiadas` RECALCULADAS: valor, texto con el formato de
 * la celda y la marca `recalculada` (solo del panel: el estilo «negativo» y el
 * tooltip). `celdas` ya trae el valor nuevo de las tecleadas. Lo que no
 * depende de ellas es el MISMO objeto; sin nada que recalcular devuelve el
 * MISMO arreglo.
 */
export function recalcularDependientes(
  celdas: LibroExcelCelda[],
  cambiadas: ReadonlySet<string>,
  estilos: readonly LibroExcelEstilo[],
): LibroExcelCelda[] {
  if (cambiadas.size === 0) return celdas;
  const porLlave = new Map<string, number>();
  celdas.forEach((x, i) => porLlave.set(llaveCelda(x.r, x.c), i));

  const estados = new Map<string, Estado>();
  const visitando = new Set<string>();
  const arboles = new Map<string, Nodo | null>();

  const valorCrudo = (k: string): Valor => {
    const i = porLlave.get(k);
    return i === undefined ? null : celdas[i].v;
  };

  const arbol = (k: string, f: string): Nodo | null => {
    if (!arboles.has(k)) {
      try {
        arboles.set(k, analizar(f));
      } catch {
        arboles.set(k, null);
      }
    }
    return arboles.get(k) ?? null;
  };

  const estado = (k: string): Estado => {
    const hecho = estados.get(k);
    if (hecho) return hecho;
    const i = porLlave.get(k);
    const celda = i === undefined ? null : celdas[i];
    if (cambiadas.has(k)) {
      const e = { sucio: true, obsoleto: false, valor: celda?.v ?? null };
      estados.set(k, e);
      return e;
    }
    if (!celda?.f) {
      const e = { sucio: false, obsoleto: false, valor: celda?.v ?? null };
      estados.set(k, e);
      return e;
    }
    if (visitando.has(k)) return { sucio: false, obsoleto: true, valor: celda.v };
    visitando.add(k);
    const refs = referenciasDeFormula(celda.f);
    let sucia = false;
    let obsoleta = refs === null;
    for (const r of refs ?? []) {
      const d = estado(r);
      if (d.obsoleto) obsoleta = true;
      if (d.sucio) sucia = true;
    }
    visitando.delete(k);
    let e: Estado;
    if (obsoleta && (sucia || refs === null)) e = { sucio: false, obsoleto: true, valor: celda.v };
    else if (!sucia) e = { sucio: false, obsoleto: obsoleta, valor: celda.v };
    else {
      const nodo = arbol(k, celda.f);
      let nuevo: number | null = null;
      if (nodo) {
        try {
          const v = evaluar(nodo, (x) => estado(x).valor ?? valorCrudo(x));
          nuevo = Number.isFinite(v) ? v : null;
        } catch {
          nuevo = null;
        }
      }
      // Sin un texto que se sepa escribir igual que el libro, la celda se
      // queda como vino y lo que depende de ella también (el libro nuevo la
      // trae en unos segundos): nunca un número nuevo encima de uno viejo.
      const nf = celda.s != null ? estilos[celda.s]?.nf : undefined;
      const texto = nuevo === null ? null : textoDineroComoLibro(nuevo, nf);
      e =
        nuevo === null || texto === null
          ? { sucio: false, obsoleto: true, valor: celda.v }
          : { sucio: true, obsoleto: false, valor: nuevo, texto };
    }
    estados.set(k, e);
    return e;
  };

  let toco = false;
  const out = celdas.map((celda) => {
    if (!celda.f) return celda;
    const k = llaveCelda(celda.r, celda.c);
    if (cambiadas.has(k)) return celda;
    const e = estado(k);
    if (!e.sucio || typeof e.valor !== "number" || e.texto === undefined) return celda;
    toco = true;
    return { ...celda, v: e.valor, t: e.texto, recalculada: { negativo: e.valor < 0 } };
  });
  return toco ? out : celdas;
}
