import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CANDADOS DE CABLEADO del cotizador para «la cotización es independiente de
 * la operación — tramos» (22-sep-2026, caso #326).
 *
 * La REGLA vive y se prueba en `lib/admin/tramos-cotizados.ts`
 * (`__tests__/tramos-cotizados.test.ts`); lo que se vigila aquí es que el
 * cotizador siga ENCHUFADO a ella, porque las tres formas de romper el
 * arreglo no son un cambio de lógica sino un cambio de cableado:
 *
 *  1. volver a rehidratar los tramos de `q.escalas` (la escala VIVA) ⇒ el
 *     total salta solo al teclear el T.C. — el bug del cliente;
 *  2. mandar `tramos_base` a `/calculate` ⇒ 400 en cada tecla
 *     (`forbidNonWhitelisted` en `main.ts` del API);
 *  3. que el aviso ámbar GUARDE en lugar de solo cargar los tramos vivos ⇒
 *     un precio nuevo persistido sin que nadie lo viera.
 *
 * Se lee el archivo en vez de montar el componente a propósito: montar
 * `QuoteCalculator` exige router, portales y `localStorage`, y lo que
 * importa aquí es justamente el cableado, no el render.
 */

const SRC = path.resolve(__dirname, "..", "quote-calculator.tsx");
const fuente = readFileSync(SRC, "utf8");

describe("quote-calculator — hidratación de tramos", () => {
  it("el formulario arranca con los tramos COTIZADOS (fuente única)", () => {
    expect(fuente).toContain('from "@/lib/admin/tramos-cotizados"');
    expect(fuente).toContain("escalas: tramosDeCotizacion(q),");
  });

  it("ya NO rehidrata los tramos de la escala VIVA (el bug de #326)", () => {
    // La forma exacta que tenía el bug: filtrar `q.escalas` y mapearlas al
    // formulario. Si vuelve a aparecer, el total vuelve a moverse solo.
    expect(fuente).not.toMatch(/q\.escalas[\s\S]{0,200}?\.map\(\(e\) => tramoToEscala\(e\)\)/);
    expect(fuente).not.toContain("legacyLegs");
    expect(fuente).not.toContain("comercialSugerida");
  });
});

describe("quote-calculator — campo aditivo `tramos_base`", () => {
  it("viaja SOLO en el cuerpo de `revise`, nunca en el payload del motor", () => {
    const armar = fuente.slice(
      fuente.indexOf("function armarCalcPayload("),
      fuente.indexOf("/** uuid v4 para `client_request_id`"),
    );
    expect(armar.length).toBeGreaterThan(100);
    expect(armar).not.toContain("tramos_base");
    expect(fuente).toContain("...(conTramosBase ? { tramos_base: tramosBase } : {}),");
  });

  it("un API sin desplegar no tira el guardado… salvo que hubiera algo del piloto que pisar", () => {
    expect(fuente).toContain("esApiSinTramosBase(res)");
    expect(fuente).toContain("MSG_TRAMOS_BASE_API_VIEJO");
    // El reintento sin el campo solo procede sin divergencias.
    expect(fuente).toMatch(
      /if \(divergencias\.length > 0\) \{[\s\S]{0,120}setErrorTramosBase\(MSG_TRAMOS_BASE_API_VIEJO\);[\s\S]{0,40}return;/,
    );
  });
});

describe("quote-calculator — aviso «La operación cambió»", () => {
  it("el botón CARGA los tramos vivos y deja el formulario sucio; jamás guarda", () => {
    const fn =
      /const adoptarTramosDeOperacion = \(\) => \{[\s\S]*?\n {2}\};/.exec(fuente)?.[0] ?? "";
    expect(fn.length).toBeGreaterThan(100);
    expect(fn).toContain('setValue("escalas", tramosDeOperacion(initialQuote), { shouldDirty: true })');
    expect(fn).toContain('baseTramosRef.current = "OPERACION"');
    // Ni guarda ni abre el diálogo de guardar: el operador ve el total y decide.
    expect(fn).not.toContain("ejecutarRevision");
    expect(fn).not.toContain("abrirGuardar");
    expect(fn).not.toContain("reviseQuoteAction");
  });

  it("pasa por confirmación (regla del cliente) y el chip nunca se esconde", () => {
    expect(fuente).toContain("setActualizarOpsOpen(true)");
    expect(fuente).toContain("{ETIQUETA_ACTUALIZAR}");
    expect(fuente).toContain("chipOperacionCambio,");
  });

  it("en LECTURA se informa pero no se ofrece el botón", () => {
    const banda = fuente.slice(
      fuente.indexOf("{divergencias.length > 0 && ("),
      fuente.indexOf("¿Cotizar con los tramos que se volaron?"),
    );
    expect(banda.length).toBeGreaterThan(100);
    expect(banda).toContain("{avisoDivergencia}");
    expect(banda).toContain("{!lectura && (");
  });

  it("tras guardar o descartar se vuelve a la base COTIZADO", () => {
    const ocurrencias = fuente.match(/baseTramosRef\.current = "COTIZADO"/g) ?? [];
    expect(ocurrencias.length).toBeGreaterThanOrEqual(2);
  });
});

describe("quote-workspace — los toggles del PDF cruzan por `orden`", () => {
  const ws = readFileSync(
    path.resolve(__dirname, "..", "quote-workspace.tsx"),
    "utf8",
  );

  it("usa la MISMA fuente que el cotizador y nunca indexa la escala viva por posición", () => {
    expect(ws).toContain("tramosCotizadosDeCotizacion(quote)");
    // `escalasComerciales[idx]` era el cruce por POSICIÓN: con un tramo nuevo
    // o faltante en la operación patcheaba la escala equivocada.
    expect(ws).not.toContain("escalasComerciales[idx]");
    expect(ws).toContain("escalaVivaPorOrden.get(t.orden)");
  });
});
