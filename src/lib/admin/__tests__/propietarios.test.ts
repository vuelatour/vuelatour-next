/**
 * Propietarios del avión (19-oct-2026, API 0.0.97): la regla PURA de la card
 * y de la ventana «Editar propietarios».
 *
 * Caso real (captura del cliente, XA-VGV): Hernan Garza 100 % desde el
 * 1-ene-2020 «termina el 19 oct 2026» + Alejandro Canales 100 % desde el
 * 18-ago-2026 = 200 % asignado. Lo que se congela:
 *  1. el selector lista socios y empresas de CUALQUIER estado (los socios
 *     reales están INACTIVOS) y a los demás solo ACTIVOS; «＋ Nuevo socio…»
 *     solo con permiso;
 *  2. «Quitar» sugiere el día ANTERIOR al relevo (17-ago-2026) y, sin relevo,
 *     ayer; empezó hoy ⇒ «se agregó por error»;
 *  3. nunca más del 100 % el MISMO día (espejo exacto de `excesoPorcentaje`
 *     del API) y el texto del 400 `PROPIETARIO_SUMA_EXCEDE`;
 *  4. el plan de llamadas en un orden que no choca con esa regla (primero lo
 *     que quita, al final lo que suma) y SOLO lo que cambió;
 *  5. los textos exactos.
 */
import { describe, expect, it } from "vitest";
import type { AircraftOwner } from "@/types/aircraft";
import {
  ETIQUETA_NUEVO_SOCIO,
  VALOR_NUEVO_SOCIO,
  alertaSumaCard,
  cambiosDeFila,
  descripcionPaso,
  descripcionSocio,
  errorUltimoDia,
  estadoSuma,
  excesoPorcentaje,
  filaNueva,
  filasDeVigentes,
  filasResultantes,
  lineaVigencia,
  mensajeSumaExcede,
  opcionesSocios,
  planPideConfirmacion,
  planPropietarios,
  propietariosAnteriores,
  puedeEditarPropietarios,
  resolverNuevoSocio,
  sugerenciaUltimoDia,
  sumaDeFilas,
  sumaPorcentajes,
  textoConfirmarBorrados,
  textoGuardadoParcial,
  textoPorcentaje,
  textoResumenPropietarios,
  textoSugerenciaUltimoDia,
  textoSuma,
  validarFilas,
  vigenciasDeAnteriores,
  type FilaPropietario,
  type UsuarioOpcion,
} from "../propietarios";

const HOY = "2026-10-19";
const HERNAN_ID = "11111111-1111-4111-8111-111111111111";
const ALE_ID = "22222222-2222-4222-8222-222222222222";
const MAU_ID = "33333333-3333-4333-8333-333333333333";

const HERNAN: AircraftOwner = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  socio_id: HERNAN_ID,
  porcentaje: "100.000",
  vigente_desde: "2020-01-01",
  vigente_hasta: null,
  notas: null,
  usuario: { nombre: "Hernan Garza", es_empresa: false, rol: "SOCIO" },
};
const ALE: AircraftOwner = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  socio_id: ALE_ID,
  porcentaje: "100.000",
  vigente_desde: "2026-08-18",
  vigente_hasta: null,
  notas: null,
  usuario: { nombre: "Alejandro Canales", es_empresa: false, rol: "ADMIN" },
};

const USUARIOS: UsuarioOpcion[] = [
  { id: ALE_ID, nombre: "Alejandro Canales", rol: "ADMIN", estado: "ACTIVO" },
  { id: HERNAN_ID, nombre: "Hernan Garza", rol: "SOCIO", estado: "INACTIVO" },
  { id: MAU_ID, nombre: "Mauricio Roque", rol: "SOCIO", estado: "INACTIVO" },
  { id: "44444444-4444-4444-8444-444444444444", nombre: "Aero Charter Cancún", rol: "VISITANTE", estado: "INACTIVO", es_empresa: true },
  { id: "55555555-5555-4555-8555-555555555555", nombre: "Abraham Zamora", rol: "PILOTO", estado: "ACTIVO" },
  { id: "66666666-6666-4666-8666-666666666666", nombre: "Piloto Baja", rol: "PILOTO", estado: "INACTIVO" },
];

const NOMBRES = new Map(USUARIOS.map((u) => [u.id, u.nombre]));

describe("roles y selector", () => {
  it("solo ADMIN edita; sin rol conocido se ofrece (el API es el candado)", () => {
    expect(puedeEditarPropietarios("ADMIN")).toBe(true);
    expect(puedeEditarPropietarios(null)).toBe(true);
    expect(puedeEditarPropietarios(undefined)).toBe(true);
    for (const r of ["COORDINADOR", "FACTURACION", "ANALISTA", "SOCIO", "PILOTO", "MECANICO", "VISITANTE"]) {
      expect(puedeEditarPropietarios(r)).toBe(false);
    }
  });

  it("socios y empresas de cualquier estado primero (A–Z), luego los demás ACTIVOS; el elegido aunque esté de baja", () => {
    const sin = opcionesSocios(USUARIOS).map((o) => o.label);
    expect(sin).toEqual([
      "Aero Charter Cancún",
      "Hernan Garza",
      "Mauricio Roque",
      "Abraham Zamora",
      "Alejandro Canales",
    ]);
    expect(sin).not.toContain("Piloto Baja");
    const conBaja = opcionesSocios(USUARIOS, "66666666-6666-4666-8666-666666666666").map((o) => o.label);
    expect(conBaja).toContain("Piloto Baja");
    expect(opcionesSocios(USUARIOS).some((o) => o.value === VALOR_NUEVO_SOCIO)).toBe(false);
    const conNuevo = opcionesSocios(USUARIOS, null, { conNuevo: true });
    expect(conNuevo.at(-1)).toMatchObject({ value: VALOR_NUEVO_SOCIO, label: ETIQUETA_NUEVO_SOCIO });
  });

  it("la descripción rotula «Empresa» o el rol en es-MX", () => {
    expect(descripcionSocio({ rol: "SOCIO" })).toBe("Socio");
    expect(descripcionSocio({ rol: "VISITANTE", es_empresa: true })).toBe("Empresa");
    expect(descripcionSocio({ rol: "ADMIN" })).toBe("Administración");
    expect(descripcionSocio({ rol: "RARO" })).toBe("RARO");
  });

  it("un nombre tecleado que ya existe (sin acentos ni mayúsculas) se elige en vez de duplicarse", () => {
    expect(resolverNuevoSocio("  hernán   GARZA ", USUARIOS)).toEqual({ tipo: "EXISTE", usuario: USUARIOS[1] });
    expect(resolverNuevoSocio("Nuevo  Socio", USUARIOS)).toEqual({ tipo: "NUEVO", nombre: "Nuevo Socio" });
    expect(resolverNuevoSocio(" x ", USUARIOS)).toMatchObject({ tipo: "INVALIDO" });
    expect(resolverNuevoSocio("a".repeat(101), USUARIOS)).toMatchObject({ tipo: "INVALIDO" });
  });
});

describe("porcentajes", () => {
  it("suma en milésimas: 0.1 + 0.2 = 0.3 y «40,92» vale", () => {
    expect(sumaPorcentajes(["0.1", 0.2])).toBe(0.3);
    expect(sumaPorcentajes(["40,92", "59.08"])).toBe(100);
    expect(sumaPorcentajes(["", null, undefined, "abc"])).toBe(0);
  });

  it("textos: «100 %», «40.92 %», estado y la línea viva", () => {
    expect(textoPorcentaje(100)).toBe("100 %");
    expect(textoPorcentaje(40.92)).toBe("40.92 %");
    expect(estadoSuma(100)).toBe("CIEN");
    expect(estadoSuma(100.0004)).toBe("CIEN");
    expect(estadoSuma(100.001)).toBe("MAS");
    expect(estadoSuma(99.9)).toBe("MENOS");
    expect(textoSuma(100)).toBe("Suman 100 %");
    expect(textoSuma(200)).toBe("Suman 200 %: no pueden pasar de 100 %");
    expect(textoSuma(70)).toBe("Suman 70 %: falta 30 % por asignar");
  });

  it("la card: resumen y aviso (el caso XA-VGV)", () => {
    expect(textoResumenPropietarios(2, 200)).toBe("2 propietarios · 200 % asignado");
    expect(textoResumenPropietarios(1, 100)).toBe("1 propietario · 100 % asignado");
    expect(alertaSumaCard(100, 1)).toBeNull();
    expect(alertaSumaCard(0, 0)).toBeNull();
    expect(alertaSumaCard(200, 2)).toBe(
      "Los propietarios vigentes suman 200 %: no pueden pasar de 100 %. Si uno sustituyó a otro, ponle al anterior su último día con «Editar propietarios».",
    );
    expect(alertaSumaCard(59.08, 1)).toBe(
      "Los propietarios vigentes suman 59.08 %; falta 40.92 % por asignar.",
    );
    expect(alertaSumaCard(200, 2, false)).toBe(
      "Los propietarios vigentes suman 200 %: no pueden pasar de 100 %. Si uno sustituyó a otro, administración le pone al anterior su último día.",
    );
  });

  it("la vigencia se lee en días de pared", () => {
    expect(lineaVigencia(HERNAN, HOY)).toBe("desde 01 ene 2020");
    expect(lineaVigencia({ ...HERNAN, vigente_hasta: HOY }, HOY)).toBe("desde 01 ene 2020 · último día 19 oct 2026");
    expect(lineaVigencia({ ...HERNAN, vigente_hasta: "2026-06-07" }, HOY)).toBe("01 ene 2020 – 07 jun 2026");
  });
});

describe("la regla del 100 % por día (espejo del API)", () => {
  it("Hernan 100 + Alejandro 100 se pasan el 18-ago-2026", () => {
    const filas = vigenciasDeAnteriores([HERNAN, ALE]);
    const e = excesoPorcentaje(filas);
    expect(e).toMatchObject({ dia: "2026-08-18", suma: 200 });
    expect(mensajeSumaExcede(e!)).toBe(
      "Los propietarios sumarían 200 % el 18/08/2026 (Hernan Garza 100 % + Alejandro Canales 100 %): no pueden pasar de 100 %. Pon el último día del que sale o baja los porcentajes.",
    );
  });

  it("con Hernan hasta el 17-ago no hay exceso; 40.92 + 59.08 tampoco; 100.001 sí", () => {
    expect(excesoPorcentaje(vigenciasDeAnteriores([{ ...HERNAN, vigente_hasta: "2026-08-17" }, ALE]))).toBeNull();
    expect(
      excesoPorcentaje([
        { id: "a", nombre: "A", porcentaje: "40.920", vigente_desde: "2026-01-01", vigente_hasta: null },
        { id: "b", nombre: "B", porcentaje: 59.08, vigente_desde: "2026-01-01", vigente_hasta: null },
      ]),
    ).toBeNull();
    expect(
      excesoPorcentaje([
        { id: "a", nombre: "A", porcentaje: 100.001, vigente_desde: "2026-01-01", vigente_hasta: null },
      ]),
    ).toMatchObject({ dia: "2026-01-01" });
  });
});

describe("la ventana: filas, quitar, validar", () => {
  it("las filas nacen de los vigentes y una nueva arranca hoy", () => {
    const filas = filasDeVigentes([HERNAN, ALE]);
    expect(filas[0]).toMatchObject({ clave: HERNAN.id, id: HERNAN.id, porcentaje: "100", vigente_hasta: "", quitar: null });
    expect(filaNueva(HOY, 1)).toMatchObject({ clave: "nueva-1", id: null, socio_id: "", porcentaje: "", vigente_desde: HOY });
    expect(sumaDeFilas(filas)).toBe(200);
  });

  it("«Quitar» sugiere el día anterior al relevo; sin relevo, ayer; empezó hoy, hoy", () => {
    const filas = filasDeVigentes([HERNAN, ALE]);
    const s = sugerenciaUltimoDia(filas[0], filas, HOY, NOMBRES);
    expect(s).toEqual({ dia: "2026-08-17", motivo: "RELEVO", relevo: "Alejandro Canales" });
    expect(textoSugerenciaUltimoDia(s)).toBe("El día anterior a que entró Alejandro Canales: 17 ago 2026.");
    const sinRelevo = sugerenciaUltimoDia(filas[1], filas, HOY, NOMBRES);
    expect(sinRelevo).toEqual({ dia: "2026-10-18", motivo: "AYER" });
    const hoyFila: FilaPropietario = { ...filas[1], vigente_desde: HOY };
    expect(sugerenciaUltimoDia(hoyFila, [filas[0], hoyFila], HOY, NOMBRES)).toEqual({ dia: HOY, motivo: "HOY" });
  });

  it("un último día antes del primero se rechaza con el texto del API", () => {
    const [h] = filasDeVigentes([HERNAN]);
    expect(errorUltimoDia(h, "2019-12-31", "Hernan Garza")).toBe(
      "Hernan Garza empezó el 01 ene 2020: no puede terminar antes. Si se agregó por error, elige «Se agregó por error».",
    );
    expect(errorUltimoDia(h, "", "Hernan Garza")).toBe("Elige el último día.");
    expect(errorUltimoDia(h, "2026-08-17", "Hernan Garza")).toBeNull();
  });

  it("validar: 100 + 100 bloquea; cerrar a Hernan el 17-ago lo arregla; socio repetido y % fuera de rango", () => {
    const filas = filasDeVigentes([HERNAN, ALE]);
    const e1 = validarFilas(filas, NOMBRES);
    expect(e1.porFila).toEqual({});
    expect(e1.general).toContain("sumarían 200 % el 18/08/2026");
    const cerradas: FilaPropietario[] = [{ ...filas[0], quitar: { modo: "cerrar", hasta: "2026-08-17" } }, filas[1]];
    expect(validarFilas(cerradas, NOMBRES)).toEqual({ porFila: {}, general: null });
    const repetido = [filas[1], { ...filaNueva(HOY, 1), socio_id: ALE_ID, porcentaje: "0" }];
    const e2 = validarFilas(repetido, NOMBRES);
    expect(e2.porFila["nueva-1"]).toBe("Porcentaje de 0.001 a 100.");
    const rep2 = [filas[1], { ...filaNueva(HOY, 1), socio_id: ALE_ID, porcentaje: "10" }];
    expect(validarFilas(rep2, NOMBRES).porFila["nueva-1"]).toBe("Alejandro Canales ya está en la lista.");
    expect(validarFilas([filaNueva(HOY, 1)], NOMBRES).porFila["nueva-1"]).toBe("Elige el socio.");
  });

  it("los anteriores también cuentan: mover el primer día de uno hacia atrás choca con un régimen cerrado", () => {
    const anterior: AircraftOwner = { ...HERNAN, vigente_hasta: "2026-08-17" };
    const [ale] = filasDeVigentes([ALE]);
    const extras = vigenciasDeAnteriores([anterior]);
    expect(validarFilas([ale], NOMBRES, extras).general).toBeNull();
    const movida = { ...ale, vigente_desde: "2026-08-01" };
    expect(validarFilas([movida], NOMBRES, extras).general).toContain("01/08/2026");
    expect(filasResultantes([movida], NOMBRES, extras)).toHaveLength(2);
  });

  it("propietariosAnteriores: solo los que terminaron antes de hoy, del más reciente al más viejo", () => {
    const hist = [HERNAN, { ...ALE, id: "x", vigente_hasta: "2026-06-07" }, { ...HERNAN, id: "y", vigente_hasta: "2025-01-31" }, { ...ALE, id: "z", vigente_hasta: HOY }];
    expect(propietariosAnteriores(hist, HOY).map((o) => o.id)).toEqual(["x", "y"]);
  });
});

describe("el plan de llamadas", () => {
  it("solo lo que cambió: null para reabrir o vaciar notas, porcentaje en número", () => {
    const [h] = filasDeVigentes([HERNAN]);
    expect(cambiosDeFila(HERNAN, h)).toBeNull();
    expect(cambiosDeFila(HERNAN, { ...h, porcentaje: "100.000" })).toBeNull();
    expect(cambiosDeFila(HERNAN, { ...h, porcentaje: "40.92", socio_id: MAU_ID, vigente_desde: "2026-01-01" })).toEqual({
      porcentaje: 40.92,
      socio_id: MAU_ID,
      vigente_desde: "2026-01-01",
    });
    const conFin: AircraftOwner = { ...HERNAN, vigente_hasta: HOY, notas: "temporal" };
    const [f] = filasDeVigentes([conFin]);
    expect(cambiosDeFila(conFin, { ...f, vigente_hasta: "", notas: " " })).toEqual({ vigente_hasta: null, notas: null });
  });

  it("XA-VGV: cerrar a Hernan el 17-ago ⇒ un solo paso «cerrar»", () => {
    const filas = filasDeVigentes([HERNAN, ALE]);
    const plan = planPropietarios(
      [{ ...filas[0], quitar: { modo: "cerrar", hasta: "2026-08-17" } }, filas[1]],
      [HERNAN, ALE],
      NOMBRES,
    );
    expect(plan).toEqual([{ tipo: "cerrar", id: HERNAN.id, hasta: "2026-08-17", nombre: "Hernan Garza" }]);
    expect(descripcionPaso(plan[0])).toBe("Hernan Garza: último día 17 ago 2026");
    expect(planPideConfirmacion(plan, 100)).toBe(false);
  });

  it("orden: borrar → cerrar → bajan → suben → crear (lo que quita antes de lo que suma)", () => {
    const filas = filasDeVigentes([HERNAN, ALE]);
    const nueva = { ...filaNueva(HOY, 1), socio_id: MAU_ID, porcentaje: "30" };
    const plan = planPropietarios(
      [{ ...filas[0], quitar: { modo: "borrar" } }, { ...filas[1], porcentaje: "70" }, nueva],
      [HERNAN, ALE],
      NOMBRES,
    );
    expect(plan.map((p) => p.tipo)).toEqual(["borrar", "actualizar", "crear"]);
    expect(plan[1]).toMatchObject({ patch: { porcentaje: 70 } });
    expect(plan[2]).toMatchObject({ alta: { socio_id: MAU_ID, porcentaje: 30, vigente_desde: HOY } });
    expect(descripcionPaso(plan[2])).toBe("Mauricio Roque: agregado con 30 % desde 19 oct 2026");
    expect(planPideConfirmacion(plan, 100)).toBe(true);
    // Uno sube y otro baja: baja primero.
    const plan2 = planPropietarios(
      [{ ...filas[0], porcentaje: "40" }, { ...filas[1], porcentaje: "60" }],
      [HERNAN, ALE],
      NOMBRES,
    );
    expect(plan2.map((p) => (p.tipo === "actualizar" ? p.nombre : p.tipo))).toEqual(["Hernan Garza", "Alejandro Canales"]);
    expect(planPropietarios(filas, [HERNAN, ALE], NOMBRES)).toEqual([]);
    // Una fila nueva «quitada» no viaja; una sin porcentaje tampoco.
    expect(planPropietarios([{ ...nueva, quitar: { modo: "borrar" } }], [], NOMBRES)).toEqual([]);
  });

  it("textos de confirmación y de guardado parcial", () => {
    expect(planPideConfirmacion([], 70)).toBe(true);
    expect(textoConfirmarBorrados(["Hernan Garza"])).toBe(
      "Se borrará del historial como si nunca hubiera sido propietario: Hernan Garza. Los repartos de los meses en que figuraba cambian y no se puede deshacer.",
    );
    expect(textoConfirmarBorrados([])).toBe("");
    const paso = { tipo: "crear" as const, alta: { socio_id: MAU_ID, porcentaje: 30, vigente_desde: HOY }, nombre: "Mauricio Roque" };
    expect(textoGuardadoParcial(0, 2, paso, "boom")).toBe(
      "No se aplicó ningún cambio. Falló «Mauricio Roque: agregado con 30 % desde 19 oct 2026»: boom",
    );
    expect(textoGuardadoParcial(1, 2, paso, "boom")).toBe(
      "Se aplicaron 1 de 2 cambios (ya están guardados). Falló «Mauricio Roque: agregado con 30 % desde 19 oct 2026»: boom",
    );
  });
});
