/**
 * CUENTA CORRIENTE DE LOS SOCIOS en el panel (v2, 1-oct-2026, API 0.0.50).
 *
 * Aclaración del cliente: «cuánto se le ha ido repartiendo a los socios,
 * cuánto falta por repartir, cómo se le repartió, la fecha de la entrega y
 * algún comprobante escaneado».
 *
 * Qué se custodia (marcado con `react-dom/server` + cableado leído del
 * código, como el resto del panel):
 *  1. «Pagos a socios»: Socio · Generado · Entregado · Por entregar · Estatus
 *     · Última entrega · acciones (ADMIN/FACTURACION registran y configuran;
 *     el resto solo «Ver cuenta»), totales, cuenta sin configurar y avisos;
 *  2. el estado de cuenta: movimientos con saldo corrido (utilidad por mes y
 *     avión, mes en curso marcado, entregas con su detalle y comprobante,
 *     «Editar» / «Eliminar») y el resumen por mes;
 *  3. «Socios · por entregar» en el reparto con CUALQUIER periodo, y la
 *     tabla por avión de vuelta a «Socio · % · Utilidad del periodo»;
 *  4. una carga FALLIDA nunca se pinta como «sin socios»;
 *  5. el CABLEADO: menú, sidebar (gana el href más largo), páginas, el
 *     DELETE solo desde el diálogo de motivo, el adelanto reintenta con la
 *     MISMA llave, el comprobante va del navegador directo al API y el
 *     pre-cierre pinta los items nuevos;
 *  6. las PIEZAS de las páginas renderizadas de verdad (revisión adversaria
 *     1-oct-2026): KPIs con un socio ADELANTADO («Adelantado (a favor de
 *     VuelaTour)», sin signo) y POR_ENTREGAR, el banner de cuenta sin
 *     configurar por ROL, «Solo puedes ver tu propia cuenta», «Disponible
 *     cuando…», el enlace a las entregas anteriores al arranque y el filtro
 *     de meses (etiquetas ligadas a su selector).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  MovimientoCuenta,
  PagoSocio,
  ResumenCuentaSocio,
  SociosCuentaRespuesta,
} from "@/types/reparto-pagos";
import type { CargaCuentas, ContextoEntrega, ContextoRegistro } from "@/lib/admin/reparto-pagos";
import type { RepartoSocio } from "@/types/profit-sharing";

vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/profit-sharing/socios",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/admin/profit-sharing/actions", () => ({
  crearPagoSocioAction: async () => ({ ok: true }),
  editarPagoSocioAction: async () => ({ ok: true }),
  eliminarPagoSocioAction: async () => ({ ok: true }),
  configurarCuentaSocioAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/api/reparto-pagos-browser", () => ({
  adjuntarComprobantePagoSocio: async () => ({ ok: true }),
}));

const { SociosCuentaTable } = await import("../socios-cuenta-table");
const { SociosPorEntregarSection } = await import("../socios-por-entregar-section");
const { MovimientosCuenta } = await import("../movimientos-cuenta");
const { ResumenMesesCuenta } = await import("../resumen-meses-cuenta");
const { SociosSection } = await import("../socios-section");
const { EstadoCuentaBadge } = await import("../estado-cuenta-badge");
const {
  AvisoEntregasPrevias,
  BannerCuentaNoConfigurada,
  KpisCuenta,
  KpisCuentasSocios,
  SinPermisoCuenta,
  TarjetaCuentasNoDisponibles,
} = await import("../estado-cuenta-partes");
const { FiltroMesesCuenta } = await import("../filtro-meses-cuenta");
const { itemNavActivo, filterNavGroupsForRole } = await import("@/lib/admin/nav-items");
const { getPageTitleFromPathname } = await import("@/lib/admin/page-title");

const MAURICIO = "50c10000-0000-4000-8000-000000000001";
const ACC = "50c10000-0000-4000-8000-000000000002";
const SAAB = "50c10000-0000-4000-8000-000000000003";
const N4142R = "a1a1a1a1-0000-4000-8000-000000000001";
const ALE = { id: "0f1c0000-0000-4000-8000-000000000009", nombre: "Alejandro Canales" };

const REGISTRO: ContextoRegistro = { usuarios: [ALE], me: ALE, hoy: "2026-10-01", tcOficial: 18.45 };

const fila = (over: Partial<ResumenCuentaSocio>): ResumenCuentaSocio => ({
  socio: { id: MAURICIO, nombre: "Mauricio Roque" },
  cuenta: { cuenta_desde: "2026-09", saldo_inicial_usd: 0, notas: null, configurada: true },
  generado_usd: 1602.04,
  mes_en_curso_usd: 206.1,
  entregado_usd: 3783.78,
  por_entregar_usd: -2181.74,
  estado: "ADELANTADO",
  ultimo_pago: {
    id: "9a9a0000-0000-4000-8000-000000000001",
    fecha_pago: "2026-10-01",
    monto: 70000,
    moneda: "MXN",
    monto_usd: 3783.78,
    metodo: "EFECTIVO",
  },
  aviones: [{ id: N4142R, matricula: "N4142R", porcentaje: 69, vigente: true }],
  avisos: [],
  ...over,
});

const SOCIOS: ResumenCuentaSocio[] = [
  fila({}),
  fila({
    socio: { id: ACC, nombre: "Aero Charter Cancun S.A. de C.V." },
    cuenta: { cuenta_desde: "2026-09", saldo_inicial_usd: 0, notas: null, configurada: false },
    generado_usd: 586.7,
    mes_en_curso_usd: 0,
    entregado_usd: 0,
    por_entregar_usd: 586.7,
    estado: "POR_ENTREGAR",
    ultimo_pago: null,
    aviones: [{ id: N4142R, matricula: "N4142R", porcentaje: 29, vigente: true }],
    avisos: ["El avión N111XX está dado de baja: el reparto ya no calcula su utilidad, así que no suma a esta cuenta."],
  }),
  fila({
    socio: { id: SAAB, nombre: "Alexander E. Saab" },
    generado_usd: 40.46,
    mes_en_curso_usd: 0,
    entregado_usd: 40.46,
    por_entregar_usd: 0,
    estado: "AL_CORRIENTE",
    ultimo_pago: null,
    aviones: [{ id: N4142R, matricula: "N4142R", porcentaje: 2, vigente: true }],
  }),
];

const TOTALES = {
  generado_usd: 2229.2,
  entregado_usd: 3824.24,
  por_entregar_usd: 586.7,
  adelantado_usd: 2181.74,
  socios_por_entregar: 1,
  socios_adelantados: 1,
};

const botones = (html: string) => html.match(/<button[^>]*>/g) ?? [];

describe("«Pagos a socios» (lista de cuentas)", () => {
  const html = renderToStaticMarkup(
    <SociosCuentaTable socios={SOCIOS} totales={TOTALES} hastaMes="2026-10" puedeRegistrar registro={REGISTRO} />,
  );

  it("columnas «Socio · Generado · Entregado · Saldo por entregar · Estatus · Última entrega · Acciones»", () => {
    const ths = (html.match(/<th[^>]*>([^<]*)<\/th>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, ""));
    expect(ths).toEqual(["Socio", "Generado", "Entregado", "Saldo por entregar", "Estatus", "Última entrega", "Acciones"]);
  });

  it("un saldo ADELANTADO conserva el signo y lleva la marca «adelantado» en azul (solo ese renglón)", () => {
    expect((html.match(/data-marca-adelantado/g) ?? []).length).toBe(1);
    expect(html).toMatch(/text-sky-700[^"]*"[^>]*>-\$2,181\.74<span[^>]*data-marca-adelantado[^>]*>adelantado<\/span>/);
  });

  it("montos del API por socio, el mes en curso dicho y el estatus con su color", () => {
    expect(html).toContain("$1,602.04");
    expect(html).toContain("incluye $206.10 de Octubre 2026 (en curso: cambia día con día)");
    expect(html).toContain("-$2,181.74");
    expect(html).toContain('data-estado-cuenta="ADELANTADO"');
    expect(html).toContain('data-estado-cuenta="POR_ENTREGAR"');
    expect(html).toContain('data-estado-cuenta="AL_CORRIENTE"');
    expect(html).toMatch(/01 oct\.? 2026 · \$70,000 MXN · Efectivo/);
    expect(html).toContain("Sin entregas");
    expect(html).toContain("N4142R 69 %");
  });

  it("cuenta sin configurar y avisos del API a la vista; el `title` de la etiqueta depende del rol", () => {
    expect((html.match(/data-cuenta-sin-configurar/g) ?? []).length).toBe(1);
    expect(html).toContain("El avión N111XX está dado de baja");
    expect(html).toContain('title="La cuenta de este socio arranca en septiembre 2026 con saldo 0. Si hubo repartos anteriores, configura el mes de arranque y el saldo inicial."');
    const lectura = renderToStaticMarkup(
      <SociosCuentaTable socios={SOCIOS} totales={null} hastaMes="2026-10" puedeRegistrar={false} registro={REGISTRO} />,
    );
    expect(lectura).toContain(
      'title="La cuenta de este socio arranca en septiembre 2026 con saldo 0. Si hubo repartos anteriores, la oficina la ajusta."',
    );
    expect(lectura).not.toContain("configura el mes de arranque");
    // El SOCIO viendo SU renglón: «Tu cuenta…».
    const propia = renderToStaticMarkup(
      <SociosCuentaTable
        socios={[SOCIOS[1]]}
        totales={null}
        hastaMes="2026-10"
        puedeRegistrar={false}
        registro={{ ...REGISTRO, me: { id: ACC, nombre: "Aero Charter" } }}
      />,
    );
    expect(propia).toContain('title="Tu cuenta arranca en septiembre 2026 con saldo 0. Si hubo repartos anteriores, la oficina la ajusta."');
  });

  it("oficina: «Registrar entrega», «Ver cuenta» y «Configurar cuenta» por socio, todos con la manita", () => {
    expect((html.match(/data-accion="registrar-entrega-socio"/g) ?? []).length).toBe(3);
    expect((html.match(/data-accion="ver-cuenta-socio"/g) ?? []).length).toBe(3);
    expect((html.match(/data-accion="configurar-cuenta-socio"/g) ?? []).length).toBe(3);
    expect(html).toContain(`href="/admin/profit-sharing/socios/${MAURICIO}"`);
    expect(html).toContain('aria-label="Registrar entrega a Mauricio Roque"');
    for (const b of botones(html)) expect(b, b).toContain("cursor-pointer");
  });

  it("totales: por entregar (solo a favor de los socios) y lo adelantado aparte", () => {
    expect(html).toContain("<tfoot");
    expect(html).toContain("$586.70");
    expect(html).toContain("adelantado $2,181.74");
  });

  it("ANALISTA / SOCIO: solo «Ver cuenta» y, sin totales, sin pie", () => {
    const h = renderToStaticMarkup(
      <SociosCuentaTable socios={[SOCIOS[0]]} totales={null} hastaMes="2026-10" puedeRegistrar={false} registro={REGISTRO} />,
    );
    expect(h).not.toContain('data-accion="registrar-entrega-socio"');
    expect(h).not.toContain('data-accion="configurar-cuenta-socio"');
    expect(h).toContain('data-accion="ver-cuenta-socio"');
    expect(h).not.toContain("<tfoot");
  });
});

describe("estado de cuenta: movimientos con saldo corrido", () => {
  const ENTREGA: PagoSocio = {
    id: "9a9a0000-0000-4000-8000-000000000001",
    socio_id: MAURICIO,
    aeronave_id: null,
    periodo: null,
    mes: null,
    monto: 70000,
    moneda: "MXN",
    tc_usd_mxn: 18.5,
    monto_usd: 3783.78,
    utilidad_snapshot_usd: null,
    saldo_snapshot_usd: 1395.94,
    fecha_pago: "2026-10-01",
    metodo: "EFECTIVO",
    referencia: "Recibo 15",
    entregado_por: ALE.id,
    entregado_por_nombre: "Alejandro Canales",
    recibido_por: "Su esposa",
    factura_folio: "A-77",
    comprobante_path: `${MAURICIO}/9a9a.jpg`,
    comprobante_url: "https://x.supabase.co/storage/v1/object/sign/reparto-comprobantes/a/9a9a.jpg?token=t",
    notas: "Adelanto pedido por el socio",
    created_by: ALE.id,
    created_by_nombre: "Itzi",
    created_at: "2026-10-01T17:30:00Z",
    aeronave: null,
  };
  const MOVS: MovimientoCuenta[] = [
    { fecha: "2026-09-01", tipo: "SALDO_INICIAL", concepto: "Arranque de la cuenta (saldo inicial $0)", mes: "2026-09", aeronave: null, porcentaje: null, cargo_usd: 0, abono_usd: 0, saldo_usd: 0, en_curso: false, pago: null },
    { fecha: "2026-09-30", tipo: "UTILIDAD", concepto: "Utilidad sep 2026 · N4142R 69 %", mes: "2026-09", aeronave: { id: N4142R, matricula: "N4142R" }, porcentaje: 69, cargo_usd: 1395.94, abono_usd: 0, saldo_usd: 1395.94, en_curso: false, pago: null },
    { fecha: "2026-10-01", tipo: "ENTREGA", concepto: "Adelanto a cuenta · Efectivo · $70,000 MXN a T.C. 18.5", mes: null, aeronave: null, porcentaje: null, cargo_usd: 0, abono_usd: 3783.78, saldo_usd: -2387.84, en_curso: false, pago: ENTREGA },
    { fecha: "2026-10-05", tipo: "ENTREGA", concepto: "Entrega · Transferencia · corresponde a sep 2026 · N4142R", mes: "2026-09", aeronave: { id: N4142R, matricula: "N4142R" }, porcentaje: null, cargo_usd: 0, abono_usd: 10, saldo_usd: -2397.84, en_curso: false, pago: { ...ENTREGA, id: "9a9a0000-0000-4000-8000-000000000002", mes: "2026-09", aeronave_id: N4142R, aeronave: { id: N4142R, matricula: "N4142R" }, monto: 10, moneda: "USD", tc_usd_mxn: null, monto_usd: 10, metodo: "TRANSFERENCIA", comprobante_path: null, comprobante_url: null, notas: null } },
    { fecha: "2026-10-31", tipo: "UTILIDAD", concepto: "Utilidad oct 2026 · N4142R 69 %", mes: "2026-10", aeronave: { id: N4142R, matricula: "N4142R" }, porcentaje: 69, cargo_usd: -120.5, abono_usd: 0, saldo_usd: -2518.34, en_curso: true, pago: null },
  ];
  const CONTEXTO: ContextoEntrega = {
    socio: { id: MAURICIO, nombre: "Mauricio Roque" },
    porEntregarUsd: -2518.34,
    mesEnCursoUsd: -120.5,
    mesEnCurso: "2026-10",
    aviones: [],
    cuentaDesdeMes: "2026-09",
    mesSugerido: null,
  };
  const html = renderToStaticMarkup(
    <MovimientosCuenta movimientos={MOVS} contexto={CONTEXTO} registro={REGISTRO} puedeRegistrar />,
  );

  it("columnas «Fecha · Concepto · Generó (+) · Entregado (−) · Saldo» y la leyenda", () => {
    const ths = (html.match(/<th[^>]*>([^<]*)<\/th>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, ""));
    expect(ths).toEqual(["Fecha", "Concepto", "Generó (+)", "Entregado (−)", "Saldo"]);
    expect(html).toContain("Generó: la utilidad de sus aviones cada mes");
  });

  it("utilidad por mes y avión, el saldo corrido del API y el mes en curso marcado (pérdida en rojo)", () => {
    expect(html).toContain("Utilidad sep 2026 · N4142R 69 %");
    expect(html).toContain("$1,395.94");
    expect(html).toContain("-$2,387.84");
    expect((html.match(/data-en-curso/g) ?? []).length).toBe(1);
    expect(html).toContain(">en curso</span>");
    expect(html).toMatch(/text-destructive[^>]*>-\$120\.50</);
  });

  it("la entrega: monto con T.C., método, entregó, recibió, factura, referencia, «corresponde a», notas y comprobante", () => {
    expect(html).toContain("$70,000 MXN · T.C. 18.5 · ≈ $3,783.78 USD");
    expect(html).toContain("Efectivo");
    expect(html).toContain("Entregó: Alejandro Canales");
    expect(html).toContain("Recibió: Su esposa · Factura A-77 · Ref. Recibo 15");
    expect(html).toContain("Adelanto pedido por el socio");
    expect(html).toMatch(/<img[^>]*alt="Comprobante de la entrega al socio"/);
    expect(html).toMatch(/Registró Itzi · /);
  });

  it("concepto de la entrega en palabras del panel: «Entrega a cuenta (sin mes)» / «Entrega · corresponde a…», UNA vez y sin «Adelanto a cuenta»", () => {
    expect((html.match(/Entrega a cuenta \(sin mes\)/g) ?? []).length).toBe(1);
    expect((html.match(/Entrega · corresponde a Septiembre 2026 · N4142R/g) ?? []).length).toBe(1);
    expect(html).not.toContain("Adelanto a cuenta");
    // El monto/T.C. de la entrega va en el detalle, no repetido en el concepto.
    expect(html).not.toContain("$70,000 MXN a T.C. 18.5");
  });

  it("el saldo corrido negativo (adelantado) va en azul y el positivo en ámbar", () => {
    expect(html).toMatch(/text-sky-700[^"]*"[^>]*>-\$2,387\.84</);
    expect(html).toMatch(/text-amber-700[^"]*"[^>]*>\$1,395\.94</);
  });

  it("oficina: «Editar», «Eliminar» y reemplazar el comprobante, con la manita", () => {
    expect(html).toContain('data-accion="editar-entrega-socio"');
    expect(html).toContain('data-accion="eliminar-entrega-socio"');
    expect(html).toContain('data-accion="comprobante-entrega-socio"');
    expect(html).toContain(">Reemplazar</button>");
    expect(html).toMatch(/>Adjuntar comprobante<\/button>/);
    for (const b of botones(html)) expect(b, b).toContain("cursor-pointer");
  });

  it("SOCIO / ANALISTA: lee todo, sin editar, eliminar ni adjuntar", () => {
    const h = renderToStaticMarkup(
      <MovimientosCuenta movimientos={MOVS} contexto={CONTEXTO} registro={REGISTRO} puedeRegistrar={false} />,
    );
    expect(h).not.toContain('data-accion="editar-entrega-socio"');
    expect(h).not.toContain('data-accion="eliminar-entrega-socio"');
    expect(h).not.toContain('data-accion="comprobante-entrega-socio"');
    expect(h).toMatch(/<img[^>]*alt="Comprobante de la entrega al socio"/);
  });

  it("resumen por mes: utilidad por avión y lo entregado POR FECHA de entrega (así dice la columna)", () => {
    const h = renderToStaticMarkup(
      <ResumenMesesCuenta
        meses={[
          { mes: "2026-09", utilidad_usd: 1395.94, en_curso: false, por_avion: [{ aeronave: { id: N4142R, matricula: "N4142R" }, porcentaje: 69, monto_usd: 1395.94 }], entregado_usd: 0 },
          { mes: "2026-10", utilidad_usd: -120.5, en_curso: true, por_avion: [], entregado_usd: 3783.78 },
        ]}
      />,
    );
    const ths = (h.match(/<th[^>]*>([^<]*)<\/th>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, ""));
    expect(ths).toEqual(["Mes", "Aviones", "Utilidad", "Entregado (por fecha de entrega)"]);
    expect(h).toContain("Septiembre 2026");
    expect(h).toContain("N4142R 69 % · $1,395.94");
    expect(h).toContain("Octubre 2026");
    expect(h).toContain(">en curso</span>");
    expect(h).toContain("$3,783.78");
  });

  it("badge del estado: «Adelantado» en azul", () => {
    const h = renderToStaticMarkup(<EstadoCuentaBadge estado="ADELANTADO" saldoUsd={-2387.84} />);
    expect(h).toContain(">Adelantado<");
    expect(h).toContain("sky");
  });
});

describe("Reparto de utilidades: «Socios · por entregar»", () => {
  const AVIONES: { reparto: RepartoSocio[] }[] = [
    {
      reparto: [
        { socio_id: MAURICIO, socio_nombre: "Mauricio Roque", porcentaje: 69, monto_usd: 1395.94 },
        { socio_id: ACC, socio_nombre: "Aero Charter Cancun S.A. de C.V.", porcentaje: 29, monto_usd: 586.7 },
        { socio_id: SAAB, socio_nombre: "Alexander E. Saab", porcentaje: 2, monto_usd: 40.46 },
      ],
    },
  ];
  const ok: CargaCuentas<SociosCuentaRespuesta> = {
    estado: "ok",
    datos: { disponible: true, hasta_mes: "2026-10", socios: SOCIOS, totales: TOTALES },
  };

  it("con un mes completo: «Generó en Septiembre 2026» (lo de las tarjetas) y el saldo ACUMULADO", () => {
    const html = renderToStaticMarkup(
      <SociosPorEntregarSection carga={ok} aviones={AVIONES} desde="2026-09-01" hasta="2026-09-30" puedeRegistrar registro={REGISTRO} />,
    );
    const ths = (html.match(/<th[^>]*>([^<]*)<\/th>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, ""));
    expect(ths).toEqual(["Socio", "Generó en Septiembre 2026", "Saldo por entregar (acumulado)", "Estatus", "Acciones"]);
    expect(html).toContain("Socios · por entregar");
    expect(html).toContain("$1,395.94");
    expect(html).toContain("-$2,181.74");
    expect((html.match(/data-marca-adelantado[^>]*>adelantado</g) ?? []).length).toBe(1);
    expect((html.match(/data-accion="registrar-entrega-socio"/g) ?? []).length).toBe(3);
    expect((html.match(/data-accion="ver-cuenta-socio"/g) ?? []).length).toBe(3);
    expect(html).toContain('href="/admin/profit-sharing/socios"');
    for (const b of botones(html)) expect(b, b).toContain("cursor-pointer");
  });

  it("con CUALQUIER rango (ya no exige mes completo); SOCIO/ANALISTA sin «Registrar entrega»", () => {
    const html = renderToStaticMarkup(
      <SociosPorEntregarSection carga={ok} aviones={AVIONES} desde="2026-10-01" hasta="2026-10-15" puedeRegistrar={false} registro={REGISTRO} />,
    );
    expect(html).toMatch(/Generó del 01 oct\.? 2026 al 15 oct\.? 2026/);
    expect(html).not.toContain('data-accion="registrar-entrega-socio"');
    expect(html).toContain('data-accion="ver-cuenta-socio"');
  });

  it("servidor sin actualizar lo dice; un fallo NO es «sin socios»; sin permiso no se pinta", () => {
    const nd = renderToStaticMarkup(
      <SociosPorEntregarSection carga={{ estado: "no-disponible" }} aviones={AVIONES} desde="2026-09-01" hasta="2026-09-30" puedeRegistrar registro={REGISTRO} />,
    );
    expect(nd).toContain("Disponible cuando se actualice el servidor.");
    const err = renderToStaticMarkup(
      <SociosPorEntregarSection carga={{ estado: "error" }} aviones={AVIONES} desde="2026-09-01" hasta="2026-09-30" puedeRegistrar registro={REGISTRO} />,
    );
    expect(err).toContain("Socios · por entregar: no se pudieron cargar");
    expect(err).toContain("Reintentar");
    expect(err).not.toContain("Sin socios");
    for (const carga of [null, { estado: "sin-permiso" } as const]) {
      expect(
        renderToStaticMarkup(
          <SociosPorEntregarSection carga={carga} aviones={AVIONES} desde="2026-09-01" hasta="2026-09-30" puedeRegistrar registro={REGISTRO} />,
        ),
      ).toBe("");
    }
  });

  it("la tabla por avión vuelve a «Socio · % · Utilidad del periodo» (sin Pagado/Pendiente/Estatus)", () => {
    const html = renderToStaticMarkup(
      <SociosSection socios={AVIONES[0].reparto} porcentajeTotal={100} aeronaveId={N4142R} />,
    );
    const ths = (html.match(/<th[^>]*>([^<]*)<\/th>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, ""));
    expect(ths).toEqual(["Socio", "%", "Utilidad del periodo"]);
    expect(html).toContain("$1,395.94");
    expect(html).not.toMatch(/Pagado|Pendiente|Estatus|Registrar/);
  });

  it("tabla por avión: el NOMBRE del socio es un atajo a su cuenta («Ver cuenta ›») para quien lee cuentas; un SOCIO solo ve el suyo; sin permiso, texto plano", () => {
    const hrefMauricio = `/admin/profit-sharing/socios/${MAURICIO}`;
    const admin = renderToStaticMarkup(
      <SociosSection socios={AVIONES[0].reparto} porcentajeTotal={100} aeronaveId={N4142R} rol="ADMIN" usuarioId={ALE.id} />,
    );
    expect(admin).toContain(`href="${hrefMauricio}"`);
    expect(admin).toContain(`aria-label="Ver cuenta de Mauricio Roque"`);
    expect(admin).toContain("Ver la cuenta del socio y registrar una entrega");
    expect(admin).toContain("Ver cuenta ›");
    // cursor-pointer en el enlace (regla del cliente: lo clicable se nota).
    expect(admin).toMatch(/<a[^>]*cursor-pointer[^>]*href="[^"]*socios\/[^"]*"/);
    // Cada socio de la tabla lleva su propio atajo.
    for (const s of AVIONES[0].reparto) {
      expect(admin).toContain(`href="/admin/profit-sharing/socios/${s.socio_id}"`);
    }

    const socio = renderToStaticMarkup(
      <SociosSection socios={AVIONES[0].reparto} porcentajeTotal={100} aeronaveId={N4142R} rol="SOCIO" usuarioId={MAURICIO} />,
    );
    expect(socio).toContain(`href="${hrefMauricio}"`);
    expect(socio).not.toContain(`href="/admin/profit-sharing/socios/${ACC}"`);
    expect(socio).not.toContain(`href="/admin/profit-sharing/socios/${SAAB}"`);

    const coordinador = renderToStaticMarkup(
      <SociosSection socios={AVIONES[0].reparto} porcentajeTotal={100} aeronaveId={N4142R} rol="COORDINADOR" usuarioId={ALE.id} />,
    );
    expect(coordinador).not.toContain("/admin/profit-sharing/socios/");
    expect(coordinador).toContain("Mauricio Roque");

    // Sin rol (como lo montaba la tarjeta antes de este cambio): sin atajo.
    const sinRol = renderToStaticMarkup(
      <SociosSection socios={AVIONES[0].reparto} porcentajeTotal={100} aeronaveId={N4142R} />,
    );
    expect(sinRol).not.toContain("/admin/profit-sharing/socios/");

    // CABLEADO: la tarjeta pasa rol y usuario, y la página se los da.
    const card = readFileSync(path.join(process.cwd(), "src/components/admin/profit-sharing/avion-reparto-card.tsx"), "utf8");
    expect(card).toMatch(/<SociosSection[\s\S]*rol=\{rol\}[\s\S]*usuarioId=\{usuarioId\}/);
    const pagina = readFileSync(path.join(process.cwd(), "src/app/admin/profit-sharing/page.tsx"), "utf8");
    expect(pagina).toMatch(/<AvionRepartoCard[\s\S]*rol=\{me\.rol\}[\s\S]*usuarioId=\{me\.id\}/);
  });
});

describe("piezas de las páginas (renderizadas de verdad)", () => {
  const kpis = (h: string) =>
    (h.match(/<p class="text-xs uppercase[^"]*">([^<]*)<\/p>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, ""));

  it("KPIs de un socio ADELANTADO: «Adelantado (a favor de VuelaTour)» con el monto SIN signo y el mes en curso dicho", () => {
    const h = renderToStaticMarkup(
      <KpisCuenta
        totales={{ generado_usd: 1602.04, mes_en_curso_usd: 206.1, entregado_usd: 3989.88, por_entregar_usd: -2387.84, estado: "ADELANTADO" }}
        mesEnCurso="2026-10"
      />,
    );
    expect(kpis(h)).toEqual(["Generado", "Entregado", "Adelantado (a favor de VuelaTour)", "Estatus"]);
    expect(h).toMatch(/data-kpi-saldo="adelantado"[^>]*>\$2,387\.84</);
    expect(h).not.toContain("-$2,387.84");
    expect(h).not.toContain("Por entregar hoy");
    expect(h).toContain(">Adelantado<");
    expect((h.match(/incluye \$206\.10 de Octubre 2026/g) ?? []).length).toBe(2);
  });

  it("KPIs POR_ENTREGAR: «Por entregar hoy» con su monto en ámbar", () => {
    const h = renderToStaticMarkup(
      <KpisCuenta
        totales={{ generado_usd: 1395.94, mes_en_curso_usd: 0, entregado_usd: 0, por_entregar_usd: 1395.94, estado: "POR_ENTREGAR" }}
        mesEnCurso="2026-10"
      />,
    );
    expect(kpis(h)).toEqual(["Generado", "Entregado", "Por entregar hoy", "Estatus"]);
    expect(h).toMatch(/text-amber-700[^"]*"[^>]*data-kpi-saldo="por-entregar"[^>]*>\$1,395\.94</);
    expect(h).not.toContain("incluye");
  });

  it("KPIs de la lista «Pagos a socios»", () => {
    const h = renderToStaticMarkup(<KpisCuentasSocios totales={TOTALES} />);
    expect(kpis(h)).toEqual(["Por entregar (todos)", "Adelantado (todos)", "Socios con saldo por entregar", "Socios adelantados"]);
    expect(h).toContain("$586.70");
    expect(h).toContain("$2,181.74");
  });

  it("banner de cuenta sin configurar POR ROL: oficina recibe la instrucción; SOCIO/ANALISTA un texto informativo", () => {
    const oficina = renderToStaticMarkup(<BannerCuentaNoConfigurada puedeConfigurar />);
    expect(oficina).toContain('data-banner-sin-configurar="oficina"');
    expect(oficina).toContain("configura el mes de arranque y el saldo inicial");
    const analista = renderToStaticMarkup(<BannerCuentaNoConfigurada puedeConfigurar={false} />);
    expect(analista).toContain('data-banner-sin-configurar="lectura"');
    expect(analista).toContain("La cuenta de este socio arranca en septiembre 2026 con saldo 0. Si hubo repartos anteriores, la oficina la ajusta.");
    expect(analista).not.toContain("configura el mes");
    expect(analista).not.toContain("amber");
    const socio = renderToStaticMarkup(<BannerCuentaNoConfigurada puedeConfigurar={false} esPropia />);
    expect(socio).toContain("Tu cuenta arranca en septiembre 2026 con saldo 0.");
  });

  it("SOCIO viendo otra cuenta: «Solo puedes ver tu propia cuenta»; otro rol: «Sin permiso»", () => {
    const socio = renderToStaticMarkup(<SinPermisoCuenta esSocio />);
    expect(socio).toContain("Solo puedes ver tu propia cuenta");
    expect(socio).toContain("Esta cuenta es de otro socio.");
    expect(renderToStaticMarkup(<SinPermisoCuenta esSocio={false} />)).toContain("Sin permiso");
  });

  it("«no-disponible»: «Disponible cuando se actualice el servidor.» (nunca «sin socios»)", () => {
    const h = renderToStaticMarkup(<TarjetaCuentasNoDisponibles titulo="Estado de cuenta del socio" />);
    expect(h).toContain("data-cuentas-no-disponibles");
    expect(h).toContain("Estado de cuenta del socio");
    expect(h).toContain("Disponible cuando se actualice el servidor.");
  });

  it("entregas anteriores al arranque: aviso + enlace que las abre como movimientos", () => {
    const h = renderToStaticMarkup(
      <AvisoEntregasPrevias texto="La entrega con fecha anterior al arranque…" href={`/admin/profit-sharing/socios/${MAURICIO}?desde=2025-09&hasta=2026-10`} />,
    );
    expect(h).toContain("data-aviso-entregas-previas");
    expect(h).toContain(`href="/admin/profit-sharing/socios/${MAURICIO}?desde=2025-09&amp;hasta=2026-10"`);
    expect(h).toMatch(/cursor-pointer[^>]*data-accion="ver-entregas-previas"[^>]*>Ver entregas anteriores al arranque</);
  });

  it("filtro de meses: cada etiqueta nombra a SU selector (for ⇄ id) y las opciones alcanzan la entrega previa", () => {
    const h = renderToStaticMarkup(
      <FiltroMesesCuenta desde="2025-09" hasta="2026-10" cuentaDesdeMes="2026-09" mesActual="2026-10" mesMinimo="2025-09" filtrado />,
    );
    const fors = [...h.matchAll(/<label[^>]*for="([^"]+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]);
    expect(fors.map((f) => f[1])).toEqual(["Desde", "Hasta"]);
    for (const [id] of fors) expect(h).toContain(`id="${id}"`);
    expect(h).toContain(">Septiembre 2025</span>");
    expect(h).toContain(">Toda la cuenta</button>");
  });
});

describe("menú «Pagos a socios» (Tesorería)", () => {
  it("ADMIN, FACTURACION, ANALISTA y SOCIO lo ven; COORDINADOR no", () => {
    const ve = (rol: Parameters<typeof filterNavGroupsForRole>[0]) =>
      filterNavGroupsForRole(rol)
        .find((g) => g.label === "Tesorería")
        ?.items.some((i) => i.href === "/admin/profit-sharing/socios") ?? false;
    expect(ve("ADMIN")).toBe(true);
    expect(ve("FACTURACION")).toBe(true);
    expect(ve("ANALISTA")).toBe(true);
    expect(ve("SOCIO")).toBe(true);
    expect(ve("COORDINADOR")).toBe(false);
  });

  it("en una cuenta de socio se marca SOLO «Pagos a socios» (gana el href más largo) y el título lo dice", () => {
    const ruta = `/admin/profit-sharing/socios/${MAURICIO}`;
    expect(itemNavActivo(ruta, "/admin/profit-sharing/socios")).toBe(true);
    expect(itemNavActivo(ruta, "/admin/profit-sharing")).toBe(false);
    expect(itemNavActivo("/admin/profit-sharing", "/admin/profit-sharing")).toBe(true);
    expect(itemNavActivo("/admin/profit-sharing", "/admin/profit-sharing/socios")).toBe(false);
    expect(itemNavActivo("/admin/flights/123", "/admin/flights")).toBe(true);
    expect(itemNavActivo("/admin/flights", "/admin")).toBe(false);
    expect(itemNavActivo("/admin", "/admin")).toBe(true);
    expect(getPageTitleFromPathname(ruta)).toBe("Pagos a socios");
  });
});

describe("cableado en el código", () => {
  const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
  const reparto = leer("src/app/admin/profit-sharing/page.tsx");
  const lista = leer("src/app/admin/profit-sharing/socios/page.tsx");
  const cuenta = leer("src/app/admin/profit-sharing/socios/[id]/page.tsx");
  const dialogo = leer("src/components/admin/profit-sharing/entrega-socio-dialog.tsx");
  const filtro = leer("src/components/admin/profit-sharing/filtro-meses-cuenta.tsx");
  const seccion = leer("src/components/admin/profit-sharing/socios-por-entregar-section.tsx");
  const movimientos = leer("src/components/admin/profit-sharing/movimientos-cuenta.tsx");
  const baja = leer("src/components/admin/profit-sharing/eliminar-entrega-dialog.tsx");
  const acciones = leer("src/app/admin/profit-sharing/actions.ts");
  const precierre = leer("src/components/admin/reportes/pre-cierre-card.tsx");
  const sidebar = leer("src/components/admin/sidebar-nav.tsx");

  it("reparto: «Socios · por entregar» con cualquier periodo, tarjetas en lg:grid-cols-2, sin la regla de mes completo", () => {
    expect(reparto).toContain("<SociosPorEntregarSection");
    expect(reparto).toContain("getSociosCuenta()");
    expect(reparto).toContain('className="grid gap-4 lg:grid-cols-2"');
    expect(reparto).not.toMatch(/mesDePeriodo|PagosSociosSection|pagos=\{/);
    expect(reparto).toContain("atajoMesPasado");
  });

  it("lista: un fallo pinta TarjetaErrorCarga (jamás «sin socios»); sin migración, «Disponible cuando…»", () => {
    expect(lista).toContain('if (carga.estado !== "ok")');
    expect(lista).toContain("<TarjetaErrorCarga");
    expect(lista).toContain("<TarjetaCuentasNoDisponibles titulo={TITULO_PAGOS_SOCIOS} />");
    expect(lista).toContain("<SociosCuentaTable");
  });

  it("estado de cuenta: id que no es uuid ⇒ notFound sin llamar; socio inexistente ⇒ notFound; filtro de meses", () => {
    expect(cuenta).toMatch(/if \(!esUuid\(id\)\) notFound\(\);/);
    expect(cuenta).toContain('if (carga.estado === "no-existe") notFound();');
    // El `?desde=`/`?hasta=` de la URL se recorta con el mes de HOY antes de
    // pedirlo (un mes futuro daba 400 RANGO_INVALIDO para siempre).
    expect(cuenta).toContain("filtroMesesCuenta(sp.desde, sp.hasta, mesHoy)");
    expect(cuenta).toContain("<FiltroMesesCuenta");
    expect(cuenta).toContain("mesMinimo={entregasPrevias?.mes ?? null}");
    expect(cuenta).toContain("<MovimientosCuenta");
    expect(cuenta).toContain("contextoEntregaDeEstadoCuenta(datos, { mesEnCurso: hoyMes })");
    expect(cuenta).toContain("<KpisCuenta totales={datos.totales} mesEnCurso={hoyMes} />");
    expect(cuenta).toContain("{carga.filtroIgnorado && (");
  });

  it("estado de cuenta: el banner de cuenta sin configurar depende del ROL (como en la lista) y sale de la pieza única", () => {
    expect(cuenta).toMatch(/<BannerCuentaNoConfigurada\s+puedeConfigurar=\{puedeRegistrar\}\s+esPropia=\{me\.id === datos\.socio\.id\}/);
    expect(cuenta).not.toContain("TEXTO_CUENTA_NO_CONFIGURADA");
    expect(cuenta).toContain("<SinPermisoCuenta esSocio={me.rol === \"SOCIO\"} />");
    expect(cuenta).toContain('<TarjetaCuentasNoDisponibles titulo="Estado de cuenta del socio" />');
    expect(lista).toContain("<KpisCuentasSocios totales={totales} />");
    expect(lista).toContain("const sinConfigurar = puedeRegistrar ?");
  });

  it("estado de cuenta: entregas anteriores al arranque ⇒ se pregunta cuáles y se ofrece el enlace (nunca quedan inalcanzables)", () => {
    expect(cuenta).toContain("if (escondeEntregasAntesDelArranque(datos, cuentaDesdeMes)) {");
    expect(cuenta).toContain("await getEntregasAntesDelArranque(datos.socio.id, cuentaDesdeMes)");
    expect(cuenta).toContain("<AvisoEntregasPrevias texto={entregasPrevias.texto} href={entregasPrevias.href} />");
    expect(filtro).toContain('ir(destinoFiltroMeses("desde", v, desde, hasta))');
    expect(filtro).toContain('ir(destinoFiltroMeses("hasta", v, desde, hasta))');
    expect(filtro).toContain("opcionesFiltroMeses({ cuentaDesdeMes, desde, mesActual, mesMinimo })");
  });

  it("el DELETE sale UNA vez y solo desde «Eliminar entrega» del diálogo de motivo", () => {
    expect(movimientos).not.toContain("eliminarPagoSocioAction");
    expect((baja.match(/eliminarPagoSocioAction\(/g) ?? []).length).toBe(1);
    expect(baja).toContain('data-accion="confirmar-eliminar-entrega-socio"');
  });

  it("adelanto: reintenta con aceptar_exceso y la MISMA llave (un id por apertura)", () => {
    expect(dialogo).toContain("const [clientRequestId] = useState(nuevoIdSolicitud);");
    expect(dialogo).toContain("client_request_id: clientRequestId,");
    expect(dialogo).toContain("aceptar_exceso: aceptarExceso,");
    expect(dialogo).toContain("onConfirmar={() => void guardar(true)}");
    expect(dialogo).toContain("pasoTrasGuardarEntrega(res, dialogo.tipo)");
  });

  it("no se cierra mientras guarda o sube; la LLAMADA caída no deja «Guardando…» sin salida", () => {
    expect(dialogo).toContain("onOpenChange={(o) => !o && !ocupado && onCerrar()}");
    expect(dialogo).toContain("showCloseButton={!ocupado}");
    expect(dialogo).toContain("setErrorGeneral(TEXTO_FALLO_RED_PAGO);");
  });

  it("el comprobante va del navegador DIRECTO al API (tope de Vercel), nunca por server action", () => {
    expect(dialogo).toContain("adjuntarComprobantePagoSocio(");
    expect(acciones).not.toContain("/comprobante");
    expect(acciones).not.toMatch(/FormData|base64/);
  });

  it("pre-cierre: los items nuevos llevan a «Pagos a socios» y listan socios con su saldo", () => {
    expect(precierre).toContain("[CLAVE_PRECIERRE_SOCIOS_POR_ENTREGAR]: hrefPrecierreSocios");
    expect(precierre).toContain("[CLAVE_PRECIERRE_SOCIOS_ADELANTADOS]: hrefPrecierreSocios");
    expect(precierre).toContain("lineasPreCierreSocios(item.socios, item.clave, undefined, item.count, mesSocios)");
    // El mes del cierre (del API o del periodo) y la nota de que «Pagos a
    // socios» enseña el saldo de HOY: los dos números distintos se explican.
    expect(precierre).toContain("item.mes ?? mesDePeriodo(desde, hasta)");
    expect(precierre).toContain("notaPreCierreSocios(item.clave, mesSocios)");
    expect(precierre).not.toMatch(/pagos_socios_pendientes|CLAVE_PRECIERRE_PAGOS_SOCIOS/);
  });

  it("reparto: «Registrar entrega» prellena el mes COMPLETO que se ve y sabe cuál es el mes en curso", () => {
    expect(seccion).toContain("const mesSugerido = mesDePeriodo(desde, hasta);");
    expect(seccion).toContain("contextoEntrega(r, { mesEnCurso, mesSugerido })");
  });

  it("sidebar: el activo lo decide `itemNavActivo` (href más largo)", () => {
    expect(sidebar).toContain("itemNavActivo(pathname, item.href)");
  });
});
