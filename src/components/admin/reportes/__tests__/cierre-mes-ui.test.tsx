/**
 * Cierre de mes formal (16-oct-2026, API 0.0.88) en pantalla: render estático
 * de los botones, de los avisos del reparto y cableado (por regex) de la
 * previa, el `PREVIA_CAMBIO`, el pre-cierre y el aviso 409 `MES_CERRADO` en
 * los formularios de captura. Sin DOM (runner `node`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/app/admin/reportes/actions", () => ({
  previaCierreAction: async () => ({ ok: false }),
  cerrarMesAction: async () => ({ ok: false }),
  reabrirMesAction: async () => ({ ok: false }),
}));

const { CierreMesAcciones } = await import("../cierre-mes-acciones");
const { CierreRepartoAviso, CierreRepartoAvion } = await import(
  "@/components/admin/profit-sharing/cierre-reparto-aviso"
);

const raiz = path.resolve(__dirname, "../../../../..");
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

describe("botones «Cerrar <mes>» / «Reabrir mes»", () => {
  it("mes abierto y cerrable: «Cerrar septiembre 2026» habilitado", () => {
    const html = renderToStaticMarkup(
      <CierreMesAcciones mes="2026-09" cerrado={false} ofreceCerrar ofreceReabrir={false} motivoNoCerrable={null} nDiferidos={null} />,
    );
    expect(html).toContain("Cerrar septiembre 2026");
    expect(html).not.toContain(" disabled=\"\"");
    expect(html).not.toContain("Reabrir mes");
  });
  it("con motivo (orden / en curso): deshabilitado y el texto a la vista", () => {
    const motivo = "Para cerrar octubre 2026 primero cierra septiembre 2026.";
    const html = renderToStaticMarkup(
      <CierreMesAcciones mes="2026-10" cerrado={false} ofreceCerrar ofreceReabrir={false} motivoNoCerrable={motivo} nDiferidos={null} />,
    );
    expect(html).toContain(" disabled=\"\"");
    expect(html).toContain(motivo);
  });
  it("mes cerrado: solo «Reabrir mes» (ADMIN); sin rol para nada ⇒ nada", () => {
    const html = renderToStaticMarkup(
      <CierreMesAcciones mes="2026-09" cerrado ofreceCerrar={false} ofreceReabrir motivoNoCerrable={null} nDiferidos={5} />,
    );
    expect(html).toContain("Reabrir mes");
    expect(html).not.toContain("Cerrar septiembre");
    expect(
      renderToStaticMarkup(
        <CierreMesAcciones mes="2026-09" cerrado ofreceCerrar={false} ofreceReabrir={false} motivoNoCerrable={null} nDiferidos={5} />,
      ),
    ).toBe("");
  });
});

describe("cableado del diálogo de cierre (las reglas viven en lib/admin/cierre-mes.ts, con su test)", () => {
  const src = leer("src/components/admin/reportes/cierre-mes-acciones.tsx");
  it("manda los ids que se VIERON (vuelos_esperados) y decide con decidirRespuestaCerrar", () => {
    expect(src).toMatch(/cerrarMesAction\(\s*mes,\s*previa\.vuelos_que_pasan\.map\(\(v\) => v\.id\),?\s*\)/);
    expect(src).toContain("decidirRespuestaCerrar(r, mes)");
    expect(src).toMatch(/d\.tipo === "previa_nueva"[\s\S]*setEntiendo\(false\)/);
  });
  it("confirmar exige puedeConfirmarCierre (previa lista + casilla) y no hay otro camino al POST", () => {
    expect(src).toContain("disabled={!puedeConfirmar || enviando}");
    expect(src).toContain("if (!previa || !puedeConfirmar || enviandoRef.current) return;");
    expect(src.match(/cerrarMesAction\(/g)).toHaveLength(1);
    expect(src.match(/reabrirMesAction\(/g)).toHaveLength(1);
  });
  it("reabrir: texto vía mensajeErrorCierre y refresca al cerrar tras un rechazo (estado rancio)", () => {
    expect(src).toContain('setError(mensajeErrorCierre(r, "reabrir", mes))');
    const reabrir = src.slice(src.indexOf("function DialogoReabrir"));
    expect(reabrir).toMatch(/refrescarAlCerrar\.current = true;\s*\n\s*setError\(mensajeErrorCierre/);
    expect(reabrir).toMatch(/if \(!v && refrescarAlCerrar\.current\) \{[\s\S]*router\.refresh\(\)/);
  });
  it("la tabla de los que VIENEN no rotula sus montos con el corte de este mes ni pinta «Cobrado después»", () => {
    expect(src).toContain('informativo ? "Cobrado al cerrar su mes"');
    expect(src).toContain('{!informativo && <th className="px-2 py-1 text-right font-medium">Cobrado después</th>}');
  });
  it("caso #351: «Cobrado después» lleva la fecha del cobro y la descripción dice la regla", () => {
    expect(src).toContain("{textoCobradoPosterior(v)}");
    expect(src).toContain("{textoDescripcionCerrar(mes, destino)}");
    expect(src).not.toContain("y se reparten cuando se cobren");
  });
  it("Reportes da 300 s a sus server actions (el cierre corre pre-cierre + 2 repartos)", () => {
    expect(leer("src/app/admin/reportes/page.tsx")).toMatch(/^export const maxDuration = 300;$/m);
  });
});

describe("reparto: estado del mes y listas (texto del API)", () => {
  const cierre = {
    disponible: true,
    periodo: "2026-09",
    estado: "CERRADO" as const,
    cerrado_at: "2026-10-16T19:02:00Z",
    cerrado_por_nombre: "Ale",
    coincide_con_snapshot: false,
    diferidos_salen: [
      {
        id: "v316",
        folio: 316,
        cliente: "Mike Nelson",
        matricula: "N990GG",
        venta_usd: 2076.4,
        destino: "2026-10",
        leyenda: "Pasa a octubre 2026 · pendiente de cobro: cobrado $0.00 de $2,076.40 USD",
      },
    ],
  };
  it("badge, aviso rojo de snapshot y bloque «Pasan a octubre 2026 (sin cobro completo al 30-sep, no se reparten)»", () => {
    const html = renderToStaticMarkup(<CierreRepartoAviso cierre={cierre} />);
    expect(html).toContain("Cerrado el 16-oct-2026 por Ale");
    expect(html).toContain("Los números de hoy no coinciden con el cierre del 16-oct-2026");
    expect(html).toContain("Pasan a octubre 2026 (sin cobro completo al 30-sep, no se reparten)");
    expect(html).toContain("#316 · Mike Nelson · N990GG · $2,076.40 USD");
    expect(html).toContain('data-chip-cierre="pasa"');
  });
  it("por avión: solo los de su matrícula", () => {
    expect(renderToStaticMarkup(<CierreRepartoAvion cierre={cierre} matricula="N990GG" />)).toContain("#316");
    expect(renderToStaticMarkup(<CierreRepartoAvion cierre={cierre} matricula="N621TX" />)).toBe("");
  });
  it("caso #351: los que pasarían ya cobrados después del corte no se rotulan «pendientes de cobro»", () => {
    const html = renderToStaticMarkup(
      <CierreRepartoAviso
        cierre={{
          disponible: true,
          periodo: "2026-09",
          estado: "ABIERTO",
          pendientes_que_pasarian: [
            {
              id: "v351",
              folio: 351,
              cliente: "Cliente 351",
              matricula: "XA-VGV",
              venta_usd: 2343.2,
              destino: "2026-10",
              motivo: "COBRO_POSTERIOR",
              cobrado_posterior_usd: 2343.2,
              fecha_cobro_posterior: "2026-10-14",
              leyenda: "Pasará a octubre 2026 al cerrar · cobrado el 14-oct, después del 30-sep (al 30-sep: $0.00 de $2,343.20 USD)",
            },
          ],
        }}
      />,
    );
    expect(html).toContain("Pasarán a octubre 2026 al cerrar el mes (sin cobro completo al 30-sep)");
    expect(html).toContain("cobrado el 14-oct, después del 30-sep");
    expect(html).toContain('data-chip-cierre="pasaria"');
    expect(html).not.toMatch(/pendientes? de cobro/i);
  });
  it("por avión (compacta): la leyenda del API queda en el title de cada línea", () => {
    expect(renderToStaticMarkup(<CierreRepartoAvion cierre={cierre} matricula="N990GG" />)).toContain(
      'title="Pasa a octubre 2026 · pendiente de cobro: cobrado $0.00 de $2,076.40 USD"',
    );
  });
  it("API previo (sin `cierre`) ⇒ nada", () => {
    expect(renderToStaticMarkup(<CierreRepartoAviso cierre={undefined} />)).toBe("");
    expect(renderToStaticMarkup(<CierreRepartoAviso cierre={{ ...cierre, disponible: false }} />)).toBe("");
  });
});

describe("pre-cierre, reportes y libro en pantalla", () => {
  it("el pre-cierre pinta la leyenda de cada vuelo y el estado del mes", () => {
    const src = leer("src/components/admin/reportes/pre-cierre-card.tsx");
    expect(src).toContain("lineasLeyendaPreCierre(");
    expect(src).toContain("<ChipEstadoCierre badge={textoBadgeCierrePeriodo(data.cierre)}");
  });
  it("Reportes monta la card del cierre en su propio Suspense", () => {
    const src = leer("src/app/admin/reportes/page.tsx");
    expect(src).toMatch(/<Suspense key=\{`cierre:\$\{desde\}:\$\{hasta\}`\} fallback=\{<CierreMesCardCargando \/>\}>/);
  });
  it("el balance en pantalla pinta el estado del cierre del libro", () => {
    const src = leer("src/app/admin/reportes/balance/page.tsx");
    expect(src).toContain("textoBadgeCierrePeriodo(libro.cierre)");
  });
});

describe("aviso 409 MES_CERRADO en los formularios de captura", () => {
  const FORMULARIOS = [
    "src/components/admin/expenses/expense-create-dialog.tsx",
    "src/components/admin/expenses/expense-verify-dialog.tsx",
    "src/components/admin/expenses/expense-actions.tsx",
    "src/components/admin/expenses/reparto-dialog.tsx",
    "src/components/admin/flights/cobro-form-sheet.tsx",
    "src/components/admin/flights/cobros-card.tsx",
    "src/components/admin/quotes/quote-cobros-card.tsx",
    "src/components/admin/quotes/quote-calculator.tsx",
    "src/components/admin/ingresos/registrar-ingreso-dialog.tsx",
    "src/components/admin/ingresos/baja-ingreso-dialog.tsx",
    "src/components/admin/ingresos/cobro-desde-abono-dialog.tsx",
    "src/components/admin/ingresos/aplicar-anticipo-dialog.tsx",
    "src/components/admin/caja-chica/movimiento-dialog.tsx",
    "src/components/admin/caja-chica/movimiento-actions.tsx",
    "src/components/admin/profit-sharing/entrega-socio-dialog.tsx",
    "src/components/admin/profit-sharing/eliminar-entrega-dialog.tsx",
    "src/components/admin/conciliacion/corregir-fecha-gasto-dialog.tsx",
  ];
  it.each(FORMULARIOS)("%s usa toastMesCerradoSiAplica", (rel) => {
    expect(leer(rel)).toContain("toastMesCerradoSiAplica(");
  });
  it("las actions de Gastos y Caja chica conservan `code`/`details` del MES_CERRADO", () => {
    expect(leer("src/app/admin/expenses/actions.ts")).toMatch(/err\.code === CODIGO_MES_CERRADO \? \{ code: err\.code, details: err\.details/);
    expect(leer("src/app/admin/caja-chica/actions.ts")).toMatch(/err\.code === CODIGO_MES_CERRADO \? \{ code: err\.code, details: err\.details/);
  });
});
