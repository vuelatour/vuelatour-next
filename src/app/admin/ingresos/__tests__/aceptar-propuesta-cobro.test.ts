/**
 * «Sugerir con IA» de Ingresos → propuesta LIGAR a un COBRO de vuelo
 * (revisión del 15-oct-2026, D3 de «un cobro, varios abonos»).
 *
 * Antes la action ligaba directo con `{cobro_id}`: con un abono MENOR que lo
 * que falta, el API 0.0.78 la acepta SIN bandera y el cobro quedaba
 * «Conciliado parcial» sin la confirmación «¿Vincular como pago parcial?»
 * (el toast decía «Abono conciliado»). Ahora lee ANTES el veredicto del API
 * (`al_vincular` de `candidatos-cobro`):
 *
 *  1. PARCIAL ⇒ `CONFIRMAR_PARCIAL` con el cobro en `details.candidato` y
 *     NADA escrito; con `parcialConfirmado` ⇒ la liga;
 *  2. CONCILIADO ⇒ la liga de siempre;
 *  3. un rechazo (EXCEDE…) o el cobro que ya no es candidato ⇒ a mano, sin PATCH;
 *  4. sin poder leer el veredicto ⇒ error y NADA escrito;
 *  5. API ≤ 0.0.77 (sin la capacidad): la liga de siempre; un sobre, directo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  CODE_CONFIRMAR_PARCIAL,
  CODE_PROPUESTA_A_MANO,
  CODE_PROPUESTA_SIN_VEREDICTO,
  MSG_PROPUESTA_COBRO_NO_ESTA,
  MSG_PROPUESTA_PARCIAL,
  MSG_PROPUESTA_SIN_VEREDICTO,
} from "@/lib/admin/conciliacion-cobros-lote";
import type { AlVincularCobro } from "@/types/conciliacion";
import type { PropuestaAbono } from "@/types/ingresos";

const apiServer = vi.fn();
const revalidatePath = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { aceptarPropuestaAbonoAction } = await import("../actions");

const ABONO = "a1700000-0000-4000-8000-00000000000a";
const C315 = "c3150000-0000-4000-8000-000000000315";
const SOBRE = "5b0e0000-0000-4000-8000-000000000012";

/** La IA propone LIGAR el SPEI de $1,700 al cobro #315 de $3,400 (no cuadra exacto). */
const propuesta = (over: Partial<PropuestaAbono> = {}): PropuestaAbono =>
  ({
    movimiento_id: ABONO,
    fecha: "2026-09-15",
    monto: 1700,
    descripcion: "SPEI RECIBIDO BEH KAY",
    referencia: null,
    cuenta_alias: "EJE SCOTIA",
    cuenta_moneda: "MXN",
    origen: "IA",
    accion: "LIGAR",
    candidato: {
      tipo: "COBRO_VUELO",
      id: C315,
      etiqueta: "Cobro · vuelo #315",
      fecha: "2026-09-15",
      monto: 3400,
      neto: 3400,
      moneda: "MXN",
      metodo_etiqueta: "Transferencia",
      cliente: "Beh Kay",
      vuelo_id: "f3150000-0000-4000-8000-000000000315",
      grupo_id: null,
      es_anticipo: false,
    },
    confianza: 0.7,
    monto_exacto: false,
    razon: "El nombre del cliente en la descripción",
    evidencias: [],
    alternativas: [],
    categoria_sugerida: null,
    cliente_sugerido: null,
    posible_duplicado: false,
    motivo_sin_match: null,
    ...over,
  }) as PropuestaAbono;

const al = (over: Partial<AlVincularCobro> = {}): AlVincularCobro => ({
  estado: "CONCILIADO",
  faltante_antes: 3400,
  faltante_despues: 0,
  sobrante: 0,
  comision_real: null,
  tc_implicito: null,
  tc_referencia: null,
  desvio_pct: null,
  motivo: null,
  un_solo: false,
  ...over,
});

const candidato = (alVincular: AlVincularCobro | undefined, cobroId = C315) => ({
  tipo: "COBRO_VUELO",
  id: cobroId,
  cobro_id: cobroId,
  vuelo_id: "f3150000-0000-4000-8000-000000000315",
  folio: 315,
  fecha_vuelo: null,
  cliente: "Beh Kay",
  fecha_cobro: "2026-09-15T17:00:00Z",
  monto: 3400,
  moneda: "MXN",
  metodo_cobro: "TRANSFERENCIA",
  referencia: null,
  comision_banco_monto: null,
  neto: 3400,
  dif_monto: 1700,
  ...(alVincular ? { al_vincular: alVincular } : {}),
});

/** La respuesta de `candidatos-cobro` (API 0.0.78 con la capacidad; `previo` = sin ella). */
const candidatos = (lista: unknown[], previo = false) => ({
  movimiento: {
    id: ABONO,
    fecha: "2026-09-15",
    monto: 1700,
    tipo: "ABONO",
    moneda: "MXN",
    cobro_id: null,
    cobro_grupo_id: null,
    ...(previo ? {} : { cobros_n: 0, cobro_ids: [], cobros_parciales: true, tipo_cuenta: "BANCO", corregir_comision: true }),
  },
  candidatos: lista,
  exactos: 0,
});

const rutas = () => apiServer.mock.calls.map(([ruta, init]) => `${(init as { method?: string })?.method ?? "GET"} ${ruta}`);
const LEER = `GET /v1/conciliacion/movimientos/${ABONO}/candidatos-cobro`;
const LIGAR = `PATCH /v1/conciliacion/movimientos/${ABONO}/cobro`;

beforeEach(() => {
  apiServer.mockReset();
  revalidatePath.mockReset();
});

describe("aceptar una propuesta LIGAR de la IA a un cobro de vuelo", () => {
  it("PARCIAL: pide confirmar (con el cobro y su `al_vincular`) y NO liga", async () => {
    const parcial = al({ estado: "PARCIAL", faltante_antes: 3400, faltante_despues: 1700 });
    apiServer.mockResolvedValueOnce(candidatos([candidato(parcial)]));
    const r = await aceptarPropuestaAbonoAction(propuesta());
    expect(r).toMatchObject({ ok: false, code: CODE_CONFIRMAR_PARCIAL, error: MSG_PROPUESTA_PARCIAL });
    expect((r.details as { candidato?: { cobro_id?: string; al_vincular?: AlVincularCobro } }).candidato).toMatchObject({
      cobro_id: C315,
      al_vincular: { estado: "PARCIAL", faltante_despues: 1700 },
    });
    expect(rutas()).toEqual([LEER]);
    expect(apiServer.mock.calls[0][1]).toMatchObject({ searchParams: { dias: 30 }, cache: "no-store" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("PARCIAL confirmado: lee otra vez el veredicto y liga con `{cobro_id}`", async () => {
    const parcial = al({ estado: "PARCIAL", faltante_antes: 3400, faltante_despues: 1700 });
    apiServer.mockResolvedValueOnce(candidatos([candidato(parcial)])).mockResolvedValueOnce({ id: ABONO });
    const r = await aceptarPropuestaAbonoAction(propuesta(), { parcialConfirmado: true });
    expect(r.ok).toBe(true);
    expect(rutas()).toEqual([LEER, LIGAR]);
    expect(apiServer.mock.calls[1][1]).toEqual({ method: "PATCH", body: { cobro_id: C315, cobro_grupo_id: null } });
  });

  it("CONCILIADO (cuadra con lo que falta): la liga de siempre, sin confirmación", async () => {
    apiServer.mockResolvedValueOnce(candidatos([candidato(al())])).mockResolvedValueOnce({ id: ABONO });
    const r = await aceptarPropuestaAbonoAction(propuesta({ monto_exacto: true, confianza: 0.95 }));
    expect(r.ok).toBe(true);
    expect(rutas()).toEqual([LEER, LIGAR]);
  });

  it("un rechazo del API (EXCEDE) o el cobro que ya no es candidato: a mano, sin PATCH", async () => {
    apiServer.mockResolvedValueOnce(candidatos([candidato(al({ estado: "EXCEDE", sobrante: 977.45 }))]));
    const excede = await aceptarPropuestaAbonoAction(propuesta({ monto: 4377.45 }));
    expect(excede).toMatchObject({ ok: false, code: CODE_PROPUESTA_A_MANO });
    expect(excede.error).toContain("sobran $977.45 MXN");
    expect(excede.error).toContain("revísalo a mano con «Vincular a un cobro o ingreso»");
    apiServer.mockResolvedValueOnce(candidatos([candidato(al(), "c9990000-0000-4000-8000-000000000999")]));
    const noEsta = await aceptarPropuestaAbonoAction(propuesta());
    expect(noEsta).toMatchObject({ ok: false, code: CODE_PROPUESTA_A_MANO, error: MSG_PROPUESTA_COBRO_NO_ESTA });
    expect(rutas()).toEqual([LEER, LEER]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sin poder leer el veredicto (Railway reiniciando): error y NADA escrito", async () => {
    apiServer.mockRejectedValueOnce(new ApiError({ statusCode: 502, code: "PARSE_ERROR", message: "Bad Gateway" }));
    const r = await aceptarPropuestaAbonoAction(propuesta());
    expect(r).toEqual({ ok: false, code: CODE_PROPUESTA_SIN_VEREDICTO, error: MSG_PROPUESTA_SIN_VEREDICTO });
    expect(rutas()).toEqual([LEER]);
  });

  it("API ≤ 0.0.77 (sin `cobros_parciales`): la liga de siempre (no existe el parcial)", async () => {
    apiServer.mockResolvedValueOnce(candidatos([candidato(undefined)], true)).mockResolvedValueOnce({ id: ABONO });
    const r = await aceptarPropuestaAbonoAction(propuesta());
    expect(r.ok).toBe(true);
    expect(rutas()).toEqual([LEER, LIGAR]);
  });

  it("un sobre de grupo liga directo (el API rechaza con SOBRE_NO_CUADRA: no hay parcial silencioso)", async () => {
    apiServer.mockResolvedValueOnce({ id: ABONO });
    const p = propuesta();
    const r = await aceptarPropuestaAbonoAction({ ...p, candidato: { ...p.candidato!, tipo: "SOBRE_GRUPO", id: SOBRE } });
    expect(r.ok).toBe(true);
    expect(rutas()).toEqual([LIGAR]);
    expect(apiServer.mock.calls[0][1]).toEqual({ method: "PATCH", body: { cobro_id: null, cobro_grupo_id: SOBRE } });
  });
});

describe("la ventana de sugerencias (fuente)", () => {
  const src = readFileSync(
    path.resolve(__dirname, "../../../../components/admin/ingresos/sugerencias-abonos-dialog.tsx"),
    "utf8",
  );

  it("CONFIRMAR_PARCIAL abre «¿Vincular como pago parcial?» y la liga sale SOLO al confirmar", () => {
    expect(src).toContain("r.code === CODE_CONFIRMAR_PARCIAL && !confirmado ? candidatoConfirmarParcial(r.details) : null");
    expect(src).toMatch(/if \(porConfirmar\) \{[\s\S]*?setParcial\(\{ p, candidato: porConfirmar \}\);\s*return;/);
    expect(src).toContain("<ConfirmacionVincular");
    expect(src).toMatch(/onCancelar=\{\(\) => setParcial\(null\)\}/);
    expect(src).toMatch(/if \(x\) void aceptarUna\(x\.p, x\.candidato\);/);
    expect(src).toContain("aceptarPropuestaAbonoAction(p, confirmado ? { parcialConfirmado: true } : undefined)");
  });
});
