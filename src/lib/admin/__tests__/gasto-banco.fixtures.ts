/**
 * Fixtures REALES (prod, 13-oct-2026) de la «conciliación al revés»
 * (`GET /v1/conciliacion/gastos/:id`, API 0.0.75). No es un archivo de
 * pruebas: lo comparten `gasto-banco.test.ts` y las pruebas de componentes.
 */
import type { CargoDeGasto, ConciliacionDeGasto, MovimientoGasto } from "@/types/conciliacion";

export const ID_345 = "4e29c476-a956-440f-bd83-2c70f78279d4";
export const MOV_SAESA = "73a8d809-6468-4554-add4-f874a0c4ed9c";
export const CUENTA_EJE = "212add6c-c4e5-44cc-a30c-0635c0ab3036";
export const CUENTA_GASTOS = "76a931e0-7c06-47c6-a574-6c7d4a698c14";
export const EC_EJE_SEP = "1758cc58-7d78-4f73-966b-e7867803b8cc";

const gastoLote = (id: string, folio: number, vueloId: string): MovimientoGasto => ({
  id,
  monto: "2801.4",
  moneda: "MXN",
  categoria: "OPERACIONES",
  fecha_gasto: "2026-09-28",
  vuelo_id: vueloId,
  vuelo: { folio },
  medio_pago: "TRANSFERENCIA",
  proveedor: null,
  lugar: null,
  notas_primera_linea: "Pago VIP SAESA",
  folio_comprobante: null,
  monto_parte: 2801.4,
  monto_vinculado: 2801.4,
  faltante: 0,
});

/** El cargo del lote VIP SAESA (4 × 2,801.40) visto desde #345. */
export const cargoSaesa = (over: Partial<CargoDeGasto> = {}): CargoDeGasto => ({
  movimiento_id: MOV_SAESA,
  fecha: "2026-09-30",
  tipo: "CARGO",
  monto: 11205.6,
  moneda: "MXN",
  descripcion: "SEL TRANSF. INTERBANCARIA SPEI",
  referencia: "00000000000000000001",
  conciliado: true,
  origen: "IMPORTADO",
  creado_at: "2026-10-06T15:22:46.58996+00:00",
  creado_por: "Alejandro Canales",
  orden_archivo: null,
  cuenta: { id: CUENTA_EJE, alias: "EJE SCOTIA", banco: "Scotiabank", moneda: "MXN", tipo: "BANCO" },
  estado_cuenta: {
    id: EC_EJE_SEP,
    filename: "scotia eje sep.pdf",
    formato: "pdf",
    importado_at: "2026-10-06T15:22:46.413405+00:00",
    importado_por: "Alejandro Canales",
    movimientos_importados: 98,
  },
  sin_archivo: null,
  parte: {
    monto_parte: 2801.4,
    moneda: "MXN",
    cruzada: false,
    registro: { por: "Diego Ramírez", at: "2026-10-13T21:43:29.382119+00:00" },
  },
  lote: {
    gastos_n: 4,
    gastos: [
      gastoLote("4cee0dfe-dcb9-41c5-98c6-1be19d147c1a", 332, "a3320000-0000-4000-8000-000000000332"),
      gastoLote(ID_345, 345, "7d50c91c-eca6-4184-a13e-166f9fd97425"),
      gastoLote("5329b2dd-8649-46c6-80c9-a360803a4dea", 344, "a3440000-0000-4000-8000-000000000344"),
      gastoLote("f58868a3-bc96-4fb6-9b86-4b93ea096352", 337, "a3370000-0000-4000-8000-000000000337"),
    ],
    gastos_suma: 11205.6,
    gastos_diferencia: 0,
  },
  justificacion: null,
  notas_oficina: null,
  ...over,
});

/** El gasto #345 del lote VIP SAESA (la respuesta del ejemplo del contrato). */
export const respuesta345 = (over: Partial<ConciliacionDeGasto> = {}): ConciliacionDeGasto => ({
  gasto: {
    id: ID_345,
    fecha_gasto: "2026-09-28",
    categoria: "OPERACIONES",
    monto: 2801.4,
    moneda: "MXN",
    medio_pago: "TRANSFERENCIA",
    tarjeta_terminacion: null,
    tc_gasto: null,
    conciliado: true,
    vuelo_id: "7d50c91c-eca6-4184-a13e-166f9fd97425",
    vuelo_folio: 345,
    proveedor: null,
    lugar: null,
    notas_primera_linea: "Pago VIP SAESA",
    folio_comprobante: null,
  },
  estado: "CONCILIADO",
  fuente: "PUENTE",
  vista: { n_partes: 1, cruzado: false, suma: 2801.4, monto_vinculado: 2801.4, faltante: 0, cubierto: true },
  cargos: [cargoSaesa()],
  alertas: [],
  ultimos_movimientos: null,
  ...over,
});

/** 1↔1 simple (#321, $2,231.38, GASTOS GNRAL, «scotia gastos (6).pdf», Jimmy Chi). */
export const respuesta321 = (): ConciliacionDeGasto => {
  const base = respuesta345();
  return {
    ...base,
    gasto: { ...base.gasto, id: "cc7d64b0-cb0a-44cc-9782-20af116c7bcf", fecha_gasto: "2026-09-21", monto: 2231.38, vuelo_folio: 321 },
    vista: { n_partes: 1, cruzado: false, suma: 2231.38, monto_vinculado: 2231.38, faltante: 0, cubierto: true },
    cargos: [
      cargoSaesa({
        movimiento_id: "5e879489-a73c-469b-9d1f-0a27456f59be",
        fecha: "2026-09-24",
        monto: 2231.38,
        cuenta: { id: CUENTA_GASTOS, alias: "GASTOS GNRAL", banco: "Scotiabank", moneda: "MXN", tipo: "BANCO" },
        estado_cuenta: {
          id: "e5000000-0000-4000-8000-000000000006",
          filename: "scotia gastos (6).pdf",
          formato: "pdf",
          importado_at: "2026-09-29T16:00:00+00:00",
          importado_por: "Jimmy Chi",
          movimientos_importados: 120,
        },
        parte: {
          monto_parte: 2231.38,
          moneda: "MXN",
          cruzada: false,
          registro: { por: "Jimmy Chi", at: "2026-10-02T22:56:07.007561+00:00" },
        },
        lote: null,
      }),
    ],
  };
};

/** SIN_CONCILIAR: el GAS 46fa1d14 de $8,939.38 del 01-sep con tarjeta ****4929. */
export const respuestaSinConciliar = (over: Partial<ConciliacionDeGasto["gasto"]> = {}): ConciliacionDeGasto => ({
  gasto: {
    id: "46fa1d14-a23e-44f7-9a47-5d11b3f6631b",
    fecha_gasto: "2026-09-01",
    categoria: "GAS",
    monto: 8939.38,
    moneda: "MXN",
    medio_pago: "TARJETA_CORP",
    tarjeta_terminacion: "4929",
    tc_gasto: null,
    conciliado: false,
    vuelo_id: null,
    vuelo_folio: null,
    proveedor: null,
    lugar: null,
    notas_primera_linea: null,
    folio_comprobante: null,
    ...over,
  },
  estado: "SIN_CONCILIAR",
  fuente: "PUENTE",
  vista: { n_partes: 0, cruzado: false, suma: 0, monto_vinculado: 0, faltante: 8939.38, cubierto: false },
  cargos: [],
  alertas: [],
  ultimos_movimientos: [
    { cuenta: { id: "c1", alias: "COMBUSTIBLE", banco: "Scotiabank", moneda: "MXN", tipo: "BANCO" }, ultima_fecha: "2026-10-12" },
    { cuenta: { id: CUENTA_EJE, alias: "EJE SCOTIA", banco: "Scotiabank", moneda: "MXN", tipo: "BANCO" }, ultima_fecha: "2026-10-12" },
    { cuenta: { id: CUENTA_GASTOS, alias: "GASTOS GNRAL", banco: "Scotiabank", moneda: "MXN", tipo: "BANCO" }, ultima_fecha: "2026-10-12" },
    { cuenta: { id: "c4", alias: "HSBC Pesos", banco: "HSBC", moneda: "MXN", tipo: "BANCO" }, ultima_fecha: "2026-10-07" },
    { cuenta: { id: "pw", alias: "Paywise", banco: "Paywise", moneda: "MXN", tipo: "PASARELA" }, ultima_fecha: "2026-09-30" },
    { cuenta: { id: "c6", alias: "SCOTIA USD", banco: "Scotiabank", moneda: "USD", tipo: "BANCO" }, ultima_fecha: null },
  ],
});
