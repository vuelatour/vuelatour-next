import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CANDADOS DE CABLEADO — «el vuelo ya voló: cambiar el avión de la
 * cotización es SOLO COMERCIAL» (24-sep-2026, caso #338 de producción).
 *
 * Se cotizó y se voló en el Seneca N4142R; ya COMPLETADO, la oficina guardó
 * la v2 con el Cessna 206 («se cobra como cessna, pidieron cessna»). El API
 * movió la cabecera del vuelo a XA-VGV y le mandó al piloto «Ahora vuela en
 * XA-VGV» de un vuelo que ya había aterrizado. La REGLA y los textos viven en
 * `lib/admin/avion-cotizado.ts` (probados en `lib/admin/__tests__/
 * avion-cotizado.test.ts`); aquí se vigila que el cotizador siga ENCHUFADO:
 *
 *  1. el diálogo «Guardar vN» y la nota junto al selector dicen que el
 *     cambio es solo de cobro (mismo texto, fuente única);
 *  2. «Se notificará a la tripulación» NUNCA sale para un vuelo ya volado;
 *  3. un 409 de squawk en un vuelo ya volado NO abre «Guardar de todas
 *     formas» (sería un API sin desplegar a punto de mover el vuelo);
 *  4. la nota de TALLER no pide «confírmalo con el mecánico» de un avión
 *     que solo se usa para cobrar;
 *  5. la card «Operación» enseña «Distinto al cotizado» y habla en pasado.
 *
 * Se lee el archivo en vez de montar el componente (mismo criterio que
 * `quote-calculator-tramos.test.ts`): montar `QuoteCalculator` exige router,
 * portales y `localStorage`, y lo que importa aquí es el cableado.
 */

const fuente = readFileSync(path.resolve(__dirname, "..", "quote-calculator.tsx"), "utf8");
const workspace = readFileSync(path.resolve(__dirname, "..", "quote-workspace.tsx"), "utf8");

describe("quote-calculator — vuelo ya volado", () => {
  it("usa la regla ÚNICA `estadoVueloVolado` y el texto ÚNICO del cambio de avión", () => {
    expect(fuente).toMatch(/const volado = useMemo\([\s\S]{0,120}?estadoVueloVolado\(initialQuote\)/);
    expect(fuente).toContain("const yaVolo = volado.yaVolo;");
    expect(fuente).toContain('const cambiaAvion = cambios.some((c) => c.clave === "aeronave");');
    expect(fuente).toMatch(
      /const avisoAvionVolado =\s*yaVolo && cambiaAvion && !values\.es_externo\s*\?\s*textoCambioAvionVueloVolado\(/,
    );
    // Ningún texto del caso redactado a mano en el componente.
    expect(fuente).not.toContain("Este vuelo ya voló");
  });

  it("la nota junto al selector (las DOS hojas) y el diálogo «Guardar vN» dicen lo mismo", () => {
    expect(fuente).toContain("avisoCambioAvion: avisoAvionVolado,");
    const dialogo = fuente.slice(
      fuente.indexOf("{avisaTripulacion && ("),
      fuente.indexOf("{derivaMotor && ("),
    );
    expect(dialogo.length).toBeGreaterThan(100);
    expect(dialogo).toContain("{avisoAvionVolado && (");
    expect(dialogo).toContain("{avisoAvionVolado}");
  });

  it("«Se notificará a la tripulación» espeja al API: avión/salida de un vuelo volado y todo lo de un viaje terminado NO avisan", () => {
    const aviso = /const avisaTripulacion =[\s\S]*?;\n/.exec(fuente)?.[0] ?? "";
    expect(aviso.length).toBeGreaterThan(50);
    // La regla vive en `cambiosTocanTripulacion` (quote-revision.test.ts).
    expect(aviso).toContain("cambiosTocanTripulacion(cambios, volado)");
    // Un viaje de varios días a medio camino sí avisa del regreso.
    expect(aviso).toContain('initialQuote.estado === "EN_VUELO"');
  });

  it("las fechas de un vuelo volado se anuncian en el diálogo ANTES de guardar", () => {
    expect(fuente).toContain("avisoFechasVueloVolado(cambios, volado)");
    const dialogo = fuente.slice(
      fuente.indexOf("{avisaTripulacion && ("),
      fuente.indexOf("{derivaMotor && ("),
    );
    expect(dialogo).toContain("{avisoFechasVolado}");
  });

  it("la nota tenue habla en pasado («Voló en …») cuando el vuelo ya voló", () => {
    expect(fuente).toMatch(/fraseOperaEn\([\s\S]{0,300}?\{ yaVolo \},?\s*\)/);
  });

  it("un 409 de squawk con el vuelo ya volado se FRENA: nunca «Guardar de todas formas»", () => {
    const i = fuente.indexOf('if (decision.tipo === "squawk" && yaVolo) {');
    const j = fuente.indexOf('if (decision.tipo === "squawk") {');
    expect(i).toBeGreaterThan(-1);
    // La rama del vuelo ya volado va ANTES que la que abre el diálogo.
    expect(j).toBeGreaterThan(i);
    const rama = fuente.slice(i, j);
    expect(rama).toContain("setErrorTramosBase(MSG_AVION_VUELO_VOLADO_API_VIEJO);");
    expect(rama).toContain("setSquawkRevise(null);");
    expect(rama).not.toContain("setSquawkRevise({");
    expect(rama).not.toContain("ejecutarRevision(");
    expect(rama).toContain("return;");
  });

  it("la nota de TALLER no se pinta para un avión que solo sirve para cobrar", () => {
    expect(fuente).toContain(
      "const avionEnTaller = selectedAircraft?.en_taller && !yaVolo ? selectedAircraft : null;",
    );
  });

  it("la confirmación de un CONFIRMADO ya volado no promete aviso a la tripulación", () => {
    // `yaVolo` y `termino` salen de la MISMA fuente única (espejo del API):
    // a medio camino el regreso pendiente sí avisa.
    expect(fuente).toContain("const v = estadoVueloVolado(initialQuote);");
    expect(fuente).toContain("yaVolo: v.yaVolo,");
    expect(fuente).toContain("termino: v.termino,");
  });
});

describe("quote-workspace — card «Operación»", () => {
  it("cotizado vs utilizado con «Distinto al cotizado» y la ayuda de la fuente única", () => {
    expect(workspace).toContain("const yaVolo = vueloYaVolo(quote);");
    expect(workspace).toContain("{ETIQUETA_DISTINTO_AL_COTIZADO}");
    expect(workspace).toContain(
      "hint={hintAeronaveUtilizada({ difieren: aeronaves.difieren, yaVolo })}",
    );
    // La utilizada sigue saliendo de `aeronavesDeCotizacion` (lee
    // `aeronave_utilizada` del API: el avión con el que se voló).
    expect(workspace).toContain("const aeronaves = aeronavesDeCotizacion(quote, aircraft);");
    expect(workspace).not.toContain('"Opera en un avión distinto al cotizado');
  });
});
