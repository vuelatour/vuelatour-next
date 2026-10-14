/**
 * CABLEADO de la «conciliación al revés» (13-oct-2026, API 0.0.75), por regex
 * sobre los fuentes: Gastos monta UNA hoja y da el clic solo a quien concilia;
 * la hoja pide con turno y `.catch` (jamás un `await` desnudo en una
 * transición), descarga con `abrirArchivoFirmado` y carga su cuerpo con
 * `next/dynamic`; Compras usa el MISMO badge; `?banco=` se conserva y el
 * Excel lleva su título a quien recibe el detalle del banco.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

describe("Gastos", () => {
  const tabla = leer("../expenses-table.tsx");

  it("UNA hoja por tabla y el clic solo con puedeVerDetalleBancoGasto(rol)", () => {
    expect(tabla.match(/<GastoBancoSheet /g)?.length).toBe(1);
    expect(tabla).toContain("const detalleBanco = useDetalleBancoGasto();");
    expect(tabla).toContain("const abrirBanco = puedeVerDetalleBancoGasto(rol) ? detalleBanco.abrir : null;");
    expect(tabla).toContain("alAbrir={abrirBanco ? () => abrirBanco(f.gasto) : undefined}");
  });

  it("la columna «Banco» lleva noLink (como «Facturación») y abrirBanco entra a las dependencias", () => {
    expect(tabla).toMatch(/key: "banco",[\s\S]{0,200}noLink: true,/);
    expect(tabla).toContain("[aircraft, providers, fotoUrls, seleccion, rol, abrirBanco]");
  });

  it("FILTROS_URL conserva ?banco= y el Excel lleva su título por rol", () => {
    const page = leer("../../../../app/admin/expenses/page.tsx");
    expect(page).toMatch(/const FILTROS_URL = \[[\s\S]*?"banco",[\s\S]*?\] as const;/);
    expect(page).toContain("title={tituloExcelGastos(me?.rol ?? null)}");
  });
});

describe("la hoja", () => {
  const hoja = leer("../gasto-banco-sheet.tsx");

  it("pide con turno y .catch, nunca con un await dentro de start(", () => {
    expect(hoja).toMatch(/const n = \+\+turno\.current;[\s\S]{0,80}setCarga\(null\);[\s\S]{0,80}void conciliacionDeGastoAction\(g\.id\)\s*\.catch\(sinConexion\)/);
    expect(hoja).toContain("if (turno.current === n) setCarga({ id: g.id, r });");
    expect(hoja).not.toMatch(/start\w*\(async/);
    expect(hoja).not.toContain("useTransition");
  });

  it("descarga con abrirArchivoFirmado y el cuerpo con next/dynamic sin SSR", () => {
    expect(hoja).toContain("abrirArchivoFirmado(");
    expect(hoja).toContain("estadoCuentaUrlAction(id).catch(sinConexion)");
    expect(hoja).toMatch(/dynamic\(\s*\(\) => import\("\.\/gasto-banco-detalle"\)[\s\S]{0,120}ssr: false/);
  });

  it("cerrar no vacía la fila (la animación de salida conserva el texto)", () => {
    const cerrar = hoja.slice(hoja.indexOf("const cerrar = useCallback"), hoja.indexOf("const reintentar"));
    expect(cerrar).toContain("turno.current += 1;");
    expect(cerrar).toContain("setAbierto(false);");
    expect(cerrar).not.toContain("setFila(");
    expect(cerrar).not.toContain("setCarga(");
  });
});

describe("Compras", () => {
  it("el MISMO BancoBadge (adiós «✓ Conciliado») y una hoja por card", () => {
    const card = leer("../../inventory/compras/compra-pagos-card.tsx");
    expect(card).toContain("<BancoBadge gasto={p} alAbrir={abrirBanco ? () => abrirBanco(p) : undefined} />");
    expect(card).not.toContain("✓ Conciliado");
    expect(card.match(/<GastoBancoSheet /g)?.length).toBe(1);
    expect(card).toContain("puedeVerDetalleBancoGasto(rolUsuario)");
  });

  it("la página pasa el rol (de /me, que puede fallar sin tumbarla)", () => {
    const page = leer("../../../../app/admin/inventory/compras/[id]/page.tsx");
    expect(page).toContain("getMe().catch(() => null)");
    expect(page).toContain("rolUsuario={rolUsuario}");
  });
});
