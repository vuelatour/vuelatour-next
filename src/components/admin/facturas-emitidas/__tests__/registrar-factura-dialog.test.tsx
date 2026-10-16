/**
 * «Registrar factura» / «Editar factura» con las casillas «¿Qué cobros cubre
 * esta factura?» (16-oct-2026, API 0.0.82, invariante 84 del API) y el
 * selector de vuelos con «Tiene A-0420». El diálogo vive en un portal (el
 * render de servidor no lo pinta) y el proyecto no tiene DOM de pruebas: la
 * REGLA (prefill, hidratación, resumen, textos) se prueba en
 * `lib/admin/__tests__/cobro-factura.test.ts`; aquí se vigila el CABLEADO en
 * el código, como `cobros-card-editar.test.tsx`.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { VueloCandidatoFactura } from "@/types/facturas-emitidas";

vi.mock("@/lib/api/facturas-emitidas-browser", () => ({
  buscarVuelosCandidatos: async () => ({ ok: true, data: [] }),
}));

const { vueloDeCandidato } = await import("../selector-vuelos-factura");

const leer = (archivo: string) => readFileSync(path.resolve(__dirname, "..", archivo), "utf8");

const CANDIDATO: VueloCandidatoFactura = {
  id: "6f1825e3-0c54-45f1-bb66-d8f27a71fb7e",
  folio: 332,
  fecha_vuelo: "2026-09-21T14:00:00+00:00",
  estado: "COMPLETADO",
  cliente_id: "c-1",
  cliente_nombre: "Beh Kay",
  cliente_rfc: null,
  total: { usd: 4172.44, mxn: 72585.38 },
  facturas_vigentes: ["A-0420"],
  solicitud: false,
  grupo: null,
};

describe("selector de vuelos", () => {
  it("un candidato CON `cobros` los conserva; SIN la llave (API previo) queda `null` (hidratado, sin casillas)", () => {
    const cobros = [
      {
        id: "4e938868",
        vuelo_id: CANDIDATO.id,
        vuelo_folio: 332,
        monto: 68208,
        moneda: "MXN" as const,
        fecha_cobro: "2026-09-21T17:00:00.000Z",
        metodo_cobro: "TRANSFERENCIA",
        cuenta_destino: "Scotiabank Pesos",
        factura: { id: "f-0420", etiqueta: "A-0420" },
      },
    ];
    expect(vueloDeCandidato({ ...CANDIDATO, cobros }).cobros).toEqual(cobros);
    expect(vueloDeCandidato(CANDIDATO).cobros).toBeNull();
    expect(vueloDeCandidato(CANDIDATO).facturas_vigentes).toEqual(["A-0420"]);
  });

  it("chip informativo «Tiene A-0420» (ya no «Ya tiene»), hidrata también los vuelos sin `cobros` y no pisa lo que ya traían", () => {
    const src = leer("selector-vuelos-factura.tsx");
    expect(src).toContain("{textoTieneFactura(v.facturas_vigentes)}");
    expect(src).toContain("title={TITULO_TIENE_FACTURA}");
    expect(src).not.toContain("Ya tiene {");
    expect(src).toContain("(v) => v.grupo === undefined || v.cobros === undefined");
    expect(src).toContain("cobros: v.cobros ?? hid.cobros");
  });
});

describe("casillas «¿Qué cobros cubre esta factura?» (cableado)", () => {
  const src = leer("registrar-factura-dialog.tsx");

  it("un bloque por vuelo elegido con `cobros`, casilla por cobro, «ya tiene» deshabilitada y la nota del sobre", () => {
    expect(src).toContain("{hayCasillas && (");
    expect(src).toContain(".filter((v) => Array.isArray(v.cobros))");
    expect(src).toContain("{tituloCobrosDeVuelo(v.folio)}");
    expect(src).toContain("{textoCobroCandidato(c)}");
    expect(src).toContain("const otra = c.factura && c.factura.id !== idFacturaEdicion ? c.factura : null;");
    expect(src).toContain("const deshabilitada = bloqueado || casillasIncompletas || facturaNoVigente || otra != null;");
    expect(src).toContain("{textoYaTieneFactura(otra.etiqueta)}");
    expect(src).toContain("{TEXTO_VUELO_SIN_COBROS}");
    expect(src).toContain("{NOTA_SOBRE_DE_GRUPO}");
    expect(src).toContain('type="checkbox"');
    expect(src).toContain("data-cobro-casilla={c.id}");
  });

  it("prefill con la regla del backfill (alta, con el total tecleado) / los de esta factura (edición); se re-prellena solo sin casillas tocadas", () => {
    expect(src).toContain("prefillCobrosDeFactura(cobros, idFacturaEdicion, totalRef)");
    expect(src).toContain("!idFacturaEdicion && totalTecleado != null && monedaFactura");
    expect(src).toContain("!(prefillAplicadoRef.current.has(v.id) && casillasTocadas)");
    expect(src).toContain("setCasillasTocadas(true);");
    // Un vuelo quitado se lleva sus casillas.
    expect(src).toContain("for (const id of prev) if (conocidos.has(id)) next.add(id);");
    // Revisión: el updater de `setCobroIds` es PURO (React lo invoca dos
    // veces en desarrollo); qué vuelos se prellenan y el `ref.add` se
    // deciden ANTES, fuera del updater.
    const updater = src.slice(src.indexOf("setCobroIds((prev) => {"), src.indexOf("}, [vuelos, cobrosDeVuelos"));
    expect(updater).not.toContain("prefillAplicadoRef");
    expect(src).toContain("for (const v of aPrellenar) prefillAplicadoRef.current.add(v.id);");
    expect(src.indexOf("for (const v of aPrellenar) prefillAplicadoRef.current.add(v.id);")).toBeLessThan(
      src.indexOf("setCobroIds((prev) => {"),
    );
  });

  it("hidratación incompleta: todas apagadas con la nota y `cobro_ids` NO viaja (revisión #5)", () => {
    expect(src).toContain("const casillasIncompletas = hayCasillas && !cobrosHidratados(vuelos);");
    expect(src).toContain("{NOTA_COBROS_NO_CARGADOS}");
    expect(src).toContain("hidratados ? [...cobroIds] : undefined,");
    expect(src).toContain("const hidratados = cobrosHidratados(vuelos) && !facturaNoVigente;");
  });

  it("edición de una factura NO vigente: casillas apagadas con la nota y `cobro_ids` NO viaja (el API respondería 409)", () => {
    expect(src).toContain('const facturaNoVigente = editar && factura != null && factura.estatus !== "VIGENTE";');
    expect(src).toContain("{NOTA_FACTURA_NO_VIGENTE}");
    expect(src).toContain("{resumen && !casillasIncompletas && !facturaNoVigente && (");
  });

  it("pie con el resumen (ámbar no bloquea) y 409 de la liga en el banner con el texto de la fuente única", () => {
    expect(src).toContain("resumenMarcados(cobrosDeVuelos, cobroIds, totalTecleado, monedaFactura)");
    expect(src).toContain("data-resumen-marcados={resumen.tono}");
    expect(src).toContain("esCodigoCobroFactura(res.code)");
    expect(src).toContain("mensajeErrorCobroFactura(res.code,");
    // El resumen ámbar jamás deshabilita «Guardar».
    expect(src).toContain("const deshabilitarGuardar = guardando || leyendo || !!yaRegistrada;");
  });

  it("el switch «Factura parcial» se conserva con la ayuda nueva", () => {
    expect(src).toContain("Factura parcial (anticipo o finiquito)");
    expect(src).toContain("{AYUDA_FACTURA_PARCIAL}");
  });
});
