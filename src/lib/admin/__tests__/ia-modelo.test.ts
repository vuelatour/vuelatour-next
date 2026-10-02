/**
 * MODELO DE IA configurable (2-oct-2026, API 0.0.51). Pedido del cliente:
 * «dejar una opción en la configuración para adaptar el modelo que quieran
 * utilizar, aunque ahorita dejaremos por default el que estamos usando».
 *
 * Se custodia:
 *  1. la PARIDAD del catálogo y de las tarifas con el API (tabla COPIADA del
 *     contrato y, si el repo hermano está al lado, contra su código: el
 *     catálogo se PARSEA renglón por renglón y se compara completo —orden,
 *     cruces de nombre/descripción y altas—, igual que la regex y los textos);
 *  2. la regla del id (misma regex que el API y pyservices) y su normalización;
 *  3. qué arranca elegido, cuándo «Guardar» cambia algo y qué se guardaría;
 *  4. los textos de «Modelo en uso», confirmaciones, tarifa y errores.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATALOGO_MODELOS_IA,
  CLAVE_CONFIG_MODELO_IA,
  ETIQUETA_DEFAULT_SERVIDOR,
  ETIQUETA_ELEGIDO_AQUI,
  OPCION_OTRO_MODELO_IA,
  REGEX_ID_MODELO_IA,
  TARIFAS_IA_POR_PREFIJO,
  TEXTO_ERROR_GUARDAR_MODELO_IA,
  TEXTO_FUERA_DE_CATALOGO_IA,
  TEXTO_ID_MODELO_INVALIDO,
  TEXTO_MODELO_IA_NO_DISPONIBLE,
  TEXTO_SERVIDOR_SIN_CONFIRMAR,
  TEXTO_SESION_VENCIDA_MODELO_IA,
  TEXTO_SIN_PERMISO_MODELO_IA,
  TEXTO_SIN_TARIFA_IA,
  avisoModeloIa,
  avisoServidorSinConfirmarIa,
  errorCampoOtroModeloIa,
  esIdModeloValido,
  etiquetaModeloIa,
  hayCambioModeloIa,
  mensajeErrorModeloIa,
  modeloDelCatalogo,
  nombreModeloIa,
  normalizarIdModeloIa,
  notaModeloEnUsoIa,
  notaModeloIa,
  opcionesModeloIa,
  seleccionInicialModeloIa,
  tarifaModeloIa,
  textoConfirmarModeloIa,
  textoConfirmarVolverServidorIa,
  textoGuardadoModeloIa,
  textoModeloEnUsoIa,
  textoTarifaIa,
  textosConfirmacionModeloIa,
  textoUltimoCambioModeloIa,
  validarSeleccionModeloIa,
} from "../ia-modelo";

/**
 * COPIA del catálogo del API (2-oct-2026; pyservices NO lleva catálogo):
 * id · nombre · descripción · tarifa in/out USD por millón. Sonnet 5 y Opus
 * 5.5 salieron en la revisión del API (thinking adaptativo): quedan por
 * «Otro». Si el API cambia un renglón, se cambia aquí y en `ia-modelo.ts`
 * en el mismo lote.
 */
const CATALOGO_CONTRATO = [
  ["claude-opus-4-8", "Claude Opus 4.8", "el que usa hoy el servidor; el más preciso", 5, 25],
  ["claude-sonnet-4-6", "Claude Sonnet 4.6", "más barato (≈ 40 % menos por token)", 3, 15],
  [
    "claude-haiku-4-5-20251001",
    "Claude Haiku 4.5",
    "el más barato y rápido; menos preciso en tickets difíciles",
    1,
    5,
  ],
] as const;

/** COPIA de `TARIFAS` de `vuelatour-api/src/modules/ia-uso/ia-uso.service.ts`. */
const TARIFAS_API = [
  ["claude-opus-4-8", 5, 25],
  ["claude-opus-4-7", 5, 25],
  ["claude-opus-4-6", 5, 25],
  ["claude-opus-5-5", 4, 20],
  ["claude-opus-5", 5, 25],
  ["claude-sonnet-4-6", 3, 15],
  ["claude-sonnet-5", 2, 10],
  ["claude-haiku-4-5", 1, 5],
] as const;

/** COPIA de los textos del API (`MENSAJE_MODELO_INVALIDO`, `AVISO_FUERA_DE_CATALOGO`, `AVISO_SIN_TARIFA`). */
const TEXTOS_API = {
  invalido:
    "El id del modelo no es válido: debe empezar con «claude-» y llevar solo minúsculas, números, puntos o guiones (por ejemplo, claude-sonnet-4-6).",
  fueraDeCatalogo:
    "Este modelo no está en el catálogo: verifica que el id exista en Anthropic; si no existe, las lecturas con IA fallarán hasta corregirlo.",
  sinTarifa: "Sin tarifa conocida: el consumo se registra con costo 0 hasta agregar su tarifa.",
};

/** Repo hermano del API (solo existe en el workspace local). */
const API = path.resolve(__dirname, "../../../../../vuelatour-api/src");
const leerApi = (rel: string): string | null => {
  const p = path.join(API, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};

describe("paridad con el API", () => {
  it("el catálogo es la copia literal del contrato (orden, id, nombre, descripción, tarifa)", () => {
    expect(
      CATALOGO_MODELOS_IA.map((m) => [
        m.id,
        m.nombre,
        m.descripcion,
        m.tarifa.inUsdPorMillon,
        m.tarifa.outUsdPorMillon,
      ]),
    ).toEqual(CATALOGO_CONTRATO.map((r) => [...r]));
  });

  it("las tarifas por prefijo son la copia de TARIFAS del API", () => {
    expect(
      TARIFAS_IA_POR_PREFIJO.map((t) => [t.prefijo, t.inUsdPorMillon, t.outUsdPorMillon]),
    ).toEqual(TARIFAS_API.map((r) => [...r]));
  });

  it("la tarifa de cada renglón del catálogo es la que daría TARIFAS (misma regla de prefijo)", () => {
    for (const m of CATALOGO_MODELOS_IA) expect(tarifaModeloIa(m.id)).toEqual(m.tarifa);
  });

  const tarifasApi = leerApi("modules/ia-uso/ia-uso.service.ts");
  it.skipIf(!tarifasApi)("TARIFAS del código del API = la copia (lectura del repo hermano)", () => {
    const filas = [
      ...tarifasApi!.matchAll(
        /\{\s*prefijo:\s*'([^']+)',\s*inUsdPorMillon:\s*([\d.]+),\s*outUsdPorMillon:\s*([\d.]+)\s*\}/g,
      ),
    ].map((m) => [m[1], Number(m[2]), Number(m[3])]);
    expect(filas).toEqual(TARIFAS_API.map((r) => [...r]));
  });

  const utilApi = leerApi("common/ia-modelo.util.ts");
  it.skipIf(!utilApi)(
    "CATALOGO_BASE del código del API = el del panel (orden, id, nombre y descripción de cada renglón)",
    () => {
      // Solo el bloque del arreglo (de `const CATALOGO_BASE … = [` a `];`).
      const bloque = utilApi!.match(/const CATALOGO_BASE\b[^=]*=\s*\[([\s\S]*?)\n\];/)?.[1];
      expect(bloque, "no se encontró CATALOGO_BASE en el API").toBeTruthy();
      const filas = [
        ...bloque!.matchAll(
          /\{\s*id:\s*'([^']*)',\s*nombre:\s*'([^']*)',\s*descripcion:\s*'([^']*)',?\s*\}/g,
        ),
      ].map((m) => [m[1], m[2], m[3]]);
      // Un renglón con otra forma (otro campo, comillas dobles…) no se
      // parsearía y pasaría de largo: cada `id:` del bloque debe ser una fila.
      expect(filas.length).toBe(bloque!.match(/\bid:/g)?.length ?? 0);
      expect(filas).toEqual(CATALOGO_MODELOS_IA.map((m) => [m.id, m.nombre, m.descripcion]));
    },
  );

  it.skipIf(!utilApi)("la regex y los textos del código del API = los del panel", () => {
    expect(utilApi!.match(/export const REGEX_ID_MODELO_IA = \/(.+)\/;/)?.[1]).toBe(REGEX_ID_MODELO_IA.source);
    const texto = (nombre: string) =>
      utilApi!.match(new RegExp(`export const ${nombre} =\\s*'([^']*)';`))?.[1];
    expect(texto("MENSAJE_MODELO_INVALIDO")).toBe(TEXTOS_API.invalido);
    expect(texto("AVISO_FUERA_DE_CATALOGO")).toBe(TEXTOS_API.fueraDeCatalogo);
    expect(texto("AVISO_SIN_TARIFA")).toBe(TEXTOS_API.sinTarifa);
  });

  it("los textos compartidos son la copia de los del API", () => {
    expect(TEXTO_ID_MODELO_INVALIDO).toBe(TEXTOS_API.invalido);
    expect(TEXTO_FUERA_DE_CATALOGO_IA).toBe(TEXTOS_API.fueraDeCatalogo);
    expect(TEXTO_SIN_TARIFA_IA).toBe(TEXTOS_API.sinTarifa);
  });

  it("la clave de configuración es la del contrato", () => {
    expect(CLAVE_CONFIG_MODELO_IA).toBe("ia_modelo");
  });
});

describe("id del modelo", () => {
  it.each([
    ["claude-opus-4-8", true],
    ["claude-haiku-4-5-20251001", true],
    ["claude-opus-5-5", true],
    ["claude-x.y", true],
    ["claude-ab", false], // menos de 3 después de «claude-»
    ["Claude-opus-4-8", false], // mayúsculas: se normaliza ANTES de validar
    ["gpt-4o", false],
    ["claude-opus 4", false],
    ["claude-opus_4", false],
    [`claude-${"a".repeat(81)}`, false],
    [`claude-${"a".repeat(80)}`, true],
    ["", false],
    [OPCION_OTRO_MODELO_IA, false], // el centinela del selector nunca es un id
  ])("%s ⇒ %s", (id, ok) => {
    expect(esIdModeloValido(id)).toBe(ok);
  });

  it("no acepta lo que no es texto", () => {
    expect(esIdModeloValido(null)).toBe(false);
    expect(esIdModeloValido(undefined)).toBe(false);
    expect(esIdModeloValido(42)).toBe(false);
  });

  it("normaliza espacios y mayúsculas", () => {
    expect(normalizarIdModeloIa("  Claude-Sonnet-5 ")).toBe("claude-sonnet-5");
    expect(normalizarIdModeloIa(null)).toBe("");
  });

  it("tarifa por prefijo: un id con sufijo de versión la hereda; uno desconocido no tiene", () => {
    expect(tarifaModeloIa("claude-opus-4-7")).toEqual({ inUsdPorMillon: 5, outUsdPorMillon: 25 });
    expect(tarifaModeloIa("claude-sonnet-5-20261001")).toEqual({ inUsdPorMillon: 2, outUsdPorMillon: 10 });
    expect(tarifaModeloIa("claude-mythos-1")).toBeNull();
    // `claude-opus-5-5` gana antes que `claude-opus-5` (primera coincidencia).
    expect(tarifaModeloIa("claude-opus-5-5")).toEqual({ inUsdPorMillon: 4, outUsdPorMillon: 20 });
    expect(tarifaModeloIa("claude-opus-5-1")).toEqual({ inUsdPorMillon: 5, outUsdPorMillon: 25 });
    expect(tarifaModeloIa("")).toBeNull();
  });
});

describe("textos del catálogo", () => {
  it("tarifa «$5 / $25 por millón de tokens»", () => {
    expect(textoTarifaIa({ inUsdPorMillon: 5, outUsdPorMillon: 25 })).toBe(
      "$5 / $25 por millón de tokens",
    );
    expect(textoTarifaIa({ inUsdPorMillon: 0.8, outUsdPorMillon: 4 })).toBe(
      "$0.80 / $4 por millón de tokens",
    );
  });

  it("opciones del selector: catálogo en su orden con descripción + tarifa, y «Otro» al final", () => {
    const ops = opcionesModeloIa();
    expect(ops.map((o) => o.value)).toEqual([
      ...CATALOGO_CONTRATO.map((r) => r[0]),
      OPCION_OTRO_MODELO_IA,
    ]);
    expect(ops[0]).toEqual({
      value: "claude-opus-4-8",
      label: "Claude Opus 4.8",
      description: "el que usa hoy el servidor; el más preciso · $5 / $25 por millón de tokens",
    });
    expect(ops[1]).toEqual({
      value: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      description: "más barato (≈ 40 % menos por token) · $3 / $15 por millón de tokens",
    });
    expect(ops.at(-1)?.label).toBe("Otro (escribir id)");
    // Sonnet 5 y Opus 5.5 ya no se ofrecen en la lista (van por «Otro»).
    expect(ops.map((o) => o.value)).not.toContain("claude-sonnet-5");
    expect(ops.map((o) => o.value)).not.toContain("claude-opus-5-5");
  });

  it("nombre y etiqueta: catálogo del panel → catálogo del API → el id tal cual", () => {
    expect(nombreModeloIa("claude-sonnet-4-6")).toBe("Claude Sonnet 4.6");
    expect(etiquetaModeloIa("claude-sonnet-4-6")).toBe("Claude Sonnet 4.6 (claude-sonnet-4-6)");
    const api = [{ id: "claude-opus-6", nombre: "Claude Opus 6" }];
    expect(nombreModeloIa("claude-opus-6", api)).toBe("Claude Opus 6");
    expect(etiquetaModeloIa("claude-mythos-1")).toBe("claude-mythos-1");
    expect(modeloDelCatalogo("claude-mythos-1")).toBeNull();
  });
});

const SIN_ELEGIR = {
  configurado: null,
  default_servidor: "claude-opus-4-8",
  efectivo: "claude-opus-4-8",
  catalogo: null,
};

describe("lo que se ve y lo que se guardaría", () => {
  it("hoy (sin elección): «Claude Opus 4.8 (claude-opus-4-8)» · default del servidor", () => {
    expect(textoModeloEnUsoIa(SIN_ELEGIR)).toEqual({
      modelo: "Claude Opus 4.8 (claude-opus-4-8)",
      marca: ETIQUETA_DEFAULT_SERVIDOR,
    });
    expect(ETIQUETA_DEFAULT_SERVIDOR).toBe("default del servidor");
  });

  it("con elección: el elegido y la marca «elegido en Configuración»", () => {
    expect(
      textoModeloEnUsoIa({ ...SIN_ELEGIR, configurado: "claude-sonnet-4-6", efectivo: "claude-sonnet-4-6" }),
    ).toEqual({ modelo: "Claude Sonnet 4.6 (claude-sonnet-4-6)", marca: ETIQUETA_ELEGIDO_AQUI });
  });

  it("sin saber cuál usa el servidor no se inventa un modelo", () => {
    const t = textoModeloEnUsoIa({ configurado: null, default_servidor: null, efectivo: null });
    expect(t.modelo).toContain("no se pudo consultar");
    expect(t.marca).toBe(ETIQUETA_DEFAULT_SERVIDOR);
  });

  it("el selector arranca en el modelo EN USO; un id fuera del catálogo va a «Otro»", () => {
    expect(seleccionInicialModeloIa(SIN_ELEGIR)).toEqual({ opcion: "claude-opus-4-8", otro: "" });
    expect(
      seleccionInicialModeloIa({ ...SIN_ELEGIR, configurado: "claude-mythos-1", efectivo: "claude-mythos-1" }),
    ).toEqual({ opcion: OPCION_OTRO_MODELO_IA, otro: "claude-mythos-1" });
    expect(seleccionInicialModeloIa({ configurado: null, default_servidor: null, efectivo: null })).toEqual({
      opcion: "",
      otro: "",
    });
  });

  it("validación de la selección: catálogo, «Otro» normalizado, vacío e inválido", () => {
    expect(validarSeleccionModeloIa({ opcion: "claude-sonnet-4-6", otro: "" })).toEqual({
      ok: true,
      modelo: "claude-sonnet-4-6",
    });
    expect(validarSeleccionModeloIa({ opcion: OPCION_OTRO_MODELO_IA, otro: " Claude-Opus-6 " })).toEqual({
      ok: true,
      modelo: "claude-opus-6",
    });
    expect(validarSeleccionModeloIa({ opcion: OPCION_OTRO_MODELO_IA, otro: "  " })).toEqual({
      ok: false,
      motivo: "vacio",
      texto: null,
    });
    expect(validarSeleccionModeloIa({ opcion: OPCION_OTRO_MODELO_IA, otro: "gpt-4o" })).toEqual({
      ok: false,
      motivo: "invalido",
      texto: TEXTO_ID_MODELO_INVALIDO,
    });
    expect(validarSeleccionModeloIa({ opcion: "", otro: "" }).ok).toBe(false);
  });

  it("el error del campo «Otro» espera a que el operador salga del campo", () => {
    // Mientras escribe («c», «claude-»…) no se marca en rojo: «Guardar» ya va apagado.
    for (const otro of ["c", "cla", "claude-", "claude-s"]) {
      const v = validarSeleccionModeloIa({ opcion: OPCION_OTRO_MODELO_IA, otro });
      expect(v.ok).toBe(false);
      expect(errorCampoOtroModeloIa(v, false)).toBeNull();
      // Ya tocado (salió del campo), sí se dice.
      expect(errorCampoOtroModeloIa(v, true)).toBe(TEXTO_ID_MODELO_INVALIDO);
    }
    // Vacío o válido: nunca hay error, tocado o no.
    const vacio = validarSeleccionModeloIa({ opcion: OPCION_OTRO_MODELO_IA, otro: "" });
    expect(errorCampoOtroModeloIa(vacio, true)).toBeNull();
    const valido = validarSeleccionModeloIa({ opcion: OPCION_OTRO_MODELO_IA, otro: "claude-sonnet-4-6" });
    expect(errorCampoOtroModeloIa(valido, true)).toBeNull();
  });

  it("«Guardar» solo cambia algo si el elegido es otro que el que ya está en uso", () => {
    expect(hayCambioModeloIa(SIN_ELEGIR, "claude-opus-4-8")).toBe(false);
    expect(hayCambioModeloIa(SIN_ELEGIR, "claude-sonnet-4-6")).toBe(true);
    expect(hayCambioModeloIa(SIN_ELEGIR, null)).toBe(false);
    const elegido = { ...SIN_ELEGIR, configurado: "claude-sonnet-4-6", efectivo: "claude-sonnet-4-6" };
    expect(hayCambioModeloIa(elegido, "claude-sonnet-4-6")).toBe(false);
    expect(hayCambioModeloIa(elegido, "claude-opus-4-8")).toBe(true);
  });

  it("aviso (espejo de avisoModeloIa del API): solo fuera del catálogo; sin tarifa suma el de costo 0", () => {
    expect(avisoModeloIa(null)).toBeNull();
    expect(avisoModeloIa("claude-sonnet-4-6")).toBeNull();
    expect(avisoModeloIa("gpt-4o")).toBeNull(); // id inválido: no es «otro modelo»
    expect(avisoModeloIa("claude-opus-4-7")).toBe(TEXTO_FUERA_DE_CATALOGO_IA);
    // Fuera del catálogo desde la revisión del API, pero con tarifa conocida.
    expect(avisoModeloIa("claude-sonnet-5")).toBe(TEXTO_FUERA_DE_CATALOGO_IA);
    expect(avisoModeloIa("claude-opus-5-5")).toBe(TEXTO_FUERA_DE_CATALOGO_IA);
    expect(avisoModeloIa("claude-mythos-1")).toBe(`${TEXTO_FUERA_DE_CATALOGO_IA} ${TEXTO_SIN_TARIFA_IA}`);
  });

  it("nota del elegido: neutra con la tarifa del catálogo; ÁMBAR fuera del catálogo", () => {
    expect(notaModeloIa("claude-sonnet-4-6")).toEqual({
      tono: "neutro",
      texto: "Tarifa: $3 / $15 por millón de tokens (entrada / salida, USD).",
    });
    // Sonnet 5 ya no está en el catálogo: ámbar, pero con su tarifa.
    expect(notaModeloIa("claude-sonnet-5")).toEqual({
      tono: "ambar",
      texto: `${TEXTO_FUERA_DE_CATALOGO_IA} Tarifa: $2 / $10 por millón de tokens (entrada / salida, USD).`,
    });
    expect(notaModeloIa("claude-opus-4-7")).toEqual({
      tono: "ambar",
      texto: `${TEXTO_FUERA_DE_CATALOGO_IA} Tarifa: $5 / $25 por millón de tokens (entrada / salida, USD).`,
    });
    expect(notaModeloIa("claude-mythos-1")).toEqual({
      tono: "ambar",
      texto: `${TEXTO_FUERA_DE_CATALOGO_IA} ${TEXTO_SIN_TARIFA_IA}`,
    });
    expect(notaModeloIa(null)).toBeNull();
  });

  it("nota del modelo EN USO: manda el `aviso` del API; sin la llave, el espejo; sin aviso, la tarifa", () => {
    expect(notaModeloEnUsoIa({ ...SIN_ELEGIR, aviso: null })).toEqual({
      tono: "neutro",
      texto: "Tarifa: $5 / $25 por millón de tokens (entrada / salida, USD).",
    });
    expect(
      notaModeloEnUsoIa({ ...SIN_ELEGIR, configurado: "claude-x9", efectivo: "claude-x9", aviso: "Aviso del API." }),
    ).toEqual({ tono: "ambar", texto: "Aviso del API." });
    expect(
      notaModeloEnUsoIa({ ...SIN_ELEGIR, configurado: "claude-mythos-1", efectivo: "claude-mythos-1" }),
    ).toEqual({ tono: "ambar", texto: `${TEXTO_FUERA_DE_CATALOGO_IA} ${TEXTO_SIN_TARIFA_IA}` });
    expect(notaModeloEnUsoIa({ configurado: null, default_servidor: null, efectivo: null })).toBeNull();
  });

  it("último cambio: elegido / regresado al del servidor; nunca guardado ⇒ nada", () => {
    expect(
      textoUltimoCambioModeloIa(
        { configurado: "claude-sonnet-4-6", actualizado_at: "2026-10-02T15:15:00Z", actualizado_por_nombre: "Mari" },
        "2 oct 2026, 10:15",
      ),
    ).toBe("Elegido por Mari el 2 oct 2026, 10:15.");
    expect(
      textoUltimoCambioModeloIa(
        { configurado: null, actualizado_at: "2026-10-02T15:15:00Z", actualizado_por_nombre: null },
        "2 oct 2026, 10:15",
      ),
    ).toBe("Se regresó al modelo del servidor (2 oct 2026, 10:15).");
    expect(
      textoUltimoCambioModeloIa(
        { configurado: null, actualizado_at: "2026-10-02T15:15:00Z", actualizado_por_nombre: " Mari " },
        "2 oct 2026, 10:15 a.m.",
      ),
    ).toBe("Se regresó al modelo del servidor (Mari, 2 oct 2026, 10:15 a.m.).");
    // La hora de es-MX ya trae su punto («a.m.»): no sale «a.m..».
    expect(
      textoUltimoCambioModeloIa(
        { configurado: "claude-sonnet-4-6", actualizado_at: "2026-10-02T15:15:00Z", actualizado_por_nombre: "Mari" },
        "2 oct 2026, 10:15 a.m.",
      ),
    ).toBe("Elegido por Mari el 2 oct 2026, 10:15 a.m.");
    expect(
      textoUltimoCambioModeloIa({ configurado: null, actualizado_at: null, actualizado_por_nombre: null }, "—"),
    ).toBeNull();
  });

  it("aviso cuando hay elección pero no se pudo consultar al servidor de IA", () => {
    expect(avisoServidorSinConfirmarIa({ configurado: "claude-sonnet-4-6", default_servidor: null })).toBe(
      TEXTO_SERVIDOR_SIN_CONFIRMAR,
    );
    expect(avisoServidorSinConfirmarIa({ configurado: null, default_servidor: null })).toBeNull();
    expect(
      avisoServidorSinConfirmarIa({ configurado: "claude-sonnet-4-6", default_servidor: "claude-opus-4-8" }),
    ).toBeNull();
  });
});

describe("confirmaciones, toast y errores", () => {
  it("confirmar «Guardar» (texto del contrato)", () => {
    expect(textoConfirmarModeloIa("Claude Sonnet 4.6")).toBe(
      "Las próximas lecturas de tickets, tacómetros, PDFs y sugerencias usarán Claude Sonnet 4.6. El consumo se seguirá registrando por lectura.",
    );
  });

  it("confirmar «Volver al del servidor», con y sin su nombre", () => {
    expect(textoConfirmarVolverServidorIa("claude-opus-4-8")).toBe(
      "Las próximas lecturas de tickets, tacómetros, PDFs y sugerencias usarán el modelo del servidor, Claude Opus 4.8. El consumo se seguirá registrando por lectura.",
    );
    expect(textoConfirmarVolverServidorIa(null)).toContain("el modelo que tenga configurado el servidor");
  });

  it("diálogo de «Guardar»: título, texto del contrato y botón; del catálogo sin aviso", () => {
    expect(textosConfirmacionModeloIa({ tipo: "guardar", modelo: "claude-sonnet-4-6" }, SIN_ELEGIR)).toEqual({
      titulo: "¿Cambiar el modelo de IA?",
      texto: textoConfirmarModeloIa("Claude Sonnet 4.6"),
      aviso: null,
      accion: "Sí, cambiar",
    });
  });

  it("diálogo de «Guardar» con un id FUERA del catálogo: repite que las lecturas pueden fallar", () => {
    // El dedazo del reporte: tiene forma válida pero no existe en Anthropic.
    const t = textosConfirmacionModeloIa({ tipo: "guardar", modelo: "claude-sonet-5" }, SIN_ELEGIR);
    expect(t.texto).toBe(textoConfirmarModeloIa("claude-sonet-5"));
    expect(t.aviso).toBe(`${TEXTO_FUERA_DE_CATALOGO_IA} ${TEXTO_SIN_TARIFA_IA}`);
    expect(t.aviso).toContain("las lecturas con IA fallarán hasta corregirlo");
    // Fuera del catálogo pero con tarifa (prefijo conocido): solo el de verificar el id.
    expect(textosConfirmacionModeloIa({ tipo: "guardar", modelo: "claude-opus-4-7" }, SIN_ELEGIR).aviso).toBe(
      TEXTO_FUERA_DE_CATALOGO_IA,
    );
  });

  it("diálogo de «Volver al del servidor»: su título, su texto y su botón, sin aviso", () => {
    expect(textosConfirmacionModeloIa({ tipo: "servidor" }, SIN_ELEGIR)).toEqual({
      titulo: "¿Volver al modelo del servidor?",
      texto: textoConfirmarVolverServidorIa("claude-opus-4-8"),
      aviso: null,
      accion: "Sí, usar el del servidor",
    });
  });

  it("toast tras guardar", () => {
    expect(
      textoGuardadoModeloIa({ ...SIN_ELEGIR, configurado: "claude-sonnet-4-6", efectivo: "claude-sonnet-4-6" }),
    ).toBe("Listo. Las próximas lecturas usarán Claude Sonnet 4.6.");
    expect(textoGuardadoModeloIa(SIN_ELEGIR)).toBe("Listo. Se usará el modelo del servidor (Claude Opus 4.8).");
    expect(textoGuardadoModeloIa({ configurado: null, default_servidor: null, efectivo: null })).toBe(
      "Listo. Se usará el modelo del servidor.",
    );
  });

  it("errores: códigos conocidos, texto del API en español, técnicos en inglés", () => {
    expect(mensajeErrorModeloIa({ code: "MODELO_INVALIDO", status: 400, error: "x" })).toBe(
      TEXTO_ID_MODELO_INVALIDO,
    );
    expect(
      mensajeErrorModeloIa({ code: "FORBIDDEN", status: 403, error: "Required role: ADMIN. Current: SOCIO" }),
    ).toBe(TEXTO_SIN_PERMISO_MODELO_IA);
    expect(
      mensajeErrorModeloIa({ code: "NOT_FOUND", status: 404, error: "Cannot PUT /v1/config/ia-modelo" }),
    ).toBe(TEXTO_MODELO_IA_NO_DISPONIBLE);
    expect(mensajeErrorModeloIa({ code: "ALGO", status: 409, error: "Otro administrador lo cambió." })).toBe(
      "Otro administrador lo cambió.",
    );
    expect(mensajeErrorModeloIa({ code: "BAD_REQUEST", status: 400, error: "Bad Request" })).toBe(
      TEXTO_ID_MODELO_INVALIDO,
    );
    expect(mensajeErrorModeloIa({ code: "INTERNAL_ERROR", status: 500, error: "Internal server error" })).toBe(
      TEXTO_ERROR_GUARDAR_MODELO_IA,
    );
    expect(mensajeErrorModeloIa({ error: null })).toBe(TEXTO_ERROR_GUARDAR_MODELO_IA);
  });

  it("401 (sesión vencida con la página abierta): nunca el texto en inglés del API", () => {
    for (const error of ["Invalid or expired token", "Missing Bearer token", "Malformed token", "Unauthorized"]) {
      expect(mensajeErrorModeloIa({ code: "UNAUTHORIZED", status: 401, error })).toBe(TEXTO_SESION_VENCIDA_MODELO_IA);
      // Aun sin status ni code, esos textos técnicos no llegan al operador.
      expect(mensajeErrorModeloIa({ error })).toBe(TEXTO_ERROR_GUARDAR_MODELO_IA);
    }
    expect(TEXTO_SESION_VENCIDA_MODELO_IA).toBe("Tu sesión venció: vuelve a iniciar sesión e intenta de nuevo.");
  });
});
