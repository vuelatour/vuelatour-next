/**
 * Revisión del lote 0.0.81 (15-oct-2026) sobre el tacómetro omitido:
 *  1. FACTURACION omite (ROLES_OMITIR_TACO) pero el API le niega
 *     `POST :id/start` y `POST :id/complete` (@Roles ADMIN/COORDINADOR/PILOTO,
 *     403 «Required role: …» en inglés). El toast tras omitir NO le ofrece la
 *     acción: le dice que avise a coordinación.
 *  2. Lista de vuelos: `taco-status` también para los vuelos propios nunca
 *     iniciados (icono «omitido» del #301/#279), y el triángulo «incompleto»
 *     solo en EN_VUELO/COMPLETADO (el API dice `falta: true` de un vuelo
 *     futuro sin lecturas).
 */
import { describe, expect, it } from "vitest";
import {
  ROLES_COMPLETAR_VUELO,
  esRolCompletarVuelo,
  esRolOmitirTaco,
  faltaTacoEnLista,
  mensajeOmision,
  pideTacoStatusEnLista,
  toastOmitidoCompletableSinPermiso,
  toastOmitidoIniciarSinPermiso,
} from "../taco-omitido";

describe("quién completa un vuelo con tacómetro omitido", () => {
  it("espejo exacto de @Roles de start/complete en el API", () => {
    expect(ROLES_COMPLETAR_VUELO).toEqual(["ADMIN", "COORDINADOR", "PILOTO"]);
  });

  it("FACTURACION omite pero NO completa; ADMIN/COORDINADOR sí; sin rol, no", () => {
    expect(esRolOmitirTaco("FACTURACION")).toBe(true);
    expect(esRolCompletarVuelo("FACTURACION")).toBe(false);
    expect(esRolCompletarVuelo("ADMIN")).toBe(true);
    expect(esRolCompletarVuelo("COORDINADOR")).toBe(true);
    expect(esRolCompletarVuelo("SOCIO")).toBe(false);
    expect(esRolCompletarVuelo(null)).toBe(false);
    expect(esRolCompletarVuelo(undefined)).toBe(false);
  });

  it("textos congelados del toast sin permiso", () => {
    expect(toastOmitidoCompletableSinPermiso(300)).toBe(
      "Tacómetro omitido. El vuelo #300 ya se puede completar: avisa a coordinación para completarlo.",
    );
    expect(toastOmitidoIniciarSinPermiso(301)).toBe(
      "Tacómetro omitido. El vuelo #301 nunca se inició en la app: avisa a coordinación para iniciarlo y completarlo.",
    );
  });

  it("#300 EN_VUELO completable omitido por FACTURACION: sin acción «Completar vuelo»", () => {
    expect(mensajeOmision({ vuelo: { folio: 300, completable: true } }, false, false)).toEqual({
      texto: toastOmitidoCompletableSinPermiso(300),
      accion: null,
    });
  });

  it("#301 CONFIRMADO omitido por FACTURACION: sin acción «Iniciar y completar»", () => {
    expect(
      mensajeOmision({ vuelo: { folio: 301, completable: false, requiere_iniciar: true } }, false, false),
    ).toEqual({ texto: toastOmitidoIniciarSinPermiso(301), accion: null });
  });

  it("con permiso se conserva la acción de siempre", () => {
    expect(mensajeOmision({ vuelo: { folio: 300, completable: true } }, false, true).accion).toBe(
      "completar",
    );
    expect(
      mensajeOmision({ vuelo: { folio: 301, completable: false, requiere_iniciar: true } }, false, true)
        .accion,
    ).toBe("iniciar_y_completar");
  });
});

describe("lista de vuelos: taco-status y triángulo", () => {
  it("se consulta todo vuelo propio no cancelado, también el nunca iniciado (#301)", () => {
    for (const estado of ["RESERVA", "SOLICITUD", "COTIZADO", "CONFIRMADO", "EN_VUELO", "COMPLETADO"]) {
      expect(pideTacoStatusEnLista({ es_externo: false, estado })).toBe(true);
    }
    expect(pideTacoStatusEnLista({ es_externo: false, estado: "CANCELADO" })).toBe(false);
    expect(pideTacoStatusEnLista({ es_externo: true, estado: "EN_VUELO" })).toBe(false);
  });

  it("el triángulo solo en EN_VUELO/COMPLETADO (un futuro sin lecturas no «falta»)", () => {
    expect(faltaTacoEnLista("EN_VUELO", true)).toBe(true);
    expect(faltaTacoEnLista("COMPLETADO", true)).toBe(true);
    expect(faltaTacoEnLista("CONFIRMADO", true)).toBe(false);
    expect(faltaTacoEnLista("RESERVA", true)).toBe(false);
    expect(faltaTacoEnLista("EN_VUELO", false)).toBe(false);
    expect(faltaTacoEnLista("EN_VUELO", undefined)).toBe(false);
  });
});
