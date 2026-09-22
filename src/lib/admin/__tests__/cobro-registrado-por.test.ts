import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  TITULO_REGISTRO_COBRO,
  textoRegistroCobro,
  type CobroConRegistro,
} from "@/lib/admin/cobros";

/**
 * «QUIÉN REGISTRÓ EL COBRO» en la lista de cobros (22-sep-2026, pedido del
 * cliente sobre la card «Cobro» del detalle del vuelo).
 *
 * El uuid `cobro_vuelo.registrado_por` lo resuelve a nombre el API (en lote)
 * y lo manda como `registrado_por_nombre`. Lo que se prueba aquí es la
 * frontera del panel: el campo es ADITIVO (un API previo no lo manda y la
 * card queda EXACTAMENTE como estaba) y nunca se inventa ni se delata un
 * nombre — sin nombre, no hay renglón.
 */
describe("textoRegistroCobro", () => {
  it("con nombre resuelto: la frase que ve la oficina", () => {
    // 184 de los 207 cobros de producción los capturó esta usuaria.
    expect(textoRegistroCobro({ registrado_por_nombre: "Itzi" })).toBe("Registró: Itzi");
    expect(textoRegistroCobro({ registrado_por_nombre: "Pablo Canales" })).toBe(
      "Registró: Pablo Canales",
    );
  });

  it("API previo (campo ausente): no se pinta nada — la card no cambia", () => {
    const cobroViejo: CobroConRegistro = {};
    expect(textoRegistroCobro(cobroViejo)).toBeNull();
    expect(textoRegistroCobro(undefined)).toBeNull();
    expect(textoRegistroCobro(null)).toBeNull();
  });

  it("usuario borrado o sin nombre: null, jamás un «—» ni un nombre inventado", () => {
    expect(textoRegistroCobro({ registrado_por_nombre: null })).toBeNull();
    expect(textoRegistroCobro({ registrado_por_nombre: "" })).toBeNull();
    expect(textoRegistroCobro({ registrado_por_nombre: "   " })).toBeNull();
  });

  it("un uuid sin resolver NO es un nombre: no se pinta", () => {
    expect(
      textoRegistroCobro({ registrado_por_nombre: "3f1c9a2e-7b84-4d15-9f60-2a8c5e1b7d93" }),
    ).toBeNull();
  });

  it("normaliza espacios (el renglón es de una línea)", () => {
    expect(textoRegistroCobro({ registrado_por_nombre: "  Itzi  " })).toBe("Registró: Itzi");
    expect(textoRegistroCobro({ registrado_por_nombre: "Alejandro   Villalobos" })).toBe(
      "Registró: Alejandro Villalobos",
    );
  });

  it("sirve igual para el SOBRE de un grupo (misma llave del API)", () => {
    const sobre = { id: "s1", monto: 10800.76, registrado_por_nombre: "Itzi" };
    expect(textoRegistroCobro(sobre)).toBe("Registró: Itzi");
  });

  it("el tooltip aclara que registrar no es pagar", () => {
    expect(TITULO_REGISTRO_COBRO).toMatch(/capturó/i);
    expect(TITULO_REGISTRO_COBRO).toMatch(/no es quién lo pagó/i);
  });
});

/**
 * FUENTE ÚNICA del texto: las tres listas de cobros que ve el operador
 * (detalle del vuelo, cotizador y sobres del grupo) tienen que decir lo
 * MISMO, y eso no puede depender de que alguien copie bien la frase. El
 * sobre del grupo, además, no tiene NI UNA fila en producción: este guard
 * es hoy su única red.
 */
const SRC = path.resolve(__dirname, "..", "..", "..");
const CARDS = [
  "components/admin/flights/cobros-card.tsx",
  "components/admin/quotes/quote-cobros-card.tsx",
  "components/admin/grupos/detalle/grupo-cobros-card.tsx",
];

/** El código sin comentarios (ahí SÍ se cita la frase, como ejemplo). */
function codigoDe(rel: string): string {
  return readFileSync(path.join(SRC, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("«Registró: …» sale de la fuente única", () => {
  it.each(CARDS)("%s llama a textoRegistroCobro y no redacta la frase", (rel) => {
    const src = codigoDe(rel);
    expect(src).toContain("textoRegistroCobro(");
    expect(src).toContain("TITULO_REGISTRO_COBRO");
    // La frase y el tooltip viven SOLO en lib/admin/cobros.ts.
    expect(src).not.toContain("Registró:");
    expect(src).not.toContain("no es quién lo pagó");
  });

  it.each(CARDS)("%s no delata el uuid de registrado_por", (rel) => {
    // El uuid nunca se pinta: solo el nombre que ya resolvió el API.
    expect(codigoDe(rel)).not.toMatch(/\{\s*\w+\.registrado_por\s*\}/);
  });
});
