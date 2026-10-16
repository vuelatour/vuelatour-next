/**
 * Candado 409 `MES_CERRADO` (16-oct-2026, API 0.0.88) en los formularios:
 * se reconoce por el CÓDIGO, el texto es el del API tal cual y el enlace
 * lleva a Reportes con el mes completo (donde ADMIN ve «Reabrir mes»).
 */
import { describe, expect, it } from "vitest";
import {
  CODIGO_MES_CERRADO,
  avisoMesCerrado,
  detallesMesCerrado,
  esMesCerrado,
  hrefReabrir,
  textoMesCerradoRespaldo,
} from "@/lib/admin/mes-cerrado";
import { decidirErrorRevise } from "@/lib/admin/quote-revise-errores";
import { resultadoCorregirFecha } from "@/lib/admin/conciliacion-fecha-gasto";

const TEXTO_API = "Septiembre 2026 ya está cerrado (Ale, 16-oct). Reábrelo en Reportes para corregir.";
const DETAILS = {
  periodo: "2026-09",
  cerrado_at: "2026-10-16T19:02:00Z",
  cerrado_por: { id: "u1", nombre: "Ale" },
  registro: "gasto",
};
const RECHAZO = { ok: false, error: TEXTO_API, code: CODIGO_MES_CERRADO, details: DETAILS, status: 409 };

describe("esMesCerrado", () => {
  it("por el código; un ok:true nunca lo es", () => {
    expect(esMesCerrado(RECHAZO)).toBe(true);
    expect(esMesCerrado({ ...RECHAZO, ok: true })).toBe(false);
    expect(esMesCerrado({ ok: false, error: TEXTO_API })).toBe(false);
    expect(esMesCerrado({ ok: false, code: "COTIZACION_COBRADA" })).toBe(false);
    expect(esMesCerrado(null)).toBe(false);
  });
});

describe("avisoMesCerrado", () => {
  it("texto del API tal cual + enlace al mes completo en Reportes", () => {
    expect(avisoMesCerrado(RECHAZO)).toEqual({
      texto: TEXTO_API,
      href: "/admin/reportes?desde=2026-09-01&hasta=2026-09-30",
      periodo: "2026-09",
    });
  });
  it("un ApiError (`message`) también sirve", () => {
    expect(avisoMesCerrado({ code: CODIGO_MES_CERRADO, message: TEXTO_API, details: DETAILS })?.texto).toBe(TEXTO_API);
  });
  it("sin message ⇒ texto de respaldo con el periodo; sin periodo ⇒ sin enlace", () => {
    expect(avisoMesCerrado({ ok: false, code: CODIGO_MES_CERRADO, details: DETAILS })?.texto).toBe(
      "Septiembre 2026 ya está cerrado. Reábrelo en Reportes para corregir.",
    );
    expect(avisoMesCerrado({ ok: false, code: CODIGO_MES_CERRADO, error: TEXTO_API })).toEqual({
      texto: TEXTO_API,
      href: null,
      periodo: null,
    });
    expect(textoMesCerradoRespaldo(null)).toBe("Ese mes ya está cerrado. Reábrelo en Reportes para corregir.");
  });
  it("cualquier otro error ⇒ null (el formulario pinta su toast de siempre)", () => {
    expect(avisoMesCerrado({ ok: false, error: "x", code: "OTRO" })).toBeNull();
  });
});

describe("detallesMesCerrado / hrefReabrir", () => {
  it("valida el periodo", () => {
    expect(detallesMesCerrado(DETAILS)).toEqual({
      periodo: "2026-09",
      cerrado_at: "2026-10-16T19:02:00Z",
      cerrado_por: { id: "u1", nombre: "Ale" },
      registro: "gasto",
    });
    expect(detallesMesCerrado({ periodo: "2026-9" })).toBeNull();
    expect(detallesMesCerrado("x")).toBeNull();
    expect(hrefReabrir("2026-02")).toBe("/admin/reportes?desde=2026-02-01&hasta=2026-02-28");
    expect(hrefReabrir(null)).toBeNull();
  });
});

describe("el 409 MES_CERRADO no se confunde con otros 409", () => {
  it("cotizador: NO es «la cotización cambió mientras editabas»", () => {
    expect(decidirErrorRevise(RECHAZO)).toEqual({ tipo: "mes_cerrado", mensaje: TEXTO_API });
    // Otro 409 sigue siendo de versión.
    expect(decidirErrorRevise({ ok: false, status: 409, error: "otra versión" }).tipo).toBe("version");
  });
  it("corregir la fecha del gasto: bloquea esa fecha con el texto del API", () => {
    expect(resultadoCorregirFecha(RECHAZO)).toEqual({ tipo: "bloqueo", texto: TEXTO_API });
  });
});
