/**
 * AFAC por vuelo editable en el libro en pantalla (16-oct-2026, API 0.0.89,
 * invariante 90 del API): reglas PURAS del panel — quién edita, el vínculo de
 * la celda EGRESO, lo que se teclea, qué se guarda, el valor «optimista» y
 * cuándo se descarta, y los textos EXACTOS. El panel no calcula dinero: el
 * reservado, el remanente y los totales llegan en el libro.
 */
import { describe, expect, it } from "vitest";
import type { LibroExcel, LibroExcelCelda, LibroExcelHoja } from "@/types/libro-excel";
import {
  MARGEN_LIBRO_NUEVO_MS,
  MSG_AFAC_API_PREVIO,
  MSG_AFAC_SESION,
  MSG_AFAC_VUELO_NO_EXISTE,
  MSG_AFAC_SIN_PERMISO,
  MSG_AFAC_SIN_RESPUESTA,
  MSG_MONTO_AFAC_DECIMALES,
  MSG_MONTO_AFAC_INVALIDO,
  MSG_MONTO_AFAC_MAXIMO,
  MSG_MONTO_AFAC_NEGATIVO,
  RETRASO_REFRESCO_AFAC_MS,
  ROLES_AFAC_REAL,
  SIN_CAMBIOS_AFAC,
  TEXTO_BARRA_AFAC_AYUDA,
  TEXTO_BARRA_AFAC_EDITANDO,
  TEXTO_BARRA_AFAC_GUARDANDO,
  TITULO_CELDA_AFAC_BLOQUEADA,
  TITULO_CELDA_AFAC_EDITABLE,
  TITULO_CELDA_AFAC_GUARDANDO,
  TITULO_CELDA_AFAC_SIN_ROL,
  TITULO_QUITAR_AFAC,
  afacRealHabilitado,
  cajaEditorAfac,
  claseEdicionCelda,
  conteoCambiosAfac,
  costoRealDeRespuesta,
  decidirGuardadoAfac,
  depurarCambiosAfac,
  errorMontoParaApi,
  estadoBarraAfac,
  falloAfacIncierto,
  falloAfacPideRefresco,
  leerVinculoAfacReal,
  mensajeErrorAfac,
  mismoMontoAfac,
  parsearMontoAfac,
  prepararHojaAfac,
  puedeEditarAfacReal,
  restaurarCambioAfac,
  revisarEditorAfac,
  teclaEdicionAfac,
  textoCambiosGuardadosAfac,
  textoEdicionInicial,
  textoMontoComoLibro,
  textoQuitarAfac,
  toastGuardadoAfac,
  toastQuitadoAfac,
  tituloEdicionAfac,
  valoresAfacDelLibro,
  type CambiosAfac,
} from "../libro-afac";
import { tituloCelda } from "../libro-excel";

// Casos ancla de septiembre 2026 (contrato §6): #236 N621TX 2.60 h × 100 ×
// 17.030000 = $4,427.80 reservado; #223 XB-PEV «Morena Mia» $1,700.00.
const V236 = "5e2a0f36-0000-4000-8000-000000000236";
const V223 = "5e2a0f36-0000-4000-8000-000000000223";

const vinculo = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  tipo: "afac_real",
  campo: "costo_real_mxn",
  vuelo_id: V236,
  clave: "#236 · Ambulancia Internacional",
  matricula: "N621TX",
  valor: null,
  reservado_mxn: 4427.8,
  editable: true,
  motivo: null,
  mes: "2026-09",
  capturado_por: null,
  capturado_at: null,
  ...extra,
});

/** La celda EGRESO (D) de la fila AFAC del vuelo, como la manda pyservices. */
const celdaD = (r: number, extra: Record<string, unknown> = {}, celda: Partial<LibroExcelCelda> = {}): LibroExcelCelda => ({
  r,
  c: 4,
  v: (extra.valor as number | null | undefined) ?? null,
  t: "",
  s: 0,
  vinculo: vinculo(extra),
  ...celda,
});

const hoja = (celdas: LibroExcelCelda[]): LibroExcelHoja => ({
  nombre: "otros movimientos",
  pestana: null,
  cuadricula: true,
  inmovilizar: { filas: 3, columnas: 1 },
  max_fila: 40,
  max_col: 10,
  columnas: [],
  filas: [],
  combinadas: [],
  celdas,
});

const libro = (celdas: LibroExcelCelda[], generado: string | null = "2026-10-16T19:00:00.000Z"): LibroExcel => ({
  version: 1,
  titulo: "Balance general",
  archivo: null,
  generado,
  ancho_columna_default: 8.43,
  alto_fila_default: 15,
  estilos: [{ nf: "#,##0.00" }, { nf: '"$"#,##0.00' }],
  hojas: [hoja(celdas)],
});

describe("quién captura el costo real (espejo del API)", () => {
  it("ROLES_AFAC_REAL = ADMIN, FACTURACION y COORDINADOR (ANALISTA ve el libro sin editar)", () => {
    expect([...ROLES_AFAC_REAL]).toEqual(["ADMIN", "FACTURACION", "COORDINADOR"]);
  });

  it("hace falta el rol Y `config.afac_real === true` (la base con la migración)", () => {
    expect(puedeEditarAfacReal({ rol: "ADMIN", config: { afac_real: true } })).toBe(true);
    expect(puedeEditarAfacReal({ rol: "FACTURACION", config: { afac_real: true } })).toBe(true);
    expect(puedeEditarAfacReal({ rol: "COORDINADOR", config: { afac_real: true } })).toBe(true);
    expect(puedeEditarAfacReal({ rol: "ANALISTA", config: { afac_real: true } })).toBe(false);
    expect(puedeEditarAfacReal({ rol: "PILOTO", config: { afac_real: true } })).toBe(false);
    // API previo (sin la llave), sin migración (false) o un valor raro ⇒ nadie.
    expect(puedeEditarAfacReal({ rol: "ADMIN", config: {} })).toBe(false);
    expect(puedeEditarAfacReal({ rol: "ADMIN", config: { afac_real: false } })).toBe(false);
    expect(puedeEditarAfacReal({ rol: "ADMIN", config: { afac_real: "true" } })).toBe(false);
    expect(puedeEditarAfacReal({ rol: "ADMIN" })).toBe(false);
    expect(puedeEditarAfacReal(null)).toBe(false);
    expect(afacRealHabilitado({ config: { afac_real: true } })).toBe(true);
    expect(afacRealHabilitado({ config: null })).toBe(false);
  });
});

describe("leerVinculoAfacReal: solo la forma del contrato; lo demás es de solo lectura", () => {
  it("el vínculo de pyservices (§5.3) se lee completo", () => {
    expect(
      leerVinculoAfacReal({
        vinculo: vinculo({ valor: 4500, capturado_por: "Ale", capturado_at: "2026-10-16T19:05:00Z" }),
      }),
    ).toEqual({
      tipo: "afac_real",
      campo: "costo_real_mxn",
      vuelo_id: V236,
      clave: "#236 · Ambulancia Internacional",
      matricula: "N621TX",
      valor: 4500,
      reservado_mxn: 4427.8,
      editable: true,
      motivo: null,
      mes: "2026-09",
      capturado_por: "Ale",
      capturado_at: "2026-10-16T19:05:00Z",
    });
  });

  it("`valor` ausente o null = sin capturar; 0 es un monto (AFAC no cobró)", () => {
    expect(leerVinculoAfacReal({ vinculo: vinculo({ valor: undefined }) })?.valor).toBeNull();
    expect(leerVinculoAfacReal({ vinculo: vinculo({ valor: 0 }) })?.valor).toBe(0);
  });

  it("otra forma ⇒ null (celda de solo lectura, como siempre)", () => {
    expect(leerVinculoAfacReal(null)).toBeNull();
    expect(leerVinculoAfacReal({})).toBeNull();
    expect(leerVinculoAfacReal({ vinculo: { tipo: "gasto", id: V236 } })).toBeNull();
    expect(leerVinculoAfacReal({ vinculo: vinculo({ campo: "notas" }) })).toBeNull();
    expect(leerVinculoAfacReal({ vinculo: vinculo({ vuelo_id: "236" }) })).toBeNull();
    expect(leerVinculoAfacReal({ vinculo: vinculo({ editable: "true" }) })).toBeNull();
    expect(leerVinculoAfacReal({ vinculo: vinculo({ valor: -1 }) })).toBeNull();
    expect(leerVinculoAfacReal({ vinculo: vinculo({ valor: "4500" }) })).toBeNull();
    expect(leerVinculoAfacReal({ vinculo: vinculo({ valor: Number.NaN }) })).toBeNull();
    expect(leerVinculoAfacReal({ vinculo: vinculo({ reservado_mxn: -5 }) })).toBeNull();
  });

  it("textos vacíos ⇒ null (la clave cae a «este vuelo» en los textos)", () => {
    const v = leerVinculoAfacReal({ vinculo: vinculo({ clave: "  ", motivo: "" }) });
    expect(v?.clave).toBeNull();
    expect(v?.motivo).toBeNull();
    expect(textoQuitarAfac({ clave: null, valor: null })).toContain("de este vuelo?");
  });
});

describe("parsearMontoAfac: lo que el operador teclea en la celda (pesos)", () => {
  it.each([
    ["4427.80", 4427.8],
    ["4427.8", 4427.8],
    ["4,427.80", 4427.8],
    ["$4,427.80", 4427.8],
    ["$ 4,427.80", 4427.8],
    ["4427.80 MXN", 4427.8],
    ["  4500 ", 4500],
    ["4500.", 4500],
    [".5", 0.5],
    ["0", 0],
    ["1,234,567.89", 1234567.89],
    // Revisión 16-oct-2026: miles con coma y centavos (el caso de la captura).
    ["1,700.50", 1700.5],
    ["$1,700.50", 1700.5],
    ["1,700", 1700],
  ])("«%s» ⇒ %d", (texto, valor) => {
    expect(parsearMontoAfac(texto)).toEqual({ tipo: "monto", valor });
  });

  it("vacío o espacios ⇒ vacío (quitar), distinto de 0", () => {
    expect(parsearMontoAfac("")).toEqual({ tipo: "vacio" });
    expect(parsearMontoAfac("   ")).toEqual({ tipo: "vacio" });
  });

  it("negativo, más de 2 decimales, comas fuera de lugar, demasiado grande o basura ⇒ error con su texto", () => {
    expect(parsearMontoAfac("-100")).toEqual({ tipo: "error", mensaje: MSG_MONTO_AFAC_NEGATIVO });
    expect(parsearMontoAfac("$-100")).toEqual({ tipo: "error", mensaje: MSG_MONTO_AFAC_NEGATIVO });
    expect(parsearMontoAfac("(100)")).toEqual({ tipo: "error", mensaje: MSG_MONTO_AFAC_NEGATIVO });
    expect(parsearMontoAfac("4427.805")).toEqual({ tipo: "error", mensaje: MSG_MONTO_AFAC_DECIMALES });
    // La coma decimal no es de es-MX: jamás se adivina «4427,80».
    expect(parsearMontoAfac("4427,80")).toEqual({ tipo: "error", mensaje: MSG_MONTO_AFAC_INVALIDO });
    expect(parsearMontoAfac("44,27.80")).toEqual({ tipo: "error", mensaje: MSG_MONTO_AFAC_INVALIDO });
    // Formato europeo: error, jamás 1.7 ni 1700.5 adivinados.
    expect(parsearMontoAfac("1.700,50")).toEqual({ tipo: "error", mensaje: MSG_MONTO_AFAC_INVALIDO });
    expect(parsearMontoAfac("1700,50")).toEqual({ tipo: "error", mensaje: MSG_MONTO_AFAC_INVALIDO });
    expect(parsearMontoAfac("1.700")).toEqual({ tipo: "error", mensaje: MSG_MONTO_AFAC_DECIMALES });
    expect(parsearMontoAfac("1,70")).toEqual({ tipo: "error", mensaje: MSG_MONTO_AFAC_INVALIDO });
    expect(parsearMontoAfac("abc")).toEqual({ tipo: "error", mensaje: MSG_MONTO_AFAC_INVALIDO });
    expect(parsearMontoAfac("$")).toEqual({ tipo: "error", mensaje: MSG_MONTO_AFAC_INVALIDO });
    expect(parsearMontoAfac(".")).toEqual({ tipo: "error", mensaje: MSG_MONTO_AFAC_INVALIDO });
    expect(parsearMontoAfac("1e5")).toEqual({ tipo: "error", mensaje: MSG_MONTO_AFAC_INVALIDO });
    expect(parsearMontoAfac("1000000000000")).toEqual({ tipo: "error", mensaje: MSG_MONTO_AFAC_MAXIMO });
    expect(MSG_MONTO_AFAC_INVALIDO).toBe("Escribe el monto en pesos, por ejemplo 4427.80");
  });
});

describe("decidirGuardadoAfac: nada, guardar, quitar (con confirmación) o error", () => {
  it("lo mismo al centavo (o vacío sobre vacío) ⇒ nada (sin PUT)", () => {
    expect(decidirGuardadoAfac("4,500.00", 4500)).toEqual({ accion: "nada" });
    expect(decidirGuardadoAfac("4500", 4500.004)).toEqual({ accion: "nada" });
    expect(decidirGuardadoAfac("", null)).toEqual({ accion: "nada" });
  });

  it("un monto distinto ⇒ guardar; 0 sobre vacío también (AFAC no cobró)", () => {
    expect(decidirGuardadoAfac("4500", null)).toEqual({ accion: "guardar", monto: 4500 });
    expect(decidirGuardadoAfac("4500.10", 4500)).toEqual({ accion: "guardar", monto: 4500.1 });
    expect(decidirGuardadoAfac("0", null)).toEqual({ accion: "guardar", monto: 0 });
  });

  it("vaciar una celda con valor ⇒ quitar; lo ilegible ⇒ error", () => {
    expect(decidirGuardadoAfac(" ", 4500)).toEqual({ accion: "quitar" });
    expect(decidirGuardadoAfac("x", 4500)).toEqual({ accion: "error", mensaje: MSG_MONTO_AFAC_INVALIDO });
  });

  it("mismoMontoAfac: null solo es igual a null", () => {
    expect(mismoMontoAfac(null, null)).toBe(true);
    expect(mismoMontoAfac(0, null)).toBe(false);
    expect(mismoMontoAfac(1700, 1700.001)).toBe(true);
  });
});

describe("teclado y texto inicial del cuadro (como en Excel)", () => {
  it("Enter/F2 editan, Supr/Retroceso vacían, un dígito o el punto reemplazan; con Ctrl/⌘/Alt nada", () => {
    expect(teclaEdicionAfac({ key: "Enter" })).toEqual({ tipo: "editar" });
    expect(teclaEdicionAfac({ key: "F2" })).toEqual({ tipo: "editar" });
    expect(teclaEdicionAfac({ key: "Delete" })).toEqual({ tipo: "vaciar" });
    expect(teclaEdicionAfac({ key: "Backspace" })).toEqual({ tipo: "vaciar" });
    expect(teclaEdicionAfac({ key: "4" })).toEqual({ tipo: "teclear", texto: "4" });
    expect(teclaEdicionAfac({ key: "." })).toEqual({ tipo: "teclear", texto: "." });
    expect(teclaEdicionAfac({ key: "a" })).toBeNull();
    expect(teclaEdicionAfac({ key: "ArrowDown" })).toBeNull();
    expect(teclaEdicionAfac({ key: "4", ctrlKey: true })).toBeNull();
    expect(teclaEdicionAfac({ key: "Enter", metaKey: true })).toBeNull();
    expect(teclaEdicionAfac({ key: "Delete", altKey: true })).toBeNull();
  });

  it("el cuadro abre con el valor crudo de 2 decimales y sin comas (o vacío)", () => {
    expect(textoEdicionInicial(4427.8)).toBe("4427.80");
    expect(textoEdicionInicial(0)).toBe("0.00");
    expect(textoEdicionInicial(null)).toBe("");
  });

  it("cajaEditorAfac: el rectángulo REAL del <td> en coordenadas del contenido del marco", () => {
    expect(
      cajaEditorAfac(
        { left: 520.4, top: 830.6, width: 96, height: 21 },
        { left: 300, top: 200 },
        { scrollLeft: 150, scrollTop: 1200, clientLeft: 0, clientTop: 0 },
      ),
    ).toEqual({ left: 370, top: 1831, width: 96, height: 21 });
    expect(
      cajaEditorAfac({ left: 10, top: 10, width: -1, height: 0 }, { left: 0, top: 0 }, { scrollLeft: 0, scrollTop: 0, clientLeft: 1, clientTop: 1 }),
    ).toEqual({ left: 9, top: 9, width: 0, height: 0 });
  });
});

describe("prepararHojaAfac: la hoja que se PINTA (estado de edición y lo tecleado; nada más)", () => {
  it("sin celdas `afac_real` devuelve la MISMA hoja (marcado byte a byte)", () => {
    const h = hoja([{ r: 1, c: 1, v: "x", t: "x" }]);
    expect(prepararHojaAfac(h, { cambios: SIN_CAMBIOS_AFAC, puedeEditar: true, estilos: [] })).toBe(h);
  });

  it("cada celda del costo real gana su estado: editable (rol + `editable`), bloqueada con el motivo del API o del rol", () => {
    const h = hoja([
      celdaD(5),
      celdaD(6, { vuelo_id: V223, clave: "#223 · Morena Mia", editable: false, motivo: "Septiembre 2026 ya está cerrado (Ale, 16-oct). Reábrelo en Reportes para corregir." }),
      celdaD(7, { editable: false, motivo: null }),
      { r: 5, c: 7, v: 4427.8, t: "4,427.80", s: 0 },
    ]);
    const conRol = prepararHojaAfac(h, { cambios: SIN_CAMBIOS_AFAC, puedeEditar: true, estilos: [] });
    expect(conRol.celdas[0].edicion).toEqual({ estado: "editable", titulo: TITULO_CELDA_AFAC_EDITABLE });
    expect(conRol.celdas[1].edicion).toEqual({
      estado: "bloqueada",
      titulo: "Septiembre 2026 ya está cerrado (Ale, 16-oct). Reábrelo en Reportes para corregir.",
    });
    expect(conRol.celdas[2].edicion).toEqual({ estado: "bloqueada", titulo: TITULO_CELDA_AFAC_BLOQUEADA });
    // La celda del RESERVADO (G) no lleva vínculo: no se toca.
    expect(conRol.celdas[3]).toBe(h.celdas[3]);
    const sinRol = prepararHojaAfac(h, { cambios: SIN_CAMBIOS_AFAC, puedeEditar: false, estilos: [] });
    expect(sinRol.celdas[0].edicion).toEqual({ estado: "bloqueada", titulo: TITULO_CELDA_AFAC_SIN_ROL });
    // El motivo del API manda sobre el del rol.
    expect(sinRol.celdas[1].edicion?.titulo).toContain("ya está cerrado");
    // El tooltip de la celda lo suma después de la nota.
    expect(tituloCelda({ ...conRol.celdas[0], n: "Capturó Ale el 16/10/2026" })).toBe(
      `Capturó Ale el 16/10/2026\n${TITULO_CELDA_AFAC_EDITABLE}`,
    );
  });

  it("un cambio local enseña SOLO el número tecleado con el formato de la celda (sin fórmula); «guardando» bloquea la celda", () => {
    const h = hoja([celdaD(5, { valor: null }, { s: 0, f: "=X" }), celdaD(6, { vuelo_id: V223, valor: 1700 }, { s: 1, v: 1700, t: "$1,700.00" })]);
    const cambios: CambiosAfac = {
      [V236]: { valor: 4500, estado: "guardado", guardadoEn: 1 },
      [V223]: { valor: null, estado: "guardando", guardadoEn: null },
    };
    const p = prepararHojaAfac(h, { cambios, puedeEditar: true, estilos: [{ nf: "#,##0.00" }, { nf: '"$"#,##0.00' }] });
    expect(p.celdas[0]).toMatchObject({ v: 4500, t: "4,500.00", edicion: { estado: "editable" } });
    expect(p.celdas[0].f).toBeUndefined();
    expect(leerVinculoAfacReal(p.celdas[0])?.valor).toBe(4500);
    expect(p.celdas[1]).toMatchObject({
      v: null,
      t: "",
      edicion: { estado: "guardando", titulo: TITULO_CELDA_AFAC_GUARDANDO },
    });
    // La hoja del libro NO se muta.
    expect(h.celdas[0].v).toBeNull();
    expect(leerVinculoAfacReal(h.celdas[1])?.valor).toBe(1700);
  });

  it("varios aviones: el cambio cae SOLO en la celda editable del vuelo (la otra fila no lleva el real)", () => {
    const h = hoja([
      celdaD(5, { valor: null }),
      celdaD(6, { valor: null, matricula: "XB-PEV", editable: false, motivo: "El costo real de este vuelo va en su fila de N621TX." }),
    ]);
    const p = prepararHojaAfac(h, {
      cambios: { [V236]: { valor: 4500, estado: "guardado", guardadoEn: 1 } },
      puedeEditar: true,
      estilos: [],
    });
    expect(p.celdas[0].v).toBe(4500);
    expect(p.celdas[1].v).toBeNull();
    expect(p.celdas[1].edicion?.titulo).toBe("El costo real de este vuelo va en su fila de N621TX.");
  });

  it("clase de la celda por estado (styles/libro-excel.css)", () => {
    expect(claseEdicionCelda({ estado: "editable", titulo: "" })).toBe("xl-edicion-editable");
    expect(claseEdicionCelda({ estado: "bloqueada", titulo: "" })).toBe("xl-edicion-bloqueada");
    expect(claseEdicionCelda({ estado: "guardando", titulo: "" })).toBe("xl-edicion-guardando");
    expect(claseEdicionCelda(undefined)).toBeUndefined();
  });

  it("textoMontoComoLibro: solo formato es-MX de la celda", () => {
    expect(textoMontoComoLibro(4427.8, "#,##0.00")).toBe("4,427.80");
    expect(textoMontoComoLibro(4427.8, '"$"#,##0.00')).toBe("$4,427.80");
    expect(textoMontoComoLibro(0, "#,##0.00;[Red]-#,##0.00")).toBe("0.00");
    expect(textoMontoComoLibro(null, "#,##0.00")).toBe("");
    expect(textoMontoComoLibro(1700, undefined)).toBe("1,700.00");
  });

  it("tituloEdicionAfac: guardando > motivo del API > rol", () => {
    expect(tituloEdicionAfac({ editable: true, motivo: null }, { puedeEditar: true, guardando: true })).toBe(
      TITULO_CELDA_AFAC_GUARDANDO,
    );
    expect(tituloEdicionAfac({ editable: false, motivo: "El costo real AFAC todavía no está habilitado." }, { puedeEditar: true })).toBe(
      "El costo real AFAC todavía no está habilitado.",
    );
    expect(tituloEdicionAfac({ editable: true, motivo: null }, { puedeEditar: false })).toBe(TITULO_CELDA_AFAC_SIN_ROL);
  });
});

describe("cambios locales: se descartan cuando el libro nuevo ya los trae", () => {
  const guardadoEn = Date.parse("2026-10-16T19:00:00.000Z");
  const cambios: CambiosAfac = {
    [V236]: { valor: 4500, estado: "guardado", guardadoEn },
    [V223]: { valor: 1800, estado: "guardando", guardadoEn: null },
  };

  it("el libro trae el mismo monto ⇒ se quita; «guardando» se queda siempre", () => {
    const l = libro([celdaD(5, { valor: 4500 }), celdaD(6, { vuelo_id: V223, valor: 1700 })], "2026-10-16T19:00:20.000Z");
    expect(depurarCambiosAfac(cambios, l)).toEqual({ [V223]: cambios[V223] });
  });

  it("un libro pedido ANTES del guardado (otro monto, generado antes del margen) ⇒ se queda (sin parpadeo al valor viejo)", () => {
    const l = libro([celdaD(5, { valor: null })], "2026-10-16T19:00:30.000Z");
    expect(depurarCambiosAfac(cambios, l)).toBe(cambios);
  });

  it("un libro generado más de un minuto después ⇒ manda el servidor (otra persona lo cambió)", () => {
    const l = libro([celdaD(5, { valor: 4600 })], new Date(guardadoEn + MARGEN_LIBRO_NUEVO_MS + 1).toISOString());
    expect(depurarCambiosAfac(cambios, l)).toEqual({ [V223]: cambios[V223] });
  });

  it("el vuelo ya no tiene celda editable (p. ej. se difirió) ⇒ se quita; `generado` sin hora no cuenta", () => {
    expect(depurarCambiosAfac(cambios, libro([], "2026-10-16"))).toEqual({ [V223]: cambios[V223] });
    const l = libro([celdaD(5, { valor: 4600 })], "2026-10-16");
    expect(depurarCambiosAfac(cambios, l)).toBe(cambios);
  });

  it("sin cambios devuelve el MISMO objeto", () => {
    expect(depurarCambiosAfac(SIN_CAMBIOS_AFAC, libro([]))).toBe(SIN_CAMBIOS_AFAC);
  });

  it("valoresAfacDelLibro: solo las celdas editables, la primera por vuelo", () => {
    const l = libro([
      celdaD(5, { valor: 4500 }),
      celdaD(6, { valor: null, editable: false }),
      celdaD(7, { vuelo_id: V223, valor: null, editable: false }),
    ]);
    expect([...valoresAfacDelLibro(l)]).toEqual([[V236, 4500]]);
  });

  it("restaurarCambioAfac: tras un rechazo vuelve el cambio previo (o ninguno)", () => {
    const previo = { valor: 4500, estado: "guardado" as const, guardadoEn: 1 };
    const conIntento: CambiosAfac = { [V236]: { valor: 4600, estado: "guardando", guardadoEn: null } };
    expect(restaurarCambioAfac(conIntento, V236, previo)).toEqual({ [V236]: previo });
    expect(restaurarCambioAfac(conIntento, V236, undefined)).toEqual({});
  });

  it("conteo y refresco: un refresco 15 s después del último guardado", () => {
    expect(conteoCambiosAfac(cambios)).toEqual({ guardando: 1, guardados: 1 });
    expect(RETRASO_REFRESCO_AFAC_MS).toBe(15_000);
  });
});

describe("revisarEditorAfac: el cuadro abierto cuando llega un libro NUEVO (revisión 16-oct-2026)", () => {
  // El cuadro guarda en el vuelo de SU vínculo pero se pinta sobre (r, c):
  // si en el libro nuevo esa celda ya es de otro vuelo, se cierra SIN guardar.
  const v236 = leerVinculoAfacReal(celdaD(5, { valor: 4500 }))!;
  const editor = { r: 5, c: 4, vinculo: v236 };

  it("misma celda, mismo vuelo, mismo valor ⇒ el MISMO vínculo (sin re-render)", () => {
    expect(revisarEditorAfac(editor, hoja([celdaD(5, { valor: 4500 })]), SIN_CAMBIOS_AFAC)).toBe(v236);
  });

  it("en (r, c) ahora vive OTRO vuelo (llegó o se fue una fila) ⇒ null (cerrar sin guardar)", () => {
    const h = hoja([celdaD(5, { vuelo_id: V223, clave: "#223 · Morena Mia" }), celdaD(6, { valor: 4500 })]);
    expect(revisarEditorAfac(editor, h, SIN_CAMBIOS_AFAC)).toBeNull();
  });

  it("la celda ya no se puede capturar (mes cerrado) o ya no existe ⇒ null", () => {
    expect(revisarEditorAfac(editor, hoja([celdaD(5, { valor: 4500, editable: false, motivo: "cerrado" })]), SIN_CAMBIOS_AFAC)).toBeNull();
    expect(revisarEditorAfac(editor, hoja([]), SIN_CAMBIOS_AFAC)).toBeNull();
    expect(revisarEditorAfac(editor, null, SIN_CAMBIOS_AFAC)).toBeNull();
    // La celda sigue ahí pero sin vínculo (pyservices previo).
    expect(revisarEditorAfac(editor, hoja([{ r: 5, c: 4, v: 4500, t: "4,500.00" }]), SIN_CAMBIOS_AFAC)).toBeNull();
  });

  it("mismo vuelo con OTRO valor (otra persona lo capturó) ⇒ el vínculo fresco; con cambio local manda el local", () => {
    const fresco = revisarEditorAfac(editor, hoja([celdaD(5, { valor: 4600 })]), SIN_CAMBIOS_AFAC);
    expect(fresco).not.toBe(v236);
    expect(fresco).toMatchObject({ vuelo_id: V236, valor: 4600 });
    const local: CambiosAfac = { [V236]: { valor: 4500, estado: "guardado", guardadoEn: 1 } };
    expect(revisarEditorAfac(editor, hoja([celdaD(5, { valor: null })]), local)).toBe(v236);
  });
});

describe("textos EXACTOS (barra, toasts, confirmación)", () => {
  it("la barra: error > guardando > editando > guardados > ayuda > nada", () => {
    const guardado: CambiosAfac = { [V236]: { valor: 4500, estado: "guardado", guardadoEn: 1 } };
    const guardando: CambiosAfac = { [V236]: { valor: 4500, estado: "guardando", guardadoEn: null } };
    expect(estadoBarraAfac({ cambios: guardando, error: "x", editando: true, celdaEditable: true })).toEqual({
      tono: "error",
      texto: "x",
    });
    expect(estadoBarraAfac({ cambios: guardando, error: null, editando: true, celdaEditable: true })).toEqual({
      tono: "guardando",
      texto: TEXTO_BARRA_AFAC_GUARDANDO,
    });
    expect(estadoBarraAfac({ cambios: guardado, error: null, editando: true, celdaEditable: true })).toEqual({
      tono: "ayuda",
      texto: TEXTO_BARRA_AFAC_EDITANDO,
    });
    expect(estadoBarraAfac({ cambios: guardado, error: null, editando: false, celdaEditable: true })).toEqual({
      tono: "guardado",
      texto: "1 cambio guardado · los totales se actualizan en unos segundos",
    });
    expect(estadoBarraAfac({ cambios: SIN_CAMBIOS_AFAC, error: null, editando: false, celdaEditable: true })).toEqual({
      tono: "ayuda",
      texto: TEXTO_BARRA_AFAC_AYUDA,
    });
    expect(estadoBarraAfac({ cambios: SIN_CAMBIOS_AFAC, error: null, editando: false, celdaEditable: false })).toBeNull();
    expect(textoCambiosGuardadosAfac(3)).toBe("3 cambios guardados · los totales se actualizan en unos segundos");
  });

  it("la barra dice POR QUÉ no se captura la celda AFAC seleccionada (revisión 16-oct-2026: el doble clic no hacía nada)", () => {
    const motivo = "Septiembre 2026 ya está cerrado (Ale, 16-oct). Reábrelo en Reportes para corregir.";
    const guardado: CambiosAfac = { [V236]: { valor: 4500, estado: "guardado", guardadoEn: 1 } };
    const guardando: CambiosAfac = { [V236]: { valor: 4500, estado: "guardando", guardadoEn: null } };
    const base = { error: null, editando: false, celdaEditable: false, motivoCelda: motivo };
    expect(estadoBarraAfac({ ...base, cambios: SIN_CAMBIOS_AFAC })).toEqual({ tono: "bloqueada", texto: motivo });
    // Antes que «N cambios guardados» (es lo que el operador intenta ahora)…
    expect(estadoBarraAfac({ ...base, cambios: guardado })).toEqual({ tono: "bloqueada", texto: motivo });
    // …y después del error y de «Guardando…».
    expect(estadoBarraAfac({ ...base, cambios: guardando })?.tono).toBe("guardando");
    expect(estadoBarraAfac({ ...base, cambios: SIN_CAMBIOS_AFAC, error: "x" })?.tono).toBe("error");
    // Sin motivo (o vacío), como antes.
    expect(estadoBarraAfac({ ...base, cambios: SIN_CAMBIOS_AFAC, motivoCelda: null })).toBeNull();
    expect(estadoBarraAfac({ ...base, cambios: SIN_CAMBIOS_AFAC, motivoCelda: "" })).toBeNull();
  });

  it("toasts con el folio del API (o la clave de la fila)", () => {
    const v = { clave: "#236 · Ambulancia Internacional" };
    expect(toastGuardadoAfac(236, v)).toBe("Costo real AFAC guardado · #236");
    expect(toastQuitadoAfac(236, v)).toBe("Costo real AFAC quitado · #236");
    expect(toastGuardadoAfac(null, v)).toBe("Costo real AFAC guardado · #236 · Ambulancia Internacional");
  });

  it("la confirmación de quitar (acción destructiva)", () => {
    expect(TITULO_QUITAR_AFAC).toBe("¿Quitar el costo real AFAC?");
    expect(textoQuitarAfac({ clave: "#236 · Ambulancia Internacional", valor: 4500 })).toBe(
      "¿Quitar el costo real AFAC de #236 · Ambulancia Internacional? El vuelo vuelve a «sin capturar» y deja de contar como egreso de VuelaTour. Hoy tiene $4,500.00.",
    );
  });
});

describe("respuesta y errores del PUT/DELETE", () => {
  it("costoRealDeRespuesta: el numeric de PostgREST como texto, null = quitado; sin respuesta legible, lo enviado", () => {
    expect(costoRealDeRespuesta({ costo_real_mxn: "4500.00" }, 4500)).toBe(4500);
    expect(costoRealDeRespuesta({ costo_real_mxn: 4500.1 }, 4500.1)).toBe(4500.1);
    expect(costoRealDeRespuesta({ costo_real_mxn: null }, null)).toBeNull();
    expect(costoRealDeRespuesta(undefined, 4500)).toBe(4500);
    expect(costoRealDeRespuesta({ costo_real_mxn: "x" }, 4500)).toBe(4500);
  });

  it("409 MES_CERRADO y los 400/503 del API: su texto TAL CUAL", () => {
    const cerrado = {
      ok: false,
      code: "MES_CERRADO",
      status: 409,
      error: "Septiembre 2026 ya está cerrado (Ale, 16-oct). Reábrelo en Reportes para corregir.",
      details: { periodo: "2026-09" },
    };
    expect(mensajeErrorAfac(cerrado)).toBe(cerrado.error);
    expect(falloAfacIncierto(cerrado)).toBe(false);
    const sinAvion = {
      ok: false,
      code: "AFAC_VUELO_SIN_AVION",
      status: 400,
      error: "Este vuelo no tiene avión de la flota: asígnale avión antes de capturar su costo real AFAC.",
    };
    expect(mensajeErrorAfac(sinAvion)).toBe(sinAvion.error);
    expect(falloAfacIncierto(sinAvion)).toBe(false);
    const sinMigracion = {
      ok: false,
      code: "AFAC_REAL_NO_DISPONIBLE",
      status: 503,
      error: "El costo real AFAC todavía no está habilitado en la base de datos (falta aplicar una actualización). Vuelve a intentarlo en unos minutos; si sigue igual, avisa a soporte.",
    };
    expect(mensajeErrorAfac(sinMigracion)).toBe(sinMigracion.error);
    expect(falloAfacIncierto(sinMigracion)).toBe(false);
  });

  it("lo técnico se traduce; sin respuesta PUDO aplicarse (se vuelve a leer el libro)", () => {
    expect(mensajeErrorAfac({ status: 401, error: "Unauthorized" })).toBe(MSG_AFAC_SESION);
    expect(mensajeErrorAfac({ status: 403, error: "Forbidden resource" })).toBe(MSG_AFAC_SIN_PERMISO);
    expect(mensajeErrorAfac({ status: 404, error: `Cannot PUT /v1/flights/${V236}/afac-real` })).toBe(MSG_AFAC_API_PREVIO);
    expect(mensajeErrorAfac({ status: 404, error: `Cannot DELETE /v1/flights/${V236}/afac-real` })).toBe(MSG_AFAC_API_PREVIO);
    // El API REAL (afac-real.service#validarVuelo) manda «Vuelo <uuid> not
    // found»: inglés y con el id crudo. Jamás se pinta tal cual.
    expect(
      mensajeErrorAfac({ status: 404, code: "VUELO_NO_EXISTE", error: `Vuelo ${V236} not found` }),
    ).toBe(MSG_AFAC_VUELO_NO_EXISTE);
    expect(mensajeErrorAfac({ status: 404, error: `Vuelo ${V236} not found` })).toBe(MSG_AFAC_VUELO_NO_EXISTE);
    expect(MSG_AFAC_VUELO_NO_EXISTE).toBe(
      "Este vuelo ya no existe (lo borraron o lo cambiaron). Pulsa «Actualizar datos».",
    );
    const sinRed = { code: "SIN_CONEXION", error: MSG_AFAC_SIN_RESPUESTA };
    expect(mensajeErrorAfac(sinRed)).toBe(MSG_AFAC_SIN_RESPUESTA);
    expect(falloAfacIncierto(sinRed)).toBe(true);
    expect(mensajeErrorAfac({ status: 500, error: "Internal server error" })).toBe(MSG_AFAC_SIN_RESPUESTA);
    expect(falloAfacIncierto({ status: 500, error: "Internal server error" })).toBe(true);
    expect(falloAfacIncierto({ status: 502, code: "PARSE_ERROR", error: "x" })).toBe(true);
  });

  it("falloAfacPideRefresco: lo incierto y los rechazos que dicen que el libro quedó VIEJO vuelven a leer el libro", () => {
    // Revisión 16-oct-2026: sin releer, la celda seguía verde («editable») y
    // el operador reintentaba la misma celda o las demás del mes cerrado.
    const cerrado = { ok: false, code: "MES_CERRADO", status: 409, error: "Septiembre 2026 ya está cerrado.", details: { periodo: "2026-09" } };
    expect(falloAfacPideRefresco(cerrado)).toBe(true);
    expect(falloAfacPideRefresco({ status: 404, code: "VUELO_NO_EXISTE", error: `Vuelo ${V236} not found` })).toBe(true);
    expect(falloAfacPideRefresco({ status: 400, code: "AFAC_VUELO_SIN_AVION", error: "Este vuelo no tiene avión de la flota…" })).toBe(true);
    expect(falloAfacPideRefresco({ status: 400, code: "AFAC_VUELO_SIN_FECHA", error: "…" })).toBe(true);
    expect(falloAfacPideRefresco({ status: 400, code: "PERIODO_ANTES_DEL_INICIO", error: "…" })).toBe(true);
    expect(falloAfacPideRefresco({ code: "SIN_CONEXION", error: MSG_AFAC_SIN_RESPUESTA })).toBe(true);
    // Lo que se corrige tecleando, la sesión, el rol, el API previo y la
    // base sin migración NO piden el libro (no lo arreglaría).
    expect(falloAfacPideRefresco({ status: 400, code: "AFAC_COSTO_INVALIDO", error: "El costo real debe ser…" })).toBe(false);
    expect(falloAfacPideRefresco({ status: 401, code: "UNAUTHORIZED", error: "Sesión inválida" })).toBe(false);
    expect(falloAfacPideRefresco({ status: 403, code: "FORBIDDEN", error: "Solo oficina" })).toBe(false);
    expect(falloAfacPideRefresco({ status: 404, code: "NOT_FOUND", error: `Cannot PUT /v1/flights/${V236}/afac-real` })).toBe(false);
    expect(
      falloAfacPideRefresco({ status: 503, code: "AFAC_REAL_NO_DISPONIBLE", error: "El costo real AFAC todavía no está habilitado…" }),
    ).toBe(false);
  });

  it("errorMontoParaApi: la misma regla que el DTO antes de hablar con el API", () => {
    expect(errorMontoParaApi(4427.8)).toBeNull();
    expect(errorMontoParaApi(0)).toBeNull();
    expect(errorMontoParaApi(-1)).toBe(MSG_MONTO_AFAC_NEGATIVO);
    expect(errorMontoParaApi(1.005)).toBe(MSG_MONTO_AFAC_DECIMALES);
    expect(errorMontoParaApi(Number.NaN)).toBe(MSG_MONTO_AFAC_INVALIDO);
    expect(errorMontoParaApi("4500")).toBe(MSG_MONTO_AFAC_INVALIDO);
    expect(errorMontoParaApi(1e13)).toBe(MSG_MONTO_AFAC_MAXIMO);
  });
});
