/**
 * ENTREGA QUE NACIÓ DE UN VUELO PAGADO CON UTILIDADES (23-nov-2026, API
 * 0.0.148) en «Pagos a socios».
 *
 * Pedido del dueño: el socio paga un vuelo propio «descontándolo de sus
 * utilidades». El API liga al cobro del vuelo una ENTREGA (`pago.vuelo`,
 * ADITIVO; su `metodo` llega como "OTRO"). Qué se congela:
 *  1. se lee «Vuelo #482 · pagado con utilidades» (nunca «Otro») con liga a
 *     la card «Cobro» del vuelo — en el estado de cuenta y en las entregas
 *     del avión —;
 *  2. SIN «Editar» ni «Eliminar» (el API responde 409 `ENTREGA_DE_VUELO`): en
 *     su lugar, «Se corrige o se quita desde el vuelo»;
 *  3. una entrega de siempre (o un API previo, sin la llave) queda igual;
 *  4. el helper ÚNICO `etiquetaEntrega`, la normalización tolerante y el
 *     texto del 409.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MovimientoCuenta, PagoSocio } from "@/types/reparto-pagos";
import type { ContextoEntrega, ContextoRegistro } from "@/lib/admin/reparto-pagos";

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

const { MovimientosCuenta } = await import("../movimientos-cuenta");
const { EntregasAvionTable } = await import("../entregas-avion-table");
const {
  TEXTO_ENTREGA_SE_CORRIGE_EN_EL_VUELO,
  esEntregaDeVuelo,
  etiquetaEntrega,
  hrefVueloDeEntrega,
  mensajeErrorCuentaSocio,
  normalizarPago,
  normalizarResumen,
  piezasPago,
  textoUltimoPago,
  vueloDeEntrega,
} = await import("@/lib/admin/reparto-pagos");

const MAURICIO = "50c10000-0000-4000-8000-000000000001";
const N4142R = "a1a1a1a1-0000-4000-8000-000000000001";
const VUELO = "f1f1f1f1-0000-4000-8000-000000000482";
const COBRO = "c0c0c0c0-0000-4000-8000-000000000001";
const ALE = { id: "0f1c0000-0000-4000-8000-000000000009", nombre: "Alejandro Canales" };
const REGISTRO: ContextoRegistro = { usuarios: [ALE], me: ALE, hoy: "2026-11-23", tcOficial: 18.45 };

const TRANSFERENCIA: PagoSocio = {
  id: "9a9a0000-0000-4000-8000-000000000001",
  socio_id: MAURICIO,
  aeronave_id: N4142R,
  periodo: "2026-10-01",
  mes: "2026-10",
  monto: 20000,
  moneda: "MXN",
  tc_usd_mxn: 18.5,
  monto_usd: 1081.08,
  monto_mxn: 20000,
  utilidad_snapshot_usd: null,
  saldo_snapshot_usd: null,
  fecha_pago: "2026-11-05",
  metodo: "TRANSFERENCIA",
  referencia: "SPEI 123456",
  entregado_por: ALE.id,
  entregado_por_nombre: "Alejandro Canales",
  recibido_por: null,
  factura_folio: null,
  comprobante_path: null,
  comprobante_url: null,
  notas: null,
  created_by: ALE.id,
  created_by_nombre: "Itzi",
  created_at: "2026-11-05T17:30:00Z",
  aeronave: { id: N4142R, matricula: "N4142R" },
};
/** La entrega que el API crea junto con el cobro del vuelo #482. */
const DE_VUELO: PagoSocio = {
  ...TRANSFERENCIA,
  id: "9a9a0000-0000-4000-8000-000000000002",
  periodo: "2026-11-01",
  mes: "2026-11",
  monto: 45000,
  monto_usd: 2432.43,
  monto_mxn: 45000,
  fecha_pago: "2026-11-20",
  metodo: "OTRO",
  referencia: "Vuelo #482",
  vuelo: { id: VUELO, folio: 482, cobro_id: COBRO },
};

const mov = (pago: PagoSocio, saldo: number): MovimientoCuenta => ({
  fecha: pago.fecha_pago,
  tipo: "ENTREGA",
  concepto: "Entrega",
  mes: pago.mes ?? null,
  aeronave: pago.aeronave,
  porcentaje: null,
  cargo_mxn: 0,
  abono_mxn: pago.monto_mxn,
  saldo_mxn: saldo,
  en_curso: false,
  pago,
});
const MOVS = [mov(TRANSFERENCIA, 30000), mov(DE_VUELO, -15000)];
const CONTEXTO: ContextoEntrega = {
  socio: { id: MAURICIO, nombre: "Mauricio Roque" },
  porEntregarMxn: -15000,
  mesEnCursoMxn: 0,
  mesEnCurso: "2026-11",
  aviones: [{ id: N4142R, matricula: "N4142R", porcentaje: 69, vigente: true }],
  cuentaDesdeMes: "2026-09",
  mesSugerido: null,
};

/** El renglón de detalle (hijo) de UNA entrega del estado de cuenta. */
const detalleDe = (html: string, id: string) =>
  html.match(new RegExp(`<tr[^>]*data-entrega-id="${id}"[\\s\\S]*?</tr>`))?.[0] ?? "";

describe("helper único `etiquetaEntrega`", () => {
  it("una entrega con `vuelo` se llama «Vuelo #folio · pagado con utilidades», no «Otro»", () => {
    expect(etiquetaEntrega(DE_VUELO)).toBe("Vuelo #482 · pagado con utilidades");
    expect(piezasPago(DE_VUELO).metodo).toBe("Vuelo #482 · pagado con utilidades");
    expect(esEntregaDeVuelo(DE_VUELO)).toBe(true);
    expect(vueloDeEntrega(DE_VUELO)).toEqual({ id: VUELO, folio: 482, cobro_id: COBRO });
    expect(hrefVueloDeEntrega(DE_VUELO)).toBe(`/admin/flights/${VUELO}#cobros`);
  });

  it("las entregas de siempre (y un API previo, sin la llave) dicen su método", () => {
    expect(etiquetaEntrega(TRANSFERENCIA)).toBe("Transferencia");
    expect(etiquetaEntrega({ ...TRANSFERENCIA, vuelo: null })).toBe("Transferencia");
    expect(etiquetaEntrega({ metodo: "OTRO" })).toBe("Otro");
    expect(etiquetaEntrega({ metodo: "EFECTIVO", vuelo: null })).toBe("Efectivo");
    expect(esEntregaDeVuelo(TRANSFERENCIA)).toBe(false);
    expect(hrefVueloDeEntrega(TRANSFERENCIA)).toBeNull();
    expect(etiquetaEntrega(null)).toBe("—");
  });

  it("sin folio legible no inventa un número; con un id que no es uuid no hay liga", () => {
    expect(etiquetaEntrega({ metodo: "OTRO", vuelo: { id: VUELO, folio: 0, cobro_id: "" } })).toBe(
      "Vuelo · pagado con utilidades",
    );
    expect(hrefVueloDeEntrega({ vuelo: { id: "v-482", folio: 482, cobro_id: "" } })).toBeNull();
  });

  it("«Última entrega» del resumen usa el mismo helper cuando el API manda el vuelo", () => {
    const u = { id: DE_VUELO.id, fecha_pago: "2026-11-20", monto: 45000, moneda: "MXN", monto_mxn: 45000, monto_usd: 2432.43, metodo: "OTRO" };
    expect(textoUltimoPago({ ...u, vuelo: DE_VUELO.vuelo })).toBe(
      "20/11/2026 · $45,000 MXN · Vuelo #482 · pagado con utilidades",
    );
    // Sin la llave en el resumen: el método, como hoy.
    expect(textoUltimoPago(u)).toBe("20/11/2026 · $45,000 MXN · Otro");
  });
});

describe("normalización tolerante de `pago.vuelo`", () => {
  const crudo = { ...DE_VUELO, monto: "45000.00", monto_mxn: "45000.00" };

  it("llega legible ⇒ `{id, folio, cobro_id}` con el folio como número", () => {
    expect(normalizarPago({ ...crudo, vuelo: { id: VUELO, folio: "482", cobro_id: COBRO, otra: 1 } })?.vuelo).toEqual({
      id: VUELO,
      folio: 482,
      cobro_id: COBRO,
    });
  });

  it("`null` o basura ⇒ null; sin la llave (API previo) la llave NO aparece", () => {
    expect(normalizarPago({ ...crudo, vuelo: null })?.vuelo).toBeNull();
    expect(normalizarPago({ ...crudo, vuelo: "482" })?.vuelo).toBeNull();
    expect(normalizarPago({ ...crudo, vuelo: { folio: 482 } })?.vuelo).toBeNull();
    const { vuelo: _fuera, ...previo } = crudo;
    void _fuera;
    expect("vuelo" in (normalizarPago(previo) as object)).toBe(false);
  });

  it("`socio.es_empresa` viaja solo si el API lo mandó como booleano", () => {
    const fila = {
      socio: { id: MAURICIO, nombre: "Mauricio Roque", rol: "SOCIO", estado: "ACTIVO" },
      cuenta: {},
      aviones: [],
    };
    expect("es_empresa" in normalizarResumen(fila)!.socio).toBe(false);
    expect(normalizarResumen({ ...fila, socio: { ...fila.socio, es_empresa: true } })!.socio.es_empresa).toBe(true);
    expect(normalizarResumen({ ...fila, socio: { ...fila.socio, es_empresa: false } })!.socio.es_empresa).toBe(false);
    expect("es_empresa" in normalizarResumen({ ...fila, socio: { ...fila.socio, es_empresa: "si" } })!.socio).toBe(
      false,
    );
  });
});

describe("409 ENTREGA_DE_VUELO", () => {
  it("el texto del API gana; sin texto, el respaldo dice dónde se corrige", () => {
    expect(
      mensajeErrorCuentaSocio(
        "ENTREGA_DE_VUELO",
        "Esta entrega viene del vuelo #482: quítala desde el vuelo.",
        409,
      ),
    ).toBe("Esta entrega viene del vuelo #482: quítala desde el vuelo.");
    expect(mensajeErrorCuentaSocio("ENTREGA_DE_VUELO", "", 409)).toBe(
      "Esta entrega viene de un vuelo que el socio pagó con sus utilidades: se corrige o se quita desde el vuelo (card «Cobro»), no desde Pagos a socios.",
    );
    expect(mensajeErrorCuentaSocio("ENTREGA_DE_VUELO", "Conflict", 409)).toContain("desde el vuelo");
  });
});

describe("estado de cuenta del socio (MovimientosCuenta)", () => {
  const html = renderToStaticMarkup(
    <MovimientosCuenta movimientos={MOVS} contexto={CONTEXTO} registro={REGISTRO} puedeRegistrar />,
  );
  const deVuelo = detalleDe(html, DE_VUELO.id);
  const normal = detalleDe(html, TRANSFERENCIA.id);

  it("la entrega del vuelo se pinta «Vuelo #482 · pagado con utilidades» con liga al vuelo", () => {
    expect(deVuelo).toContain("Vuelo #482 · pagado con utilidades");
    expect(deVuelo).toMatch(
      new RegExp(`<a[^>]*href="/admin/flights/${VUELO}#cobros"[^>]*>Vuelo #482 · pagado con utilidades</a>`),
    );
    expect(deVuelo).toContain("cursor-pointer");
    // Nunca «Otro» como método.
    expect(deVuelo).not.toMatch(/>Otro</);
  });

  it("sin «Editar» ni «Eliminar»: en su lugar, «Se corrige o se quita desde el vuelo»", () => {
    expect(deVuelo).not.toContain('data-accion="editar-entrega-socio"');
    expect(deVuelo).not.toContain('data-accion="eliminar-entrega-socio"');
    expect(deVuelo).toContain(TEXTO_ENTREGA_SE_CORRIGE_EN_EL_VUELO);
    expect(TEXTO_ENTREGA_SE_CORRIGE_EN_EL_VUELO).toBe("Se corrige o se quita desde el vuelo");
  });

  it("la entrega de siempre conserva su método, «Editar» y «Eliminar»", () => {
    expect(normal).toContain("<span>Transferencia</span>");
    expect(normal).toContain('data-accion="editar-entrega-socio"');
    expect(normal).toContain('data-accion="eliminar-entrega-socio"');
    expect(normal).not.toContain(TEXTO_ENTREGA_SE_CORRIGE_EN_EL_VUELO);
    expect(normal).not.toContain("/admin/flights/");
    // En toda la tabla: UN solo par de botones (el de la entrega normal).
    expect(html.match(/data-accion="editar-entrega-socio"/g)).toHaveLength(1);
    expect(html.match(/data-accion="eliminar-entrega-socio"/g)).toHaveLength(1);
  });

  it("quien solo lee (SOCIO / ANALISTA) ve la frase y la liga, sin el aviso de corrección", () => {
    const h = renderToStaticMarkup(
      <MovimientosCuenta movimientos={MOVS} contexto={CONTEXTO} registro={REGISTRO} puedeRegistrar={false} />,
    );
    expect(h).toContain("Vuelo #482 · pagado con utilidades");
    expect(h).not.toContain(TEXTO_ENTREGA_SE_CORRIGE_EN_EL_VUELO);
    expect(h).not.toContain('data-accion="editar-entrega-socio"');
  });
});

describe("entregas del avión (EntregasAvionTable)", () => {
  const html = renderToStaticMarkup(
    <EntregasAvionTable
      entregas={[TRANSFERENCIA, DE_VUELO]}
      socios={[{ socio_id: MAURICIO, socio_nombre: "Mauricio Roque" }]}
      puedeAdjuntar
      vacio="Sin entregas"
    />,
  );
  const fila = (id: string) => html.match(new RegExp(`<tr[^>]*data-entrega-avion="${id}"[\\s\\S]*?</tr>`))?.[0] ?? "";

  it("la columna «Método» dice «Vuelo #482 · pagado con utilidades» con liga; la normal, su método", () => {
    expect(fila(DE_VUELO.id)).toMatch(
      new RegExp(`<a[^>]*href="/admin/flights/${VUELO}#cobros"[^>]*>Vuelo #482 · pagado con utilidades</a>`),
    );
    expect(fila(DE_VUELO.id)).not.toMatch(/>Otro</);
    expect(fila(TRANSFERENCIA.id)).toContain("<span>Transferencia</span>");
    expect(fila(TRANSFERENCIA.id)).not.toContain("/admin/flights/");
  });
});

describe("cableado en el código", () => {
  const leer = (...p: string[]) => readFileSync(path.resolve(__dirname, "..", ...p), "utf8");

  it("ninguna pantalla de entregas redacta el método por su cuenta: todas pasan por el helper", () => {
    for (const archivo of ["movimientos-cuenta.tsx", "entregas-avion-table.tsx"]) {
      const src = leer(archivo);
      expect(src, archivo).toContain("<EtiquetaEntrega pago={");
      expect(src, archivo).not.toContain("etiquetaMetodoPagoSocio(");
    }
    const pieza = leer("etiqueta-entrega.tsx");
    expect(pieza).toContain("etiquetaEntrega(pago)");
    expect(pieza).toContain("hrefVueloDeEntrega(pago)");
  });

  it("estado de cuenta: «Editar»/«Eliminar» solo si la entrega NO es de un vuelo", () => {
    const src = leer("movimientos-cuenta.tsx");
    expect(src).toContain("{puedeRegistrar && !esEntregaDeVuelo(pago) && (");
    expect(src).toContain("{puedeRegistrar && esEntregaDeVuelo(pago) && (");
    expect(src).toContain("{TEXTO_ENTREGA_SE_CORRIGE_EN_EL_VUELO}");
  });
});
