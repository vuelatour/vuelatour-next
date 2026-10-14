/**
 * Diálogo «Importar estado de cuenta» al re-subir un periodo ya importado
 * (13-oct-2026, API 0.0.75):
 *  1. las tres piezas sin hooks (vista previa, advertencias de la lectura y
 *     el detalle al terminar) pintadas con `renderToStaticMarkup`;
 *  2. el CABLEADO del diálogo por regex: vista previa con turno y clave,
 *     botones de `botonesImportacion`, `solo_enriquecer` solo en «Solo
 *     completar conceptos», advertencias bajo el archivo, la descripción
 *     PRIMERO en la tabla, no se cierra con `debeQuedarseAbierto` y el aviso
 *     de re-cruce con `TEXTO_SUGERIR_RECRUCE`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AdvertenciasParse,
  DetallesImportacion,
  VistaPreviaImportacionBox,
} from "../import-dialog-partes";
import type { VistaPreviaImportacion } from "@/types/conciliacion";

const VP: VistaPreviaImportacion = {
  total: 98,
  ya_estaban: 96,
  nuevos: 2,
  nuevos_mismo_dia_y_monto: 2,
  se_enriquecen: 70,
  enriquecimiento_omitidos: 2,
  moneda: "MXN",
  omitidos: [
    {
      motivo: "GEMELOS",
      fecha: "2026-09-07",
      tipo: "CARGO",
      monto: 1118.12,
      moneda: "MXN",
      movimiento_ids: ["a", "b"],
      conceptos: [],
      facturas: ["Factura 7350", "Factura 7351"],
    },
  ],
  nuevos_detalle: [
    { orden_archivo: 40, fecha: "2026-09-21", tipo: "CARGO", monto: 16, descripcion: "04266QGJ580051065430", mismo_dia_y_monto: true },
    { orden_archivo: 41, fecha: "2026-09-21", tipo: "CARGO", monto: 1017, descripcion: "04266QF5580051069411", mismo_dia_y_monto: true },
  ],
  enriquecibles_detalle: [],
};

describe("piezas del diálogo", () => {
  it("VistaPreviaImportacionBox: título, líneas, aviso y las nuevas con «misma fecha y monto»", () => {
    const html = renderToStaticMarkup(<VistaPreviaImportacionBox vp={VP} />);
    expect(html).toContain('data-vista-previa="aviso"');
    expect(html).toContain("Antes de importar: 98 líneas");
    expect(html).toContain("96 ya estaban importadas (no se duplican)");
    expect(html).toContain("a 70 se les agregará el concepto del banco");
    expect(html).toContain("2 del mismo día y monto no recibirán concepto (no se sabe cuál es cuál)");
    expect(html).toContain("2 nuevas");
    expect(html.split("misma fecha y monto</span>").length - 1).toBe(2);
    expect(html).toContain("usa «Solo completar conceptos»");
  });

  it("AdvertenciasParse: recuadro ámbar con hasta 10; sin avisos no se pinta", () => {
    const muchas = Array.from({ length: 12 }, (_, i) => `aviso ${i + 1}`);
    const html = renderToStaticMarkup(<AdvertenciasParse advertencias={muchas} />);
    expect(html).toContain("Revisa antes de importar:");
    expect(html.split("<li").length - 1).toBe(10);
    expect(html).not.toContain("aviso 11");
    expect(renderToStaticMarkup(<AdvertenciasParse advertencias={[]} />)).toBe("");
    expect(renderToStaticMarkup(<AdvertenciasParse advertencias={undefined} />)).toBe("");
  });

  it("DetallesImportacion: los bloques en text-[11px]; sin nada que decir no se pinta", () => {
    const html = renderToStaticMarkup(
      <DetallesImportacion
        job={{
          estado: "LISTO",
          enriquecimiento_omitidos: 2,
          enriquecimiento: { omitidos: VP.omitidos },
          no_encontrados: 1,
          no_encontrados_detalle: [
            { orden_archivo: 3, fecha: "2026-09-21", tipo: "CARGO", monto: 16, moneda: "MXN", descripcion: "SEL PAGO DE SERVICIOS", referencia: null, factura: null },
          ],
        }}
      />,
    );
    expect(html).toContain("data-detalles-importacion");
    expect(html).toContain('<ul class="text-[11px]');
    expect(html).toContain("Sin concepto (mismo día y monto):");
    expect(html).toContain("el archivo dice Factura 7350 y Factura 7351");
    expect(html).toContain("No se encontraron (NO se agregaron):");
    expect(renderToStaticMarkup(<DetallesImportacion job={{ estado: "LISTO" }} />)).toBe("");
  });
});

describe("cableado de import-dialog.tsx (regex sobre el fuente)", () => {
  const src = readFileSync(path.resolve(__dirname, "../import-dialog.tsx"), "utf8");

  it("vista previa con clave, turno y .catch (nunca un await desnudo); la caja ARRIBA de la tabla", () => {
    expect(src).toMatch(/const claveVista =[\s\S]{0,200}`\$\{cuentaId\}\|\$\{archivo\?\.filename \?\? ""\}\|\$\{parsed\.total\}/);
    expect(src).toMatch(/const turno = \+\+turnoVista\.current;[\s\S]{0,200}vistaPreviaImportAction\([\s\S]{0,120}\.catch\(/);
    expect(src).toContain("if (turno === turnoVista.current) setVista({ clave: claveVista, r });");
    expect(src.indexOf("<VistaPreviaImportacionBox")).toBeGreaterThan(-1);
    expect(src.indexOf("<VistaPreviaImportacionBox")).toBeLessThan(src.indexOf("<table"));
  });

  it("los botones salen de botonesImportacion y «Solo completar conceptos» manda solo_enriquecer", () => {
    expect(src).toContain("const botones = botonesImportacion(vp);");
    expect(src).toMatch(/botones\.map\(\(b\) => \([\s\S]{0,300}className="cursor-pointer"[\s\S]{0,120}onClick=\{\(\) => onImport\(b\.accion\)\}/);
    expect(src).toContain('...(accion === "SOLO_CONCEPTOS" ? { solo_enriquecer: true } : {})');
    expect(src).toContain("movimientosParaImportar(parsed)");
  });

  it("advertencias bajo el archivo y la descripción PRIMERO en la tabla, con tooltip", () => {
    expect(src).toContain("<AdvertenciasParse advertencias={parsed.advertencias} />");
    expect(src).toContain('[m.descripcion, m.referencia].filter(Boolean).join(" · ")');
    expect(src).not.toContain("[m.referencia, m.descripcion]");
    expect(src).toMatch(/title=\{\[m\.descripcion, m\.referencia\]/);
  });

  it("con algo que leer NO se cierra (y queda solo «Cerrar»); el re-cruce usa TEXTO_SUGERIR_RECRUCE", () => {
    expect(src).toMatch(/if \(debeQuedarseAbierto\(st\.data\)\) \{[\s\S]{0,120}router\.refresh\(\);[\s\S]{0,60}toast\.info\(res\.titulo\);[\s\S]{0,40}return;/);
    expect(src).toContain("<DetallesImportacion job={job} />");
    expect(src).toContain("{BOTON_CERRAR_IMPORTACION}");
    expect(src).toContain("{TEXTO_SUGERIR_RECRUCE}");
    expect(src).toContain("{DESCRIPCION_IMPORT_REPETIDO}");
  });
});
