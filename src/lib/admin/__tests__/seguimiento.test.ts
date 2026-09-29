/**
 * SEGUIMIENTO DE LA COTIZACIÓN — reglas puras (29-sep-2026, API 0.0.43).
 *
 * Pedido del cliente con la captura del #358: «un apartado para poner unas
 * notas que se deben agregar a la cotización. Ej. Pablo ya terminó el vuelito
 * de hoy y los pax pidieron un transporte el cual no está incluido en la
 * cotización pero se necesita cobrar».
 *
 * Se congela: roles, orden (PENDIENTE primero, luego lo más reciente),
 * contadores (lista vs respaldo del snapshot), el banner del cotizador (sale
 * con pendientes, se va sin ellos y NO sale con un API previo), textos y la
 * confirmación de borrado.
 */
import { describe, expect, it } from "vitest";
import {
  bannerSeguimiento,
  CLAVE_PRECIERRE_SEGUIMIENTO,
  AVISO_NOTA_INEXISTENTE,
  CODIGO_NOTA_INEXISTENTE,
  confirmacionEliminarSeguimiento,
  contarSeguimiento,
  esNotaInexistente,
  conteoSeguimientoVuelo,
  esResuelta,
  estadoSeguimientoUi,
  hrefSeguimientoVuelo,
  leerContador,
  MAX_DETALLE_BANNER,
  normalizarNotas,
  ordenarSeguimiento,
  puedeEditarSeguimiento,
  recortarTexto,
  RESOLUCION_MAX,
  TEXTO_NOTA_MAX,
  textoAjustesPrecierre,
  textoAutoria,
  textoBadgeCabecera,
  textoBannerSeguimiento,
  textoContadorPendientes,
  validarResolucion,
  validarTextoNota,
} from "@/lib/admin/seguimiento";
import type { SeguimientoNota, SeguimientoPendienteDetalle } from "@/types/seguimiento";

const VUELO_358 = "3a8f1c2d-4b5e-4f60-8a71-92b3c4d5e6f7";

function nota(over: Partial<SeguimientoNota> = {}): SeguimientoNota {
  return {
    id: "n-1",
    texto: "Los pax pidieron transporte terrestre; no está en la cotización, hay que cobrarlo.",
    afecta_cotizacion: true,
    estado: "PENDIENTE",
    created_at: "2026-09-29T19:05:00Z",
    creado_por: { id: "u-itzi", nombre: "Itzi" },
    resuelta_at: null,
    resuelta_por: null,
    resolucion: null,
    ...over,
  };
}

describe("roles", () => {
  it("ADMIN, COORDINADOR y FACTURACION escriben; SOCIO y ANALISTA solo leen", () => {
    for (const rol of ["ADMIN", "COORDINADOR", "FACTURACION"]) {
      expect(puedeEditarSeguimiento(rol), rol).toBe(true);
    }
    for (const rol of ["SOCIO", "ANALISTA", "PILOTO", "MECANICO", "VISITANTE"]) {
      expect(puedeEditarSeguimiento(rol), rol).toBe(false);
    }
  });

  it("sin rol (/me falló) se ofrece: el gate real es el API", () => {
    expect(puedeEditarSeguimiento(null)).toBe(true);
    expect(puedeEditarSeguimiento(undefined)).toBe(true);
  });
});

describe("validación (espejo de los CHECK de BD)", () => {
  it("texto vacío o solo espacios no se manda", () => {
    expect(validarTextoNota("")).toMatch(/Escribe/);
    expect(validarTextoNota("   \n ")).toMatch(/Escribe/);
    expect(validarTextoNota("Transporte al hotel")).toBeNull();
  });

  it("texto de más de 1000 caracteres (ya recortado) se frena", () => {
    expect(validarTextoNota("x".repeat(TEXTO_NOTA_MAX))).toBeNull();
    expect(validarTextoNota(`  ${"x".repeat(TEXTO_NOTA_MAX)}  `)).toBeNull();
    expect(validarTextoNota("x".repeat(TEXTO_NOTA_MAX + 1))).toBe("Máximo 1000 caracteres.");
  });

  it("la resolución es opcional y admite hasta 500", () => {
    expect(validarResolucion("")).toBeNull();
    expect(validarResolucion("x".repeat(RESOLUCION_MAX))).toBeNull();
    expect(validarResolucion("x".repeat(RESOLUCION_MAX + 1))).toBe("Máximo 500 caracteres.");
  });
});

describe("lista: orden y conteo", () => {
  const vieja = nota({ id: "a", created_at: "2026-09-27T15:00:00Z" });
  const nueva = nota({ id: "b", created_at: "2026-09-29T15:00:00Z" });
  const resueltaReciente = nota({
    id: "c",
    estado: "RESUELTA",
    created_at: "2026-09-29T20:00:00Z",
    resuelta_at: "2026-09-29T21:00:00Z",
    resuelta_por: { id: "u-mari", nombre: "Mari" },
    resolucion: "Se agregó como extra en la v3.",
  });
  const soloSeguimiento = nota({
    id: "d",
    afecta_cotizacion: false,
    created_at: "2026-09-28T15:00:00Z",
  });

  it("PENDIENTES primero y, dentro de cada estado, la más reciente arriba", () => {
    const orden = ordenarSeguimiento([resueltaReciente, vieja, soloSeguimiento, nueva]);
    expect(orden.map((n) => n.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("no muta la entrada y es idempotente", () => {
    const entrada = [vieja, nueva];
    const una = ordenarSeguimiento(entrada);
    expect(entrada.map((n) => n.id)).toEqual(["a", "b"]);
    expect(ordenarSeguimiento(una).map((n) => n.id)).toEqual(una.map((n) => n.id));
  });

  it("cuenta pendientes y, aparte, las que afectan la cotización", () => {
    expect(contarSeguimiento([vieja, nueva, resueltaReciente, soloSeguimiento])).toEqual({
      pendientes: 3,
      cotizacion: 2,
    });
    expect(contarSeguimiento([])).toEqual({ pendientes: 0, cotizacion: 0 });
  });

  it("un estado desconocido NO esconde un pendiente (conservador)", () => {
    const rara = nota({ id: "x", estado: "EN_REVISION" });
    expect(esResuelta(rara)).toBe(false);
    expect(contarSeguimiento([rara]).pendientes).toBe(1);
  });

  it("acepta la lista pelona o envuelta en {data}; lo demás es []", () => {
    expect(normalizarNotas([vieja])).toHaveLength(1);
    expect(normalizarNotas({ data: [vieja, nueva] })).toHaveLength(2);
    expect(normalizarNotas(null)).toEqual([]);
    expect(normalizarNotas({ nada: 1 })).toEqual([]);
  });
});

describe("contadores de la cabecera del vuelo", () => {
  it("la LISTA manda cuando cargó (aunque el snapshot diga otra cosa)", () => {
    expect(
      conteoSeguimientoVuelo([nota()], {
        seguimiento_pendientes: 5,
        seguimiento_cotizacion_pendientes: 5,
      }),
    ).toEqual({ pendientes: 1, cotizacion: 1 });
  });

  it("sin lista, los contadores del snapshot; sin ninguno, null (nunca un 0 inventado)", () => {
    expect(
      conteoSeguimientoVuelo(null, {
        seguimiento_pendientes: 3,
        seguimiento_cotizacion_pendientes: 2,
      }),
    ).toEqual({ pendientes: 3, cotizacion: 2 });
    expect(conteoSeguimientoVuelo(null, {})).toBeNull();
    expect(conteoSeguimientoVuelo(null, null)).toBeNull();
  });

  it("leerContador tolera cadenas de PostgREST y descarta basura", () => {
    expect(leerContador(2)).toBe(2);
    expect(leerContador("3")).toBe(3);
    expect(leerContador(0)).toBe(0);
    expect(leerContador(undefined)).toBeNull();
    expect(leerContador(null)).toBeNull();
    expect(leerContador("")).toBeNull();
    expect(leerContador(-1)).toBeNull();
    expect(leerContador("abc")).toBeNull();
  });
});

describe("textos y colores", () => {
  it("PENDIENTE ámbar, RESUELTA verde; un estado nuevo se dice tal cual", () => {
    expect(estadoSeguimientoUi("PENDIENTE").label).toBe("Pendiente");
    expect(estadoSeguimientoUi("PENDIENTE").cls).toContain("amber");
    expect(estadoSeguimientoUi("RESUELTA").label).toBe("Resuelta");
    expect(estadoSeguimientoUi("RESUELTA").cls).toContain("green");
    expect(estadoSeguimientoUi("OTRO").label).toBe("OTRO");
  });

  it("autoría en hora Cancún; sin nombre dice «Alguien»", () => {
    // 19:05 UTC = 14:05 en Cancún (UTC−5).
    const t = textoAutoria({ id: "u", nombre: "Itzi" }, "2026-09-29T19:05:00Z");
    expect(t.startsWith("Itzi · ")).toBe(true);
    expect(t).toMatch(/29 sept?\.? 2026/);
    expect(t).toMatch(/2:05/);
    expect(textoAutoria({ id: null, nombre: null }, "2026-09-29T19:05:00Z")).toMatch(/^Alguien · /);
    expect(textoAutoria("Mari", "2026-09-29T19:05:00Z")).toMatch(/^Mari · /);
    expect(textoAutoria(null, null)).toBe("Alguien · —");
  });

  it("contador, badge y banner en singular y plural", () => {
    expect(textoContadorPendientes(1)).toBe("1 pendiente");
    expect(textoContadorPendientes(3)).toBe("3 pendientes");
    expect(textoBadgeCabecera(1)).toBe("⚠ 1 ajuste pendiente de cotizar");
    expect(textoBadgeCabecera(2)).toBe("⚠ 2 ajustes pendientes de cotizar");
    expect(textoBannerSeguimiento(1)).toBe("1 ajuste pendiente por reflejar en esta cotización");
    expect(textoBannerSeguimiento(4)).toBe("4 ajustes pendientes por reflejar en esta cotización");
    expect(textoAjustesPrecierre(1)).toBe("1 ajuste");
    expect(textoAjustesPrecierre(2)).toBe("2 ajustes");
  });

  it("el enlace va a la card del detalle del vuelo; la clave del pre-cierre es la del API", () => {
    expect(hrefSeguimientoVuelo(VUELO_358)).toBe(
      `/admin/flights/${VUELO_358}#seguimiento-cotizacion`,
    );
    expect(CLAVE_PRECIERRE_SEGUIMIENTO).toBe("seguimiento_cotizacion_pendiente");
  });

  it("recortarTexto colapsa espacios y corta con «…»", () => {
    expect(recortarTexto("  hola\n\n mundo  ")).toBe("hola mundo");
    expect(recortarTexto("x".repeat(200), 10)).toBe(`${"x".repeat(9)}…`);
  });
});

describe("banner del cotizador: aparece y desaparece", () => {
  const det = (i: number): SeguimientoPendienteDetalle => ({
    id: `p-${i}`,
    texto: `Ajuste ${i}`,
    created_at: "2026-09-29T19:05:00Z",
    creado_por_nombre: "Itzi",
  });

  it("con pendientes que afectan la cotización: título y lista", () => {
    const b = bannerSeguimiento({
      seguimiento_pendientes: 3,
      seguimiento_cotizacion_pendientes: 2,
      seguimiento_pendientes_detalle: [det(1), det(2)],
    });
    expect(b).not.toBeNull();
    expect(b!.total).toBe(2);
    expect(b!.titulo).toBe("2 ajustes pendientes por reflejar en esta cotización");
    expect(b!.items.map((i) => i.texto)).toEqual(["Ajuste 1", "Ajuste 2"]);
    expect(b!.restantes).toBe(0);
  });

  it("DESAPARECE cuando ya no hay pendientes que afecten la cotización", () => {
    expect(
      bannerSeguimiento({
        seguimiento_pendientes: 1, // una nota «solo seguimiento» no dispara el banner
        seguimiento_cotizacion_pendientes: 0,
        seguimiento_pendientes_detalle: [],
      }),
    ).toBeNull();
  });

  it("API previo (sin contadores): NO hay banner, aunque llegara detalle", () => {
    expect(bannerSeguimiento({})).toBeNull();
    expect(bannerSeguimiento({ seguimiento_pendientes_detalle: [det(1)] })).toBeNull();
  });

  it("sin detalle el banner dice cuántos (y el enlace hace el resto)", () => {
    const b = bannerSeguimiento({ seguimiento_cotizacion_pendientes: 3 });
    expect(b!.items).toEqual([]);
    expect(b!.titulo).toBe("3 ajustes pendientes por reflejar en esta cotización");
  });

  it("el detalle se topa en 20 y lo que falta se cuenta", () => {
    const detalle = Array.from({ length: 25 }, (_, i) => det(i + 1));
    const b = bannerSeguimiento({
      seguimiento_cotizacion_pendientes: 25,
      seguimiento_pendientes_detalle: detalle,
    });
    expect(b!.items).toHaveLength(MAX_DETALLE_BANNER);
    expect(b!.restantes).toBe(5);
  });

  it("el contador de la cotización MANDA; el del snapshot solo respalda", () => {
    // La cotización trae 0: no se pinta aunque el snapshot diga 2.
    expect(
      bannerSeguimiento(
        { seguimiento_cotizacion_pendientes: 0 },
        { seguimiento_cotizacion_pendientes: 2 },
      ),
    ).toBeNull();
    // La cotización no trae contador: se usa el del snapshot.
    const b = bannerSeguimiento({}, { seguimiento_cotizacion_pendientes: 2 });
    expect(b!.total).toBe(2);
  });
});

describe("confirmación de borrado (regla del cliente)", () => {
  it("una PENDIENTE que afecta la cotización dice qué se pierde y el camino correcto", () => {
    const c = confirmacionEliminarSeguimiento(nota());
    expect(c.titulo).toBe("¿Eliminar esta nota de seguimiento?");
    expect(c.descripcion).toContain("«Los pax pidieron transporte terrestre");
    expect(c.descripcion).toContain("dejará de avisarse en la cotización y en el pre-cierre");
    expect(c.descripcion).toContain("«Marcar resuelta»");
  });

  it("una resuelta o de «solo seguimiento» solo se quita del vuelo", () => {
    const resuelta = confirmacionEliminarSeguimiento(nota({ estado: "RESUELTA" }));
    expect(resuelta.descripcion).toMatch(/se quitará del seguimiento de este vuelo\.$/);
    expect(resuelta.descripcion).not.toContain("pre-cierre");
    const solo = confirmacionEliminarSeguimiento(nota({ afecta_cotizacion: false }));
    expect(solo.descripcion).not.toContain("pre-cierre");
  });

  it("una nota larga se cita recortada", () => {
    const c = confirmacionEliminarSeguimiento(nota({ texto: "y".repeat(400) }));
    expect(c.descripcion.length).toBeLessThan(400);
    expect(c.descripcion).toContain("…»");
  });
});

describe("concurrencia: la nota ya la eliminó alguien más", () => {
  it("solo el 404 SEGUIMIENTO_NO_EXISTE cuenta como «ya no existe»", () => {
    expect(CODIGO_NOTA_INEXISTENTE).toBe("SEGUIMIENTO_NO_EXISTE");
    expect(esNotaInexistente({ ok: false, code: "SEGUIMIENTO_NO_EXISTE" })).toBe(true);
    expect(esNotaInexistente({ ok: false, code: "SEGUIMIENTO_NO_DISPONIBLE" })).toBe(false);
    expect(esNotaInexistente({ ok: false, code: "VUELO_NO_EXISTE" })).toBe(false);
    expect(esNotaInexistente({ ok: false })).toBe(false);
    expect(esNotaInexistente({ ok: true, code: "SEGUIMIENTO_NO_EXISTE" })).toBe(false);
    expect(esNotaInexistente(null)).toBe(false);
  });

  it("el aviso lo dice en es-MX", () => {
    expect(AVISO_NOTA_INEXISTENTE).toMatch(/ya no existe/);
  });
});
