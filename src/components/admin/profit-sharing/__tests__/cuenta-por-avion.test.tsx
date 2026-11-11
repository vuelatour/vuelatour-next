/**
 * PAGOS A SOCIOS: EL SALDO SE LLEVA POR AVIÓN (10-nov-2026, API 0.0.134) —
 * lo que se PINTA (marcado con `react-dom/server`, como el resto del panel).
 *
 * Pedido del cliente con la cuenta de Mauricio Roque (N4142R 69 % y XB-ANU
 * 70 %): «está mezclado todos los aviones que tenga un socio en su cuenta;
 * debería ser, dentro de la cuenta del socio, un balance para cada avión,
 * porque las entregas son por avión… lo mete todo en la misma licuadora». La
 * tabla «Movimientos» llevaba UN saldo corrido: la pérdida del XB-ANU restaba
 * del saldo contra el que se veía la entrega del N4142R (−$4,066.62 en vez
 * de −$204.02).
 *
 * Se custodia, con LOS NÚMEROS DE LA CAPTURA:
 *  1. el estado de cuenta pinta UNA card por avión y cada una enseña el saldo
 *     de SU avión (cifras y saldo corrido de la tabla); el saldo mezclado no
 *     aparece;
 *  2. «A cuenta general (sin avión)» al final, con su ayuda;
 *  3. una sección sin movimientos en el rango lo dice;
 *  4. la lista «Pagos a socios» y «Socios · por entregar» llevan el desglose
 *     corto por avión bajo el saldo;
 *  5. el diálogo «Registrar entrega» EXIGE el avión solo en cuentas por
 *     avión, dice su saldo y la confirmación del adelanto lo nombra;
 *  6. SIN el aditivo (API previo), con `cuenta_por_avion: false` o con el
 *     aditivo ilegible, todo queda EXACTAMENTE como antes (mismo marcado).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ContextoEntrega, ContextoRegistro } from "@/lib/admin/reparto-pagos";
import {
  ALE,
  ENTREGA_GENERAL,
  ENTREGA_OCT,
  ENTREGA_SEP_ID,
  MAURICIO,
  N4142R,
  XBANU,
  estadoCuentaConGeneral,
  estadoCuentaPorAvion,
  estadoCuentaPorAvionNoviembre,
  estadoCuentaPorAvionSeptiembre,
  resumenAntesDeLaEntrega,
  resumenConGeneral,
  resumenPorAvion,
  sinAditivo,
} from "./cuenta-por-avion.fixtures";

vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => `/admin/profit-sharing/socios/${MAURICIO}`,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/admin/profit-sharing/actions", () => ({
  crearPagoSocioAction: async () => ({ ok: true }),
  editarPagoSocioAction: async () => ({ ok: true }),
  eliminarPagoSocioAction: async () => ({ ok: true }),
  configurarCuentaSocioAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/api/reparto-pagos-browser", () => ({
  adjuntarComprobantePagoSocio: async () => ({ ok: true }),
}));
// El diálogo de Base UI vive en un portal (no existe en react-dom/server):
// se sustituye por un pase en línea, como en `entrega-socio-dialog.test.tsx`.
vi.mock("@/components/ui/dialog", () => {
  const Pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
      open ? <div data-dialogo="abierto">{children}</div> : null,
    DialogContent: Pasa,
    DialogHeader: Pasa,
    DialogFooter: Pasa,
    DialogTitle: Pasa,
    DialogDescription: Pasa,
  };
});

const { CuentaPorAvion } = await import("../cuenta-por-avion");
const { DesgloseSaldosPorAvion } = await import("../saldos-por-avion");
const { KpisCuenta } = await import("../estado-cuenta-partes");
const { SociosCuentaTable } = await import("../socios-cuenta-table");
const { SociosPorEntregarSection } = await import("../socios-por-entregar-section");
const { FormularioEntrega, AvisoAdelanto } = await import("../entrega-socio-dialog");
const {
  confirmacionAdelanto,
  contextoEntrega,
  contextoEntregaDeEstadoCuenta,
  normalizarEstadoCuenta,
  normalizarPago,
  normalizarResumen,
  saldosPorAvion,
} = await import("@/lib/admin/reparto-pagos");

const REGISTRO: ContextoRegistro = { usuarios: [ALE], me: ALE, hoy: "2026-11-10", tcOficial: 18.45 };

// 10-nov-2026 12:00 en Cancún (el día de la captura del cliente).
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-10T17:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

const resumen = (raw: Record<string, unknown>) => {
  const r = normalizarResumen(raw);
  if (!r) throw new Error("el resumen de la fixture no se pudo normalizar");
  return r;
};
const estado = (raw: Record<string, unknown>) => {
  const e = normalizarEstadoCuenta(raw);
  if (!e) throw new Error("el estado de cuenta de la fixture no se pudo normalizar");
  return e;
};

/** Las cards por avión de un estado de cuenta, como las monta la página. */
function cards(raw: Record<string, unknown>, opciones: { filtrado?: boolean; puedeRegistrar?: boolean } = {}) {
  const e = estado(raw);
  const secciones = saldosPorAvion(e);
  if (!secciones) throw new Error("la fixture no es una cuenta por avión");
  return renderToStaticMarkup(
    <CuentaPorAvion
      secciones={secciones}
      desde={e.desde}
      hasta={e.hasta}
      filtrado={opciones.filtrado ?? false}
      mesEnCurso="2026-11"
      contexto={contextoEntregaDeEstadoCuenta(e, { mesEnCurso: "2026-11" })}
      registro={REGISTRO}
      puedeRegistrar={opciones.puedeRegistrar ?? true}
      filtro={<div data-filtro-de-prueba />}
    />,
  );
}

/** El trozo de HTML de UNA card (`data-seccion-cuenta="<clave>"`). */
function card(html: string, clave: string): string {
  const trozos = html.split('data-seccion-cuenta="').slice(1);
  const trozo = trozos.find((t) => t.startsWith(`${clave}"`));
  if (!trozo) throw new Error(`sin card ${clave}`);
  return trozo;
}

/** La columna «Saldo» (última celda) de los renglones principales de una tabla. */
const saldosCorridos = (html: string) =>
  [...html.matchAll(/<tr[^>]*data-movimiento="[A-Z_]+"[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => {
    const celdas = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1].replace(/<[^>]+>/g, ""));
    return celdas[celdas.length - 1];
  });

const cifra = (html: string, nombre: string) =>
  html.match(new RegExp(`<span[^>]*data-cifra="${nombre}"[^>]*>([^<]*)</span>`))?.[1] ?? null;
const etiquetas = (html: string) =>
  [...html.matchAll(/<dt[^>]*>([^<]*)<\/dt>/g)].map((m) => m[1]);
const botones = (html: string) => html.match(/<button[^>]*>/g) ?? [];
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("estado de cuenta: UNA card por avión, cada una con el saldo de SU avión (el caso real)", () => {
  let html = "";
  beforeAll(() => {
    html = cards(estadoCuentaPorAvion());
  });

  it("una card por sección, en el orden del API, con su título «matrícula · %»", () => {
    const claves = [...html.matchAll(/data-seccion-cuenta="([^"]+)"/g)].map((m) => m[1]);
    expect(claves).toEqual([N4142R, XBANU]);
    expect(card(html, N4142R)).toContain(">N4142R · 69 %</div>");
    expect(card(html, XBANU)).toContain(">XB-ANU · 70 %</div>");
    // Una tabla de movimientos por avión (la MISMA `MovimientosCuenta`).
    expect((html.match(/data-tabla-movimientos/g) ?? []).length).toBe(2);
  });

  it("N4142R: Generó $360,678.28 · Entregado $341,879.57 · Por entregar $18,798.71 (en ámbar) y el mes en curso dicho", () => {
    const n = card(html, N4142R);
    expect(etiquetas(n)).toEqual(["Generó", "Entregado", "Por entregar"]);
    expect(cifra(n, "genero")).toBe("$360,678.28 MXN");
    expect(cifra(n, "entregado")).toBe("$341,879.57 MXN");
    expect(cifra(n, "saldo")).toBe("$18,798.71 MXN");
    expect(n).toMatch(/<span class="text-amber-700 dark:text-amber-400" data-cifra="saldo" data-saldo-seccion="POR_ENTREGAR">/);
    // Como en los totales: bajo «Generó» y bajo el saldo.
    expect((n.match(/incluye \$19,002\.73 MXN de Noviembre 2026 \(en curso: cambia día con día\)/g) ?? []).length).toBe(2);
    expect(n).not.toContain("data-ayuda-saldo");
  });

  it("N4142R: el saldo corrido de SU tabla es 232,547.75 → −5,717.78 → 103,410.02 → −204.02 → 18,798.71", () => {
    expect(saldosCorridos(card(html, N4142R))).toEqual([
      "$232,547.75 MXN",
      "-$5,717.78 MXN",
      "$103,410.02 MXN",
      // La entrega del 10-nov contra el saldo del N4142R: −$204.02, no −$4,066.62.
      "-$204.02 MXN",
      "$18,798.71 MXN",
    ]);
  });

  it("XB-ANU: Generó −$3,862.60 (en rojo) · Entregado $0.00 · «Pérdida acumulada» $3,862.60 con su ayuda — no «Adelantado»", () => {
    const anu = card(html, XBANU);
    expect(etiquetas(anu)).toEqual(["Generó", "Entregado", "Pérdida acumulada"]);
    expect(cifra(anu, "genero")).toBe("-$3,862.60 MXN");
    expect(anu).toMatch(/<span class="text-destructive" data-cifra="genero">/);
    expect(cifra(anu, "entregado")).toBe("$0.00 MXN");
    // Sin signo: lo dice la etiqueta.
    expect(cifra(anu, "saldo")).toBe("$3,862.60 MXN");
    expect(anu).toContain('data-saldo-seccion="PERDIDA"');
    expect(anu).toMatch(
      /data-ayuda-saldo[^>]*>Se descuenta de las próximas utilidades de este avión; no es dinero entregado\.</,
    );
    expect(anu).not.toContain("Adelantado");
    expect(anu).not.toContain("incluye");
    expect(saldosCorridos(anu)).toEqual(["-$3,862.60 MXN"]);
  });

  it("el saldo MEZCLADO de antes no aparece en ningún lado (ni 99,547.42, ni −4,066.62, ni el total 14,936.11)", () => {
    expect(html).not.toContain("99,547.42");
    expect(html).not.toContain("4,066.62");
    expect(html).not.toContain("14,936.11");
    // Y la pérdida del XB-ANU no está en la card del N4142R.
    expect(card(html, N4142R)).not.toContain("3,862.60");
    expect(card(html, N4142R)).not.toContain("XB-ANU");
  });

  it("arriba de las cards: la línea que explica que la cuenta se lleva por avión, el rango, la leyenda UNA vez y el filtro", () => {
    expect(html).toMatch(/^<section[^>]*data-cuenta-por-avion/);
    expect(html).toContain(">Movimientos por avión</h2>");
    expect(html).toMatch(
      /data-texto-cuenta-por-avion[^>]*>La cuenta de este socio se lleva por avión: cada avión tiene su propio saldo y cada entrega descuenta del avión al que corresponde\.</,
    );
    expect(html).toMatch(/data-rango-cuenta-por-avion[^>]*>Septiembre 2026 a Noviembre 2026</);
    expect((html.match(/Generó: la utilidad de ese avión cada mes/g) ?? []).length).toBe(1);
    // La leyenda de la tabla única («…de sus aviones…») ya no se repite en cada tabla.
    expect(html).not.toContain("Generó: la utilidad de sus aviones cada mes");
    expect(html).toContain("data-filtro-de-prueba");
    const antes = html.indexOf("data-filtro-de-prueba");
    expect(antes).toBeGreaterThan(-1);
    expect(antes).toBeLessThan(html.indexOf("data-seccion-cuenta"));
    // Sin filtro no se repite el rango en cada card.
    expect(html).not.toContain("data-rango-seccion");
    expect(html).not.toContain("Las cifras de cada avión son de toda la cuenta");
  });

  it("cada entrega conserva su detalle, «Editar», «Eliminar» y el comprobante (oficina); quien solo consulta, nada de eso", () => {
    const n = card(html, N4142R);
    expect(n).toContain(`data-entrega-id="${ENTREGA_SEP_ID}"`);
    expect((n.match(/data-accion="editar-entrega-socio"/g) ?? []).length).toBe(2);
    expect((n.match(/data-accion="eliminar-entrega-socio"/g) ?? []).length).toBe(2);
    expect((n.match(/data-accion="comprobante-entrega-socio"/g) ?? []).length).toBe(2);
    expect(n).toContain("Entrega · corresponde a Septiembre 2026 · N4142R");
    expect(n).toContain("$238,265.53 MXN · T.C. 18.5 · ≈ $12,879.22 USD");
    expect(n).toContain("Ref. SPEI 8841");
    expect((n.match(/data-en-curso/g) ?? []).length).toBe(1);
    for (const b of botones(html)) expect(b, b).toContain("cursor-pointer");
    const lectura = cards(estadoCuentaPorAvion(), { puedeRegistrar: false });
    expect(lectura).not.toContain('data-accion="editar-entrega-socio"');
    expect(lectura).not.toContain('data-accion="eliminar-entrega-socio"');
    expect(lectura).not.toContain('data-accion="comprobante-entrega-socio"');
    expect(saldosCorridos(card(lectura, N4142R))).toHaveLength(5);
  });
});

describe("estado de cuenta por avión: «a cuenta general», filtro de meses y secciones vacías", () => {
  it("«A cuenta general (sin avión)» va al final, con su ayuda, sin «Generó» y en negativo es «Adelantado»", () => {
    const html = cards(estadoCuentaConGeneral());
    const claves = [...html.matchAll(/data-seccion-cuenta="([^"]+)"/g)].map((m) => m[1]);
    expect(claves).toEqual([N4142R, XBANU, "general"]);
    const general = card(html, "general");
    expect(general).toContain(">A cuenta general (sin avión)</div>");
    expect(general).toContain(
      "Saldo inicial y entregas que no se asignaron a un avión. Para que descuenten del saldo de un avión, asígnaselo con «Editar».",
    );
    expect(etiquetas(general)).toEqual(["Entregado sin avión", "Adelantado"]);
    expect(cifra(general, "genero")).toBeNull();
    expect(cifra(general, "entregado")).toBe("$3,000.00 MXN");
    expect(cifra(general, "saldo")).toBe("$3,000.00 MXN");
    expect(general).toContain('data-saldo-seccion="ADELANTADO"');
    expect(general).not.toContain("Pérdida acumulada");
    // Sus renglones: el arranque de la cuenta y la entrega sin avión, con «Editar» para asignársela a un avión.
    expect(saldosCorridos(general)).toEqual(["$0.00 MXN", "-$3,000.00 MXN"]);
    expect(general).toContain("Entrega a cuenta (sin mes)");
    expect(general).toContain('data-accion="editar-entrega-socio"');
    // Las cards de los aviones no cambian por la general.
    expect(saldosCorridos(card(html, N4142R))).toHaveLength(5);
  });

  it("con filtro de meses cada card abre con SU «Saldo al cierre», dice lo del rango y que las cifras son de toda la cuenta", () => {
    const html = cards(estadoCuentaPorAvionNoviembre(), { filtrado: true });
    expect(html).toMatch(
      /data-rango-cuenta-por-avion[^>]*>Noviembre 2026 a Noviembre 2026 · Las cifras de cada avión son de toda la cuenta, a hoy; las tablas enseñan solo estos meses\.</,
    );
    const n = card(html, N4142R);
    // Las cifras siguen siendo las de HOY de toda la cuenta…
    expect(cifra(n, "genero")).toBe("$360,678.28 MXN");
    expect(cifra(n, "saldo")).toBe("$18,798.71 MXN");
    // …y la tabla, solo noviembre, abriendo con el saldo del N4142R al cierre de octubre.
    expect(n).toContain('data-movimiento="SALDO_ANTERIOR"');
    expect(n).toContain("Saldo al cierre de oct 2026");
    expect(saldosCorridos(n)).toEqual(["$103,410.02 MXN", "-$204.02 MXN", "$18,798.71 MXN"]);
    expect(n).toMatch(/data-rango-seccion[^>]*>En estos meses: generó \$19,002\.73 MXN · se le entregó \$103,614\.04 MXN</);
    const anu = card(html, XBANU);
    expect(saldosCorridos(anu)).toEqual(["-$3,862.60 MXN"]);
    expect(anu).toContain('data-movimiento="SALDO_ANTERIOR"');
    expect(html).not.toContain("99,547.42");
  });

  it("una sección sin movimientos en el rango dice «Sin movimientos en estos meses.» (con sus cifras de hoy)", () => {
    const html = cards(estadoCuentaPorAvionSeptiembre(), { filtrado: true });
    const anu = card(html, XBANU);
    expect(anu).toMatch(/data-seccion-sin-movimientos[^>]*>Sin movimientos en estos meses\.</);
    expect(anu).not.toContain("data-tabla-movimientos");
    expect(etiquetas(anu)).toEqual(["Generó", "Entregado", "Pérdida acumulada"]);
    expect(saldosCorridos(card(html, N4142R))).toEqual(["$232,547.75 MXN"]);
    expect((html.match(/data-tabla-movimientos/g) ?? []).length).toBe(1);
  });
});

describe("KPIs del total: la nota SOLO en cuentas por avión", () => {
  const totales = estado(estadoCuentaPorAvion()).totales;

  it("cuenta por avión: «Suma de sus aviones; el saldo de cada avión está abajo.» bajo los cuatro KPIs del total", () => {
    const h = renderToStaticMarkup(<KpisCuenta totales={totales} mesEnCurso="2026-11" porAvion />);
    expect(h).toMatch(/data-nota-totales-por-avion[^>]*>Suma de sus aviones; el saldo de cada avión está abajo\.</);
    // Los totales del socio siguen ahí, tal cual.
    expect(h).toContain("$356,815.68 MXN");
    expect(h).toContain("$341,879.57 MXN");
    expect(h).toMatch(/data-kpi-saldo="por-entregar"[^>]*>\$14,936\.11 MXN</);
    expect(h.indexOf("data-totales-estado-cuenta")).toBeLessThan(h.indexOf("data-nota-totales-por-avion"));
  });

  it("cuenta de siempre: el marcado de antes, sin nota ni envoltura", () => {
    const sin = renderToStaticMarkup(<KpisCuenta totales={totales} mesEnCurso="2026-11" />);
    expect(sin).not.toContain("data-nota-totales-por-avion");
    // (React pinta un `data-*` booleano como ="true".)
    expect(sin).toMatch(/^<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-totales-estado-cuenta="true">/);
    expect(renderToStaticMarkup(<KpisCuenta totales={totales} mesEnCurso="2026-11" porAvion={false} />)).toBe(sin);
    // Con la nota, los KPIs de adentro son los MISMOS.
    expect(renderToStaticMarkup(<KpisCuenta totales={totales} mesEnCurso="2026-11" porAvion />)).toContain(sin);
  });
});

describe("lista «Pagos a socios»: el desglose corto por avión bajo el saldo", () => {
  const TOTALES = {
    generado_mxn: 356815.68,
    entregado_mxn: 341879.57,
    por_entregar_mxn: 14936.11,
    adelantado_mxn: 0,
    socios_por_entregar: 1,
    socios_adelantados: 0,
  };
  const tabla = (socios: ReturnType<typeof resumen>[], puedeRegistrar = true) =>
    renderToStaticMarkup(
      <SociosCuentaTable socios={socios} totales={TOTALES} hastaMes="2026-11" puedeRegistrar={puedeRegistrar} registro={REGISTRO} />,
    );

  it("«N4142R $18,798.71 MXN · XB-ANU -$3,862.60 MXN» bajo el por entregar del socio, cada saldo con su color", () => {
    const html = tabla([resumen(resumenPorAvion())]);
    expect((html.match(/data-saldos-por-avion/g) ?? []).length).toBe(1);
    expect(texto(html)).toContain("$14,936.11 MXN N4142R $18,798.71 MXN · XB-ANU -$3,862.60 MXN");
    // El que debe, en ámbar; el que va en negativo, en azul (los colores del saldo de siempre).
    expect(html).toMatch(
      new RegExp(`data-saldo-avion="${N4142R}"[^>]*>N4142R <span class="font-mono font-medium text-amber-700 dark:text-amber-400">\\$18,798\\.71 MXN</span>`),
    );
    expect(html).toMatch(
      new RegExp(`data-saldo-avion="${XBANU}"[^>]*>XB-ANU <span class="font-mono font-medium text-sky-700 dark:text-sky-300">-\\$3,862\\.60 MXN</span>`),
    );
    // El `title` dice qué es cada saldo: el del XB-ANU es una pérdida, no un adelanto.
    expect(html).toContain('title="N4142R · Por entregar: $18,798.71 MXN"');
    expect(html).toContain(
      'title="XB-ANU · Pérdida acumulada: $3,862.60 MXN. Se descuenta de las próximas utilidades de este avión; no es dinero entregado."',
    );
    // El total del socio sigue siendo el de siempre, en su celda.
    expect(html).toMatch(/text-amber-700[^"]*"[^>]*>\$14,936\.11 MXN<span/);
  });

  it("con «a cuenta general»: tercera pieza «Cuenta general -$3,000.00 MXN»", () => {
    const html = tabla([resumen(resumenConGeneral())]);
    expect(texto(html)).toContain("N4142R $122,412.75 MXN · XB-ANU -$3,862.60 MXN · Cuenta general -$3,000.00 MXN");
    expect(html).toContain('data-saldo-avion="general"');
    expect(html).toContain('title="Cuenta general · Adelantado: $3,000.00 MXN"');
  });

  it("solo los socios cuya cuenta se lleva por avión llevan desglose; los demás renglones no cambian", () => {
    const deUnAvion = resumen({
      ...sinAditivo(resumenPorAvion()),
      socio: { id: "50c10000-0000-4000-8000-000000000002", nombre: "Aero Charter Cancun S.A. de C.V." },
      aviones: [{ id: N4142R, matricula: "N4142R", porcentaje: 29, vigente: true }],
    });
    const html = tabla([resumen(resumenPorAvion()), deUnAvion]);
    expect((html.match(/data-saldos-por-avion/g) ?? []).length).toBe(1);
    const filas = html.split("data-socio-cuenta=").slice(1);
    expect(filas[0]).toContain("data-saldos-por-avion");
    expect(filas[1]).not.toContain("data-saldos-por-avion");
  });

  it("«Socios · por entregar» del Reparto lleva el mismo desglose bajo el saldo acumulado", () => {
    const seccion = (socios: ReturnType<typeof resumen>[]) =>
      renderToStaticMarkup(
        <SociosPorEntregarSection
          carga={{ estado: "ok", datos: { disponible: true, hasta_mes: "2026-11", socios, totales: TOTALES } }}
          aviones={[]}
          desde="2026-10-01"
          hasta="2026-10-31"
          puedeRegistrar
          registro={REGISTRO}
        />,
      );
    const html = seccion([resumen(resumenPorAvion())]);
    expect(texto(html)).toContain("$14,936.11 MXN N4142R $18,798.71 MXN · XB-ANU -$3,862.60 MXN");
    expect(seccion([resumen(sinAditivo(resumenPorAvion()))])).not.toContain("data-saldos-por-avion");
  });

  it("la pieza suelta: en la cuenta de siempre no pinta NADA", () => {
    expect(renderToStaticMarkup(<DesgloseSaldosPorAvion cuenta={resumen(sinAditivo(resumenPorAvion()))} />)).toBe("");
    expect(renderToStaticMarkup(<DesgloseSaldosPorAvion cuenta={{}} />)).toBe("");
    expect(renderToStaticMarkup(<DesgloseSaldosPorAvion cuenta={{ cuenta_por_avion: true, por_avion: [] }} />)).toBe("");
  });
});

describe("diálogo «Registrar entrega» en una cuenta POR AVIÓN", () => {
  const alta = (contexto: ContextoEntrega) =>
    renderToStaticMarkup(
      <FormularioEntrega dialogo={{ tipo: "alta", contexto }} onCerrar={() => {}} registro={REGISTRO} />,
    );
  const ctx = (raw: Record<string, unknown>, avionSugerido: string | null = null) =>
    contextoEntrega(resumen(raw), { mesEnCurso: "2026-11", avionSugerido });
  /** El `<input type="number">` del monto (el primero). */
  const monto = (html: string) => html.match(/<input[^>]*type="number"[^>]*>/)?.[0] ?? "";
  /** Lo que muestra el selector del avión (su disparador es el del campo «Corresponde al avión»). */
  const selectorAvion = (html: string) => {
    const id = html.match(/<label[^>]*for="([^"]+)"[^>]*>Corresponde al avión/)?.[1];
    return id ? (html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>([\\s\\S]*?)</button>`))?.[1] ?? "") : "";
  };

  it("el avión es OBLIGATORIO y va primero: sin valor inicial («Elige el avión»), con asterisco y ANTES del monto", () => {
    const html = alta(ctx(resumenAntesDeLaEntrega()));
    expect(html).toMatch(/>Corresponde al avión<span class="text-destructive ml-0\.5">\*<\/span><\/label>/);
    expect(html).not.toContain("Corresponde al avión (opcional)");
    expect(selectorAvion(html)).toContain(">Elige el avión</span>");
    expect(selectorAvion(html)).not.toContain("Sin avión");
    expect(html.indexOf("Corresponde al avión")).toBeLessThan(html.indexOf("Monto entregado (MXN)"));
    // Y solo una vez (no se queda además al final, junto al mes).
    expect((html.match(/Corresponde al avión/g) ?? []).length).toBe(1);
    expect(html).toMatch(
      /data-ayuda-avion="ayuda"[^>]*><span[^>]*>En esta cuenta el saldo se lleva por avión: elige a cuál corresponde la entrega\.</,
    );
  });

  it("sin avión elegido NO propone el total mezclado del socio como monto; el encabezado dice que es la suma de sus aviones", () => {
    const html = alta(ctx(resumenAntesDeLaEntrega()));
    expect(html).toContain("Por entregar hoy: $118,550.15 MXN");
    expect(html).toMatch(
      /data-nota-cuenta-por-avion[^>]*>Es la suma de sus aviones: la cuenta se lleva por avión\. Elige abajo el avión de la entrega para ver su saldo\.</,
    );
    expect(monto(html)).toContain('value=""');
    expect(html).not.toContain('value="118550.15"');
    expect(html).not.toContain("Prellenado con lo que hay por entregar");
    // El mes ya no dice «descuenta del saldo total del socio» (aquí descuenta del avión).
    expect(html).not.toContain("la entrega descuenta del saldo total del socio");
    expect(html).toContain("Solo informativo: el mes no cambia de qué saldo descuenta la entrega; eso lo decide el avión.");
  });

  it("con el avión elegido (N4142R, antes de la entrega del 10-nov): su saldo bajo el campo y como monto propuesto", () => {
    const html = alta(ctx(resumenAntesDeLaEntrega(), N4142R));
    expect(selectorAvion(html)).toContain(">N4142R</span>");
    expect(html).toMatch(
      /data-ayuda-avion="saldo"[^>]*><span class="font-medium text-amber-700 dark:text-amber-400">Por entregar de N4142R: \$103,410\.02 MXN \(sin contar el mes en curso: \$19,002\.73 MXN\)<\/span>/,
    );
    expect(monto(html)).toContain('value="103410.02"');
    expect(html).toContain("Prellenado con lo que hay por entregar de N4142R: $103,410.02 MXN.");
    expect(html).not.toContain("data-adelanto-general");
  });

  it("en negativo se dice como pérdida acumulada (XB-ANU) o adelantado (N4142R después del 10-nov), sin monto propuesto", () => {
    const anu = alta(ctx(resumenPorAvion(), XBANU));
    expect(anu).toMatch(
      /data-ayuda-avion="saldo"[^>]*><span class="font-medium text-sky-700 dark:text-sky-300">XB-ANU lleva una pérdida acumulada de \$3,862\.60 MXN: se descuenta de sus próximas utilidades \(no hay nada por entregar de este avión\)\.<\/span>/,
    );
    expect(monto(anu)).toContain('value=""');
    const n = alta(ctx(resumenPorAvion(), N4142R));
    expect(n).toContain(
      "N4142R va adelantado: $204.02 MXN a favor de VuelaTour (no hay nada por entregar de este avión, sin contar el mes en curso: $19,002.73 MXN).",
    );
    expect(monto(n)).toContain('value=""');
  });

  it("si ya hay adelantos «a cuenta general» se avisa que se descuentan (segunda línea, en ámbar) y no se propone monto", () => {
    const html = alta(ctx(resumenConGeneral(), N4142R));
    expect(html).toContain("Por entregar de N4142R: $103,410.02 MXN (sin contar el mes en curso: $19,002.73 MXN)");
    expect(html).toMatch(
      /data-adelanto-general[^>]*>Ya se le adelantaron \$3,000\.00 MXN a cuenta general: el sistema los descuenta de lo que hay por entregar de este avión\.</,
    );
    expect(monto(html)).toContain('value=""');
  });

  it("toda etiqueta con `for` nombra a un control que existe y todo botón lleva la manita", () => {
    const html = alta(ctx(resumenAntesDeLaEntrega(), N4142R));
    const huerfanas = [...html.matchAll(/<label[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/label>/g)]
      .filter((m) => !html.includes(`id="${m[1]}"`))
      .map((m) => m[2].replace(/<[^>]+>/g, ""));
    expect(huerfanas).toEqual([]);
    for (const b of botones(html)) expect(b, b).toContain("cursor-pointer");
  });

  it("EDICIÓN: no se exige nada nuevo — una entrega vieja SIN avión abre en «Sin avión (a cuenta general)», sin asterisco, y se explica la regla", () => {
    const pago = normalizarPago(ENTREGA_GENERAL);
    if (!pago) throw new Error("sin pago");
    const html = renderToStaticMarkup(
      <FormularioEntrega dialogo={{ tipo: "edicion", contexto: ctx(resumenConGeneral()), pago }} onCerrar={() => {}} registro={REGISTRO} />,
    );
    expect(html).toContain("Editar entrega a Mauricio Roque");
    expect(html).toMatch(/>Corresponde al avión<\/label>/);
    expect(selectorAvion(html)).toContain(">Sin avión (a cuenta general)</span>");
    expect(html).toMatch(
      /data-ayuda-avion="ayuda"[^>]*><span[^>]*>En esta cuenta el saldo se lleva por avión: la entrega descuenta del avión que elijas; sin avión queda a cuenta general\.</,
    );
    // Sin las ayudas del alta: ni saldo del avión ni monto propuesto.
    expect(html).not.toContain('data-ayuda-avion="saldo"');
    expect(html).not.toContain("Por entregar hoy");
    expect(monto(html)).toContain('value="3000"');
    // Una entrega CON avión abre con el suyo.
    const conAvion = normalizarPago(ENTREGA_OCT);
    if (!conAvion) throw new Error("sin pago");
    const h2 = renderToStaticMarkup(
      <FormularioEntrega dialogo={{ tipo: "edicion", contexto: ctx(resumenPorAvion()), pago: conAvion }} onCerrar={() => {}} registro={REGISTRO} />,
    );
    expect(selectorAvion(h2)).toContain(">N4142R</span>");
  });

  it("la confirmación del ADELANTO nombra el avión (recuadro con el texto que arma el API)", () => {
    const c = confirmacionAdelanto({
      por_entregar_mxn: 103410.02,
      mes_en_curso_mxn: 19002.73,
      monto_mxn: 103614.04,
      exceso_mxn: 204.02,
      saldo_despues_mxn: -204.02,
      aeronave: { id: N4142R, matricula: "N4142R" },
      adelantado_general_mxn: 0,
    });
    const html = renderToStaticMarkup(<AvisoAdelanto titulo={c.titulo} descripcion={c.descripcion} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain(
      "Esta entrega de $103,614.04 MXN supera lo que hay por entregar de N4142R ($103,410.02 MXN, sin contar el mes en curso: $19,002.73 MXN). Se registrará como ADELANTO y el saldo de N4142R quedará a favor de VuelaTour por $204.02 MXN. ¿Registrar?",
    );
  });

  it("paso «Entrega registrada»: además del total del socio, cómo quedó el saldo del avión de esa entrega", () => {
    const pago = normalizarPago(ENTREGA_OCT);
    if (!pago) throw new Error("sin pago");
    const html = renderToStaticMarkup(
      <FormularioEntrega
        dialogo={{ tipo: "alta", contexto: ctx(resumenAntesDeLaEntrega()) }}
        onCerrar={() => {}}
        registro={REGISTRO}
        registradaInicial={{ pago, cuenta: resumen(resumenPorAvion()) }}
      />,
    );
    expect(html).toMatch(/data-saldo-despues[^>]*>Por entregar hoy: \$14,936\.11 MXN</);
    expect(html).toMatch(/data-saldo-avion-despues[^>]*>N4142R · Por entregar: \$18,798\.71 MXN</);
    // En la cuenta de siempre, solo el total.
    const viejo = renderToStaticMarkup(
      <FormularioEntrega
        dialogo={{ tipo: "alta", contexto: ctx(sinAditivo(resumenAntesDeLaEntrega())) }}
        onCerrar={() => {}}
        registro={REGISTRO}
        registradaInicial={{ pago, cuenta: resumen(sinAditivo(resumenPorAvion())) }}
      />,
    );
    expect(viejo).not.toContain("data-saldo-avion-despues");
    expect(viejo).toMatch(/data-saldo-despues[^>]*>Por entregar hoy: \$14,936\.11 MXN</);
  });
});

describe("SIN el aditivo todo queda como hoy (API previo · un solo avión · aditivo ilegible)", () => {
  /** Las tres formas de «no es una cuenta por avión» sobre la misma respuesta. */
  const variantes = (raw: Record<string, unknown>): [string, Record<string, unknown>][] => {
    const secciones = raw.por_avion as Record<string, unknown>[];
    return [
      ["`cuenta_por_avion: false`", { ...raw, cuenta_por_avion: false }],
      ["sin la bandera", { ...raw, cuenta_por_avion: undefined }],
      ["una sección ilegible", { ...raw, por_avion: [secciones[0], { ...secciones[1], por_entregar_mxn: null }] }],
      ["`por_avion` que no es lista", { ...raw, por_avion: "N4142R" }],
    ];
  };

  it("diálogo: el de siempre — avión OPCIONAL al final (en «Sin avión»), el monto con lo por entregar del socio, sin notas nuevas", () => {
    const viejo = renderToStaticMarkup(
      <FormularioEntrega
        dialogo={{ tipo: "alta", contexto: contextoEntrega(resumen(sinAditivo(resumenAntesDeLaEntrega())), { mesEnCurso: "2026-11" }) }}
        onCerrar={() => {}}
        registro={REGISTRO}
      />,
    );
    expect(viejo).toContain("Corresponde al avión (opcional)");
    expect(viejo).toContain(">Sin avión</span>");
    expect(viejo).not.toContain("a cuenta general");
    expect(viejo.indexOf("Monto entregado (MXN)")).toBeLessThan(viejo.indexOf("Corresponde al avión"));
    expect(viejo.indexOf("Corresponde al mes")).toBeLessThan(viejo.indexOf("Corresponde al avión"));
    expect(viejo).toContain('value="118550.15"');
    expect(viejo).toContain("Prellenado con lo que hay por entregar: $118,550.15 MXN.");
    expect(viejo).toContain("Solo informativo: la entrega descuenta del saldo total del socio.");
    expect(viejo).not.toContain("data-ayuda-avion");
    expect(viejo).not.toContain("data-nota-cuenta-por-avion");
    // Y las otras formas de «no por avión» dan EXACTAMENTE el mismo marcado.
    for (const [nombre, raw] of variantes(resumenAntesDeLaEntrega())) {
      const html = renderToStaticMarkup(
        <FormularioEntrega
          dialogo={{ tipo: "alta", contexto: contextoEntrega(resumen(raw), { mesEnCurso: "2026-11" }) }}
          onCerrar={() => {}}
          registro={REGISTRO}
        />,
      );
      expect(html, nombre).toBe(viejo);
    }
  });

  it("lista «Pagos a socios»: el mismo marcado con o sin el aditivo que no aplica", () => {
    const tabla = (raw: Record<string, unknown>) =>
      renderToStaticMarkup(
        <SociosCuentaTable socios={[resumen(raw)]} totales={null} hastaMes="2026-11" puedeRegistrar registro={REGISTRO} />,
      );
    const viejo = tabla(sinAditivo(resumenPorAvion()));
    expect(viejo).not.toContain("data-saldos-por-avion");
    for (const [nombre, raw] of variantes(resumenPorAvion())) expect(tabla(raw), nombre).toBe(viejo);
  });

  it("estado de cuenta: sin secciones por avión no hay cards (la página pinta la tabla única de siempre)", () => {
    expect(saldosPorAvion(estado(sinAditivo(estadoCuentaPorAvion())))).toBeNull();
    for (const [nombre, raw] of variantes(estadoCuentaPorAvion())) {
      expect(saldosPorAvion(estado(raw)), nombre).toBeNull();
    }
  });
});

describe("cableado en el código", () => {
  const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
  const pagina = leer("src/app/admin/profit-sharing/socios/[id]/page.tsx");
  const seccion = leer("src/components/admin/profit-sharing/cuenta-por-avion.tsx");
  const dialogo = leer("src/components/admin/profit-sharing/entrega-socio-dialog.tsx");
  const lista = leer("src/components/admin/profit-sharing/socios-cuenta-table.tsx");
  const porEntregar = leer("src/components/admin/profit-sharing/socios-por-entregar-section.tsx");
  const desglose = leer("src/components/admin/profit-sharing/saldos-por-avion.tsx");

  it("la página decide con la puerta única (`saldosPorAvion`): cards por avión o la card «Movimientos» de siempre", () => {
    expect(pagina).toContain("const secciones = saldosPorAvion(datos);");
    expect(pagina).toMatch(/\{secciones \? \(\s*<CuentaPorAvion\s+secciones=\{secciones\}/);
    expect(pagina).toContain('<CardTitle className="text-base">Movimientos</CardTitle>');
    expect(pagina).toContain("<KpisCuenta totales={datos.totales} mesEnCurso={hoyMes} porAvion={secciones !== null} />");
    // El filtro de meses es UNO para las dos vistas.
    expect((pagina.match(/<FiltroMesesCuenta/g) ?? []).length).toBe(1);
    expect((pagina.match(/\{filtroMeses\}/g) ?? []).length).toBe(2);
  });

  it("cada card monta la MISMA tabla con los movimientos de SU sección (sin leyenda repetida) y no hace cuentas", () => {
    expect(seccion).toMatch(/<MovimientosCuenta\s+movimientos=\{s\.movimientos\}/);
    expect(seccion).toContain("ayuda={null}");
    expect(seccion).toContain("saldoDeSeccionAvion(s)");
    // Los números se pintan tal cual llegan: ni sumas ni restas de saldos en los componentes.
    for (const [nombre, src] of [["cuenta-por-avion", seccion], ["saldos-por-avion", desglose]] as const) {
      expect(src, nombre).not.toMatch(/\.reduce\(/);
      expect(src, nombre).not.toMatch(/_mxn\s*[-+*/]\s|[-+*/]\s*\w+\.\w+_mxn/);
    }
  });

  it("el diálogo exige el avión solo en cuentas por avión y todo su texto sale de la fuente única", () => {
    expect(dialogo).toContain("const porAvion = saldosPorAvionDeContexto(contexto) !== null;");
    expect(dialogo).toContain("validarFormPago(form, hoyLocal, { cuentaPorAvion: porAvion })");
    expect(dialogo).toContain("cuentaPorAvion: porAvion,");
    expect(dialogo).toContain("required={porAvion && alta}");
    expect(dialogo).toContain("ayudaAvionEntrega(contexto, form.aeronave_id, dialogo.tipo)");
    expect(dialogo).toContain("porEntregarMxn: porEntregarParaPrellenar(contexto, contexto.avionSugerido ?? null),");
    expect(dialogo).toContain("{!porAvion && campoAvion}");
    // Ninguna frase del saldo por avión vive en el componente.
    expect(dialogo).not.toMatch(/a cuenta general|se lleva por avión|pérdida acumulada/i);
  });

  it("las dos tablas de socios montan el desglose con el renglón del API", () => {
    expect(lista).toContain("<DesgloseSaldosPorAvion cuenta={s} />");
    expect(porEntregar).toContain("<DesgloseSaldosPorAvion cuenta={r} />");
    expect(desglose).toContain("desgloseSaldosPorAvion(cuenta)");
  });
});
