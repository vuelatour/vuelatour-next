/**
 * Reparto EN PESOS (18-oct-2026, API 0.0.93) en la pantalla del reparto:
 *  1. SIN la bandera `reparto_en_pesos` (API ≤ 0.0.92) el marcado del KPI y de
 *     las cards es BYTE A BYTE el de antes (golden congelado ANTES del cambio
 *     con las mismas fixtures: `reparto-pesos.golden.json`), aunque el API ya
 *     mande las llaves `*_mxn`;
 *  2. CON la bandera: pesos primero (tamaño/peso de siempre) y los dólares
 *     debajo en gris y más chicos; la reserva con su T.C.; los socios en
 *     pesos; el desglose (vuelos y categorías) en pesos;
 *  3. `pesos_sin_tc_usd > 0` ⇒ aviso ámbar en la card de ese avión;
 *  4. un monto sin pesos se pinta en dólares CON sufijo y lo dice;
 *  5. cableado: la página lee la bandera con la fuente única y la pasa; la
 *     cuenta corriente de socios no se toca.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AvionReparto } from "@/types/profit-sharing";
import { avionA, avionB, conPesos, otrosIngresosVt } from "./reparto-pesos.fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/profit-sharing",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/admin/excel-export-button", () => ({ ExcelExportButton: () => null }));

const { AvionRepartoCard } = await import("../avion-reparto-card");
const { KpiStrip } = await import("../kpi-strip");

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const GOLDEN = JSON.parse(leer("./reparto-pesos.golden.json")) as Record<
  "kpi" | "kpiSinOtros" | "cardA" | "cardB",
  string
>;

const card = (a: AvionReparto, enPesos?: boolean) =>
  renderToStaticMarkup(
    <AvionRepartoCard
      avion={a}
      desde="2026-09-01"
      hasta="2026-09-30"
      rol="ADMIN"
      usuarioId="u-1"
      {...(enPesos === undefined ? {} : { enPesos })}
    />,
  );
const kpi = (aviones: AvionReparto[], opts: { otros?: boolean; enPesos?: boolean } = {}) =>
  renderToStaticMarkup(
    <KpiStrip
      aviones={aviones}
      {...(opts.otros === false ? {} : { otrosIngresos: otrosIngresosVt() })}
      {...(opts.enPesos === undefined ? {} : { enPesos: opts.enPesos })}
    />,
  );

/** La cifra principal aparece ANTES que su dato informativo, y este va gris y chico. */
function pesosAntesQueDolares(html: string, principal: string, informativo: string) {
  const i = html.indexOf(`>${principal}<`);
  const j = html.indexOf(`>${informativo}<`);
  expect(i, principal).toBeGreaterThan(-1);
  expect(j, informativo).toBeGreaterThan(i);
  const etiqueta = html.slice(html.lastIndexOf("<", j), j);
  expect(etiqueta).toMatch(/text-muted-foreground/);
  expect(etiqueta).toMatch(/text-(xs|\[10px\])/);
}

describe("sin la bandera: el marcado de SIEMPRE (golden del 18-oct, antes del cambio)", () => {
  it("KPI y cards idénticos al golden con la forma del API ≤ 0.0.92", () => {
    expect(kpi([avionA(), avionB()])).toBe(GOLDEN.kpi);
    expect(kpi([avionA(), avionB()], { otros: false })).toBe(GOLDEN.kpiSinOtros);
    expect(card(avionA())).toBe(GOLDEN.cardA);
    expect(card(avionB())).toBe(GOLDEN.cardB);
  });

  it("con las llaves `*_mxn` pero SIN la bandera (o con `enPesos={false}`): idéntico", () => {
    const flota = [conPesos(avionA()), conPesos(avionB())];
    expect(kpi(flota)).toBe(GOLDEN.kpi);
    expect(kpi(flota, { enPesos: false })).toBe(GOLDEN.kpi);
    expect(card(conPesos(avionA()))).toBe(GOLDEN.cardA);
    expect(card(conPesos(avionA()), false)).toBe(GOLDEN.cardA);
    expect(card(conPesos(avionB()), false)).toBe(GOLDEN.cardB);
    expect(GOLDEN.cardA).not.toContain("$145,050.03");
    expect(GOLDEN.cardA).not.toContain("≈ ");
  });
});

describe("con la bandera: pesos primero, dólares informativos", () => {
  const htmlA = card(conPesos(avionA()), true);

  it("saldo del encabezado y de la cascada en pesos, con los dólares debajo", () => {
    pesosAntesQueDolares(htmlA, "$145,050.03 MXN", "≈ $8,176.16 USD");
    // Encabezado: la cifra conserva su tamaño y peso de siempre.
    expect(htmlA).toMatch(/text-xl font-semibold tabular-nums text-emerald-600[^"]*">\$145,050\.03 MXN</);
    expect(htmlA.match(/>\$145,050\.03 MXN</g)?.length).toBe(2);
  });

  it("cada fila de la cascada: pesos con su «−» y el dólar informativo", () => {
    pesosAntesQueDolares(htmlA, "$210,811.73 MXN", "≈ $12,000 USD");
    pesosAntesQueDolares(htmlA, "$46,550.80 MXN", "≈ $2,586.16 USD");
    pesosAntesQueDolares(htmlA, "−$6,210.00 MXN", "≈ −$360 USD");
    pesosAntesQueDolares(htmlA, "−$70,740.00 MXN", "≈ −$4,000 USD");
    pesosAntesQueDolares(htmlA, "−$13,800.00 MXN", "≈ −$800 USD");
    pesosAntesQueDolares(htmlA, "−$2,587.50 MXN", "≈ −$150 USD");
    pesosAntesQueDolares(htmlA, "−$10,350.00 MXN", "≈ −$600 USD");
    // Reserva: «al T.C.» del cierre del periodo; la fórmula en USD se queda de sublabel.
    pesosAntesQueDolares(htmlA, "−$8,625.00 MXN", "≈ −$500 USD · al T.C. 17.25");
    expect(htmlA).toContain("12.5 hr × $40/hr");
  });

  it("socios: «Utilidad del periodo» en pesos con el dólar debajo", () => {
    pesosAntesQueDolares(htmlA, "$59,354.47 MXN", "≈ $3,345.68 USD");
    pesosAntesQueDolares(htmlA, "$85,695.56 MXN", "≈ $4,830.48 USD");
    expect(htmlA).toContain("Utilidad del periodo");
  });

  it("encabezado: pendiente en pesos, deuda y otros VuelaTour con sufijo USD", () => {
    expect(htmlA).toContain(">Pendiente $51,750.00 MXN · 1 vuelo(s)<");
    expect(htmlA).toContain("(≈ $3,000 USD)");
    expect(htmlA).toContain(">deuda total del cliente $3,400 USD<");
    expect(htmlA).toContain(">$1,500 USD<");
    expect(htmlA).toContain(">· por cobrar $200 USD<");
    // Badges «sin TC»: el título ya no dice «quedaron fuera del cálculo» a secas.
    expect(htmlA).toContain("quedaron fuera del dato en dólares (USD).");
  });

  it("tooltip de los otros ingresos del avión en pesos", () => {
    expect(htmlA).toContain(
      'title="ING-4 · TRANSF INTERBANCARIA SPEI · angel alvarez · $46,550.80 MXN (≈ $2,586.16 USD)"',
    );
  });

  it("desglose: cobrado/pendiente por vuelo en pesos con su T.C., venta en USD, categorías en MXN", () => {
    pesosAntesQueDolares(htmlA, "$90,061.73 MXN", "≈ $5,000 USD · al T.C. 18.012345");
    pesosAntesQueDolares(htmlA, "$120,750.00 MXN", "≈ $7,000 USD · al T.C. 17.25");
    pesosAntesQueDolares(htmlA, "$51,750.00 MXN", "≈ $3,000 USD");
    // Pie: Σ en centavos de lo que trae cada vuelo (= «Venta del avión cobrada»).
    expect(htmlA).toContain(">$210,811.73 MXN<");
    expect(htmlA).toContain(">$10,000 USD<");
    expect(htmlA).toContain(">en USD<");
    expect(htmlA).toMatch(/<th[^>]*>MXN<\/th>/);
    expect(htmlA).not.toMatch(/<th[^>]*>USD<\/th>/);
    pesosAntesQueDolares(htmlA, "$55,200.00 MXN", "≈ $3,200 USD");
    expect(htmlA).toContain("1 sin TC · $1,740.00 MXN fuera del dato en USD");
  });

  it("sin dólares sin T.C. no hay aviso ámbar", () => {
    expect(htmlA).not.toContain("data-aviso-pesos-sin-tc");
    expect(htmlA).not.toContain("no se pudieron pasar a pesos");
  });

  it("avión con saldo negativo: rojo y en pesos", () => {
    const html = card(conPesos(avionB()), true);
    expect(html).toMatch(/text-destructive[^"]*">-\$17,250\.00 MXN</);
    pesosAntesQueDolares(html, "-$8,625.00 MXN", "≈ -$500 USD");
  });
});

describe("pesos_sin_tc_usd > 0: aviso ámbar en la card de ESE avión", () => {
  it("dice cuántos dólares y que el saldo en pesos está incompleto", () => {
    const html = card({ ...conPesos(avionA()), pesos_sin_tc_usd: 120 }, true);
    expect(html).toContain("data-aviso-pesos-sin-tc");
    expect(html).toContain(
      "$120 USD no se pudieron pasar a pesos (sin tipo de cambio): el saldo en pesos está incompleto.",
    );
    expect(html).toMatch(/data-aviso-pesos-sin-tc=""[^>]*text-amber-700/);
    // Va después del saldo de la cascada.
    expect(html.indexOf("no se pudieron pasar a pesos")).toBeGreaterThan(
      html.lastIndexOf(">$145,050.03 MXN<"),
    );
  });

  it("y el KPI de saldo de la flota avisa que está incompleto", () => {
    const html = kpi([{ ...conPesos(avionA()), pesos_sin_tc_usd: 120 }, conPesos(avionB())], {
      enPesos: true,
    });
    expect(html).toContain(">Incompleto en pesos: revisa el aviso del avión<");
  });
});

describe("un monto sin pesos se dice (jamás un peso inventado)", () => {
  it("vuelo sin T.C. ⇒ dólares con sufijo en ámbar y el pie cae a dólares", () => {
    const a = conPesos(avionA());
    const sinTc: AvionReparto = {
      ...a,
      detalle: {
        ...a.detalle!,
        vuelos: a.detalle!.vuelos.map((v) =>
          v.id === "v-301" ? { ...v, cobrado_avion_mxn: null, tc_pesos: null } : v,
        ),
      },
    };
    const html = card(sinTc, true);
    expect(html).toContain(">$5,000 USD<");
    expect(html).toMatch(/text-amber-700[^"]*">sin T\.C\. para pasarlo a pesos</);
    // Pie del cobrado: Σ a medias no se pinta; cae a los dólares.
    expect(html).toContain(">$12,000 USD<");
  });

  it("socio sin `monto_mxn` ⇒ su dólar con sufijo", () => {
    const a = conPesos(avionA());
    const html = card({ ...a, reparto: a.reparto.map((s) => ({ ...s, monto_mxn: null })) }, true);
    expect(html).toContain(">$3,345.68 USD<");
  });
});

describe("KpiStrip con la bandera", () => {
  const html = kpi([conPesos(avionA()), conPesos(avionB())], { enPesos: true });

  it("Σ en centavos de los pesos de las cards, dólares debajo", () => {
    pesosAntesQueDolares(html, "$210,811.73 MXN", "≈ $12,000 USD");
    pesosAntesQueDolares(html, "$120,937.50 MXN", "≈ $6,910 USD");
    pesosAntesQueDolares(html, "$8,625.00 MXN", "≈ $500 USD");
    pesosAntesQueDolares(html, "$51,750.00 MXN", "≈ $3,000 USD");
    pesosAntesQueDolares(html, "$127,800.03 MXN", "≈ $7,176.16 USD");
    // La cifra conserva su tamaño de siempre.
    expect(html).toMatch(/text-lg font-semibold tracking-tight tabular-nums[^"]*">\$127,800\.03 MXN</);
  });

  it("hint de otros ingresos en pesos; «Otros ingresos VuelaTour» con sufijo USD", () => {
    expect(html).toContain(">2 vuelo(s) cobrados · + $46,550.80 MXN otros ingresos de aviones<");
    expect(html).toContain(">$1,500 USD<");
    expect(html).toContain("por cobrar $200 USD");
    expect(html).toContain("TUAs $600 USD · extras $300 USD");
  });

  it("si a un avión le faltan los pesos, el total cae a dólares y lo dice", () => {
    const mezcla = kpi([conPesos(avionA()), avionB()], { enPesos: true });
    expect(mezcla).toContain(">$7,176.16 USD<");
    expect(mezcla).toContain(">sin T.C. para pasarlo a pesos<");
  });
});

describe("cableado", () => {
  const pagina = leer("../../../../app/admin/profit-sharing/page.tsx");
  const tarjeta = leer("../avion-reparto-card.tsx");
  const porEntregar = leer("../socios-por-entregar-section.tsx");

  it("la página lee la bandera con la fuente única y la pasa al KPI y a las cards", () => {
    expect(pagina).toContain("const enPesos = repartoEnPesos(result);");
    expect(pagina).toMatch(/<KpiStrip[\s\S]*?enPesos=\{enPesos\}[\s\S]*?\/>/);
    expect(pagina).toMatch(/<AvionRepartoCard[\s\S]*?enPesos=\{enPesos\}[\s\S]*?\/>/);
    expect(pagina).toContain("{enPesos && <p>{NOTA_REPARTO_EN_PESOS}</p>}");
  });

  it("la cuenta corriente de socios no se toca (sigue en dólares)", () => {
    expect(pagina).not.toMatch(/<SociosPorEntregarSection[^>]*enPesos/);
    expect(porEntregar).not.toContain("reparto-pesos");
    expect(porEntregar).not.toContain("_mxn");
  });

  it("la card pasa la bandera a socios y al desglose; el aviso no va como hermano del desglose", () => {
    expect(tarjeta).toContain("enPesos={enPesos}\n        />");
    expect(tarjeta).toContain("<DesgloseSection detalle={detalle} enPesos={enPesos} />");
    // El aviso vive DENTRO de la cascada (un hermano nuevo en CardContent
    // correría los ids de `useId` del desglose).
    const cascada = tarjeta.slice(tarjeta.indexOf("Cascada del saldo"), tarjeta.indexOf("<SociosSection"));
    expect(cascada).toContain("avisoPesosSinTc(");
  });

  it("ningún componente redacta los textos de pesos a mano", () => {
    for (const rel of ["../kpi-strip.tsx", "../avion-reparto-card.tsx", "../desglose-section.tsx", "../socios-section.tsx"]) {
      const fuente = leer(rel);
      expect(fuente, rel).not.toMatch(/no se pudieron pasar a pesos/);
      expect(fuente, rel).not.toMatch(/["'`]≈ /);
      expect(fuente, rel).not.toMatch(/al T\.C\./);
    }
  });
});
