/**
 * CABLEADO de la «conciliación al revés» de una ENTRADA (15-oct-2026, API
 * 0.0.78, invariante 78), por regex sobre los fuentes (como el de Gastos): UNA
 * hoja por tabla y por tarjeta, el clic solo con `puedeVerDetalleBanco(rol)`,
 * la página pasa `rol`, la columna lleva `noLink`, el detalle `?ingreso=`
 * embebe el cuerpo con el MODO CONTROLADO del hook (ningún efecto llama
 * `abrir(`) y conserva «Desvincular del abono» con su confirmación, y
 * «Depósitos…» ya no define sus columnas a nivel de módulo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

const TABLAS = [
  ["Todos / Cobros de vuelos", "../entradas-table.tsx", "filaBancoDeEntrada(e)"],
  ["Otros ingresos", "../ingresos-table.tsx", "filaBancoDeIngreso(i)"],
  ["Anticipos", "../anticipos-table.tsx", "filaBancoDeIngreso(i)"],
  ["Depósitos de vuelos que aún no vuelan", "../depositos-por-volar-table.tsx", "filaBancoDeEntrada(e)"],
] as const;

describe.each(TABLAS)("la tabla «%s»", (_nombre, archivo, fila) => {
  const src = leer(archivo);

  it("UNA hoja y el clic solo con puedeVerDetalleBanco(rol)", () => {
    expect(src.match(/<EntradaBancoSheet /g)?.length).toBe(1);
    expect(src).toContain("const detalleBanco = useDetalleBancoEntrada();");
    expect(src).toContain("const abrirBanco = puedeVerDetalleBanco(rol) ? detalleBanco.abrir : null;");
    expect(src).toContain(`alAbrir={abrirBanco ? () => abrirBanco(${fila}) : undefined}`);
  });

  it("la columna «Conciliación» lleva noLink y abrirBanco entra a las dependencias de las columnas", () => {
    expect(src).toMatch(/key: "conciliacion",\s*header: "Conciliación",[\s\S]{0,200}noLink: true,/);
    expect(src).toMatch(/\[(filtros, )?abrirBanco\],?\s*\);/);
  });
});

describe("«Depósitos de vuelos que aún no vuelan»", () => {
  it("las columnas viven en un useMemo (ya no `const COLUMNS` de módulo)", () => {
    const src = leer("../depositos-por-volar-table.tsx");
    expect(src).not.toContain("const COLUMNS");
    expect(src).toContain("const columns = useMemo<Array<DataTableColumn<EntradaDinero>>>(");
  });
});

describe("la página de Ingresos", () => {
  it("pasa el rol (de /me) a las 4 tablas y al detalle", () => {
    const page = leer("../../../../app/admin/ingresos/page.tsx");
    expect(page.match(/rol=\{me\.rol \?\? null\}/g)?.length).toBe(5);
  });
});

describe("el detalle `?ingreso=`", () => {
  const src = leer("../ingreso-detalle-sheet.tsx");

  it("embebe el cuerpo SOLO para quien ve el banco, con el MODO CONTROLADO del hook", () => {
    expect(src).toContain("puedeVerDetalleBanco(rol)");
    expect(src).toContain('i.conciliacion.estado !== "NO_BANCARIO" && !i.baja ? filaBancoDeIngreso(i) : null');
    expect(src).toContain("useDetalleBanco({ pedir: pedirEntrada, clave: claveEntradaConAbono, fija: filaBanco })");
    expect(src).toContain("<EntradaBancoDetalleDinamico");
    // Con un API ≤ 0.0.77 (sin la ruta) vuelve el bloque de siempre: nada se pierde en el skew.
    expect(src).toContain('banco.resultado?.ok === false && banco.resultado.code === "RUTA_NO_DISPONIBLE"');
    // Ningún efecto del detalle llama abrir() (tres setState síncronos: ERROR en este repo).
    expect(src).not.toMatch(/useEffect\([\s\S]{0,400}abrir\(/);
    expect(src).not.toContain(".abrir(");
  });

  it("conserva «Desvincular del abono» con su confirmación y el badge del encabezado NO es botón", () => {
    expect(src.match(/Desvincular del abono/g)?.length).toBeGreaterThanOrEqual(2);
    expect(src).toContain('setConfirmar({ tipo: "desvincular" })');
    expect(src).toContain("<BadgeEstadoConciliacion estado={i.conciliacion.estado} />");
  });

  it("el enlace a «Por conciliar» es `hrefPorConciliarIngreso` (la misma URL de antes) y el texto ya no promete «se cruza solo»", () => {
    expect(src).toContain("hrefPorConciliarIngreso(i, todayCancun(), filtros)");
    expect(src).not.toContain("Todavía no aparece en ningún estado de cuenta importado");
  });
});

describe("las tarjetas «Cobros» del vuelo y de la cotización", () => {
  it.each([
    ["vuelo", "../../flights/cobros-card.tsx", "flightFolio"],
    ["cotización", "../../quotes/quote-cobros-card.tsx", "quoteFolio"],
  ] as const)("%s: UNA hoja y el badge con `alAbrir`", (_n, archivo, folio) => {
    const src = leer(archivo);
    expect(src.match(/<EntradaBancoSheet /g)?.length).toBe(1);
    expect(src).toContain("const detalleBanco = useDetalleBancoEntrada();");
    expect(src).toContain("const abrirBanco = puedeVerDetalleBanco(rol) ? detalleBanco.abrir : null;");
    expect(src).toContain(`abrirBanco(filaBancoDeCobroVuelo(c, { folio: ${folio}, cliente: clienteNombre }))`);
  });
});

describe("la hoja", () => {
  const hoja = leer("../entrada-banco-sheet.tsx");

  it("el hook genérico con la entrada; el cuerpo con next/dynamic sin SSR; las llaves de MÓDULO", () => {
    expect(hoja).toContain("export const pedirEntrada = (f: EntradaBancoFila) => conciliacionDeEntradaAction(f.origen, f.id);");
    expect(hoja).toContain("export const claveEntrada = (f: EntradaBancoFila) => `${f.origen}:${f.id}`;");
    expect(hoja).toContain('`${f.origen}:${f.id}:${f.movimiento_id ?? ""}`');
    expect(hoja).toContain("useDetalleBanco({ pedir: pedirEntrada, clave: claveEntrada })");
    expect(hoja).toMatch(/dynamic\(\s*\(\) => import\("\.\/entrada-banco-detalle"\)[\s\S]{0,120}ssr: false/);
    expect(hoja).toContain('className="w-full p-0 sm:max-w-xl data-[side=right]:sm:max-w-xl"');
  });
});

describe("Conciliación con la línea del cobro enfocada", () => {
  it("la página pasa `cobroResaltado` y la tabla destaca su línea del lote", () => {
    const page = leer("../../../../app/admin/conciliacion/page.tsx");
    expect(page).toContain("cobroResaltado={enfoque.cobro}");
    expect(page).toContain("textoMovimientoNoEncontrado(enfoque)");
    const tabla = leer("../../conciliacion/movimientos-table.tsx");
    expect(tabla).toContain("resumenLoteCobrosFila(m, { destacar: cobroResaltado })");
    expect(tabla).toContain("monedaPorCuenta, cobroResaltado, gastoResaltado, abreBalances]");
  });
});
