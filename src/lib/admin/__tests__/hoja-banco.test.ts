/**
 * Lo común de las dos hojas «Conciliación con el banco» (15-oct-2026, API
 * 0.0.78): las constantes y funciones se MUDARON de `gasto-banco.ts` a
 * `hoja-banco.ts` sin cambiar su valor, y `gasto-banco.ts` las RE-EXPORTA con
 * el mismo nombre (identidad): Gastos se ve y se prueba igual.
 */
import { describe, expect, it } from "vitest";
import { fmtDate, fmtDateTime } from "@/lib/datetime";
import * as G from "@/lib/admin/gasto-banco";
import * as H from "@/lib/admin/hoja-banco";

describe("hoja-banco: los valores de siempre", () => {
  it("textos fijos y ventanas", () => {
    expect(H.TITULO_HOJA_BANCO).toBe("Conciliación con el banco");
    expect(H.TEXTO_ESTADO_CAMBIO).toBe("El estado cambió desde que abriste la página: recarga para ver la lista al día.");
    expect(H.BOTON_RECARGAR).toBe("Recargar");
    expect(H.BOTON_REINTENTAR_BANCO).toBe("Reintentar");
    expect(H.BOTON_VER_EN_CONCILIACION).toBe("Ver en Conciliación");
    expect(H.TITULO_DESCARGAR_ESTADO_CUENTA).toBe(
      "Descarga el archivo original del banco (el enlace se genera al hacer clic y vence en 1 hora)",
    );
    expect(H.TEXTO_DESCARGANDO).toBe("Abriendo…");
    expect(H.TEXTO_NO_ABRIO_PESTANA).toBe("El navegador no abrió la pestaña");
    expect(H.ACCION_DESCARGAR).toBe("Descargar");
    expect(H.TITULO_QUE_HACER).toBe("¿Qué hacer?");
    expect(H.NOTA_CRUZAR_PENDIENTES).toBe(
      "Si el estado de cuenta de ese periodo ya está importado, prueba «Cruzar pendientes» en Conciliación.",
    );
    expect(H.MSG_DETALLE_BANCO_API_VIEJO).toBe(
      "El servidor todavía no tiene este detalle (falta actualizar el API). Mientras, búscalo en Conciliación.",
    );
    expect(H.MSG_DETALLE_BANCO_SIN_PERMISO).toBe("Solo Administración y Facturación ven el detalle del banco.");
    expect(H.MSG_SESION_EXPIRO).toBe("Tu sesión expiró. Recarga la página e inicia sesión.");
    expect(H.MSG_DETALLE_BANCO_FALLO).toBe("No se pudo cargar el detalle del banco. Vuelve a intentarlo.");
    expect(H.MSG_ESTADO_CUENTA_NO_EXISTE).toBe("El archivo del estado de cuenta ya no existe.");
    expect(H.MSG_ESTADO_CUENTA_FALLO).toBe("No se pudo generar la descarga del estado de cuenta. Vuelve a intentarlo.");
    expect(H.VENTANA_YA_CONCILIADOS_DIAS).toBe(7);
  });

  it("roles, descarga, búsqueda y el archivo de un cargo o un abono", () => {
    expect(H.ROLES_DETALLE_BANCO).toEqual(["ADMIN", "FACTURACION"]);
    expect(H.puedeVerDetalleBanco(null)).toBe(true);
    expect(H.puedeVerDetalleBanco("")).toBe(true);
    expect(H.puedeVerDetalleBanco("ADMIN")).toBe(true);
    expect(H.puedeVerDetalleBanco("FACTURACION")).toBe(true);
    for (const rol of ["COORDINADOR", "ANALISTA", "SOCIO", "PILOTO", "MECANICO", "VISITANTE"]) {
      expect(H.puedeVerDetalleBanco(rol), rol).toBe(false);
    }
    expect(H.etiquetaDescargaEstadoCuenta("PDF")).toBe("Descargar estado de cuenta (PDF)");
    expect(H.mensajeErrorDescargaEstadoCuenta({ status: 404 })).toBe(H.MSG_ESTADO_CUENTA_NO_EXISTE);
    expect(H.mensajeErrorDescargaEstadoCuenta({ status: 500 })).toBe(H.MSG_ESTADO_CUENTA_FALLO);
    expect(H.montoParaBusquedaTabla("2801.40")).toBe("2801.4");
    const sinArchivo = {
      estado_cuenta: null,
      orden_archivo: null,
      creado_at: "2026-07-17T00:34:09.441194+00:00",
      creado_por: "Jimmy Chi",
      sin_archivo: "IMPORTADO_SIN_ARCHIVO" as const,
    };
    const cuando = fmtDate("2026-07-17T00:34:09.441194+00:00");
    expect(H.archivoDeMovimiento(sinArchivo, "cargo")).toEqual({
      tipo: "SIN_ARCHIVO",
      texto: `Sin archivo guardado: este cargo se importó el ${cuando} por Jimmy Chi sin el archivo original del banco.`,
    });
    expect(H.archivoDeMovimiento(sinArchivo, "abono")).toEqual({
      tipo: "SIN_ARCHIVO",
      texto: `Sin archivo guardado: este abono se importó el ${cuando} por Jimmy Chi sin el archivo original del banco.`,
    });
    expect(
      H.archivoDeMovimiento(
        {
          ...sinArchivo,
          sin_archivo: null,
          orden_archivo: 12,
          estado_cuenta: {
            id: "e1",
            filename: "scotia eje sep.pdf",
            formato: "pdf",
            importado_at: "2026-10-06T15:22:46.413405+00:00",
            importado_por: "Alejandro Canales",
            movimientos_importados: 98,
          },
        },
        "abono",
      ),
    ).toEqual({
      tipo: "ARCHIVO",
      nombre: "scotia eje sep.pdf",
      detalle: `Importado el ${fmtDateTime("2026-10-06T15:22:46.413405+00:00")} por Alejandro Canales · línea 12 del archivo`,
      estadoCuentaId: "e1",
      etiquetaDescarga: "Descargar estado de cuenta (PDF)",
    });
  });
});

describe("gasto-banco re-exporta lo mudado (identidad)", () => {
  it("mismos valores y las MISMAS funciones", () => {
    const nombres = [
      "TITULO_HOJA_BANCO",
      "TEXTO_ESTADO_CAMBIO",
      "BOTON_RECARGAR",
      "BOTON_REINTENTAR_BANCO",
      "BOTON_VER_EN_CONCILIACION",
      "TITULO_DESCARGAR_ESTADO_CUENTA",
      "TEXTO_DESCARGANDO",
      "TEXTO_NO_ABRIO_PESTANA",
      "ACCION_DESCARGAR",
      "TITULO_QUE_HACER",
      "NOTA_CRUZAR_PENDIENTES",
      "MSG_DETALLE_BANCO_API_VIEJO",
      "MSG_DETALLE_BANCO_SIN_PERMISO",
      "MSG_SESION_EXPIRO",
      "MSG_DETALLE_BANCO_FALLO",
      "MSG_ESTADO_CUENTA_NO_EXISTE",
      "MSG_ESTADO_CUENTA_FALLO",
      "VENTANA_YA_CONCILIADOS_DIAS",
      "etiquetaDescargaEstadoCuenta",
      "mensajeErrorDescargaEstadoCuenta",
      "montoParaBusquedaTabla",
    ] as const;
    for (const n of nombres) expect(G[n], n).toBe(H[n]);
    expect(G.puedeVerDetalleBancoGasto).toBe(H.puedeVerDetalleBanco);
    expect(G.ROLES_DETALLE_BANCO_GASTO).toBe(H.ROLES_DETALLE_BANCO);
  });
});
