/**
 * CARD «CORREO AL CLIENTE» (9-nov-2026, API 0.0.133).
 *
 * Pedido de la oficina: «que se cancele el envío automático a los clientes;
 * que solo se mande cuando ellos le den en enviar de forma manual… y saber si
 * se mandó o no y con qué contenido». La card vive en la página única de la
 * cotización y en el detalle del vuelo. Aquí se congela lo que se VE:
 *  - la leyenda fija de que nada sale solo;
 *  - sin envíos / con un ENVIADO / con un FALLIDO (con su motivo);
 *  - «no se pudo leer» NO es «no se ha enviado nada»;
 *  - sin permiso de enviar no hay botón; un rol que no ve correos, sin card;
 *  - el contenido del correo va en un iframe aislado, jamás inyectado.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  BOTON_ENVIAR_CONFIRMACION,
  BOTON_VER_CONTENIDO,
  LEYENDA_CORREO_MANUAL,
  TEXTO_CORREOS_NO_DISPONIBLE,
  TEXTO_HISTORIAL_NO_CARGO,
  TEXTO_SIN_CORREOS,
  TEXTO_SOLO_LECTURA_CORREO,
  TITULO_CORREO_CLIENTE,
} from "@/lib/admin/correo-cliente";
import type { CargaCorreosDeVuelo, CorreoCliente } from "@/types/correos-cliente";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
// Las actions tocan la sesión (cookies): aquí solo se prueba lo que se pinta.
const previsualizar = vi.fn();
const enviar = vi.fn();
vi.mock("@/app/admin/quotes/actions", () => ({
  previsualizarCorreoConfirmacionAction: (...a: unknown[]) => previsualizar(...a),
  enviarCorreoConfirmacionAction: (...a: unknown[]) => enviar(...a),
}));
// Diálogo «abierto» siempre que su `open` lo diga, sin portal: así se puede
// leer el contenido de «Ver contenido» en el HTML estático.
vi.mock("@/components/ui/dialog", () => {
  const Pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
      open ? <div data-dialogo-abierto="">{children}</div> : null,
    DialogContent: Pasa,
    DialogHeader: Pasa,
    DialogFooter: Pasa,
    DialogTitle: Pasa,
    DialogDescription: Pasa,
  };
});

const { CorreoClienteCard } = await import("../correo-cliente-card");
const { CorreoMarco, CorreoSobre } = await import("../correo-contenido");

const VUELO = "3a8f1c2d-4b5e-4f60-8a71-92b3c4d5e6f7";
const USUARIO = "9b1d2c3e-0000-4000-8000-000000000001";

function correo(extra: Partial<CorreoCliente> = {}): CorreoCliente {
  return {
    id: "c0000001-0000-4000-8000-000000000001",
    vuelo_id: VUELO,
    folio: 412,
    tipo: "CONFIRMACION_VUELO",
    cliente_nombre: "Ana Ruiz",
    destinatario: "ana@x.com",
    remitente: "VuelaTour <notificaciones@vuelatour.com>",
    asunto: "Vuelo confirmado · CUN → CZM (folio #412)",
    html: '<p onclick="alert(1)">Hola Ana</p><script>alert(2)</script>',
    texto: "Hola Ana",
    estado: "ENVIADO",
    error: null,
    enviado_por: USUARIO,
    enviado_por_nombre: "Itzel",
    created_at: "2026-11-09T15:40:00Z",
    ...extra,
  };
}

const ok = (correos: CorreoCliente[]): CargaCorreosDeVuelo => ({ estado: "ok", datos: correos });

const html = (carga: CargaCorreosDeVuelo, rol: string | null = "ADMIN") =>
  renderToStaticMarkup(<CorreoClienteCard vueloId={VUELO} carga={carga} rol={rol} />);

describe("CorreoClienteCard — sin envíos", () => {
  const out = html(ok([]));

  it("título, leyenda fija y «no se le ha enviado ningún correo»", () => {
    expect(out).toContain(TITULO_CORREO_CLIENTE);
    expect(out).toContain(LEYENDA_CORREO_MANUAL);
    expect(out).toContain(TEXTO_SIN_CORREOS);
    expect(out).toContain('data-correo-cliente-card="ok"');
    expect(out).not.toContain("data-correo-estado");
  });

  it("Administración ve el botón «Enviar confirmación al cliente»; nada se pide al pintar", () => {
    expect(out).toContain("data-enviar-confirmacion");
    expect(out).toContain(BOTON_ENVIAR_CONFIRMACION);
    // Ni vista previa ni envío hasta que alguien pulse: nada sale solo.
    expect(previsualizar).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
    expect(out).not.toContain("data-dialogo-abierto");
  });
});

describe("CorreoClienteCard — con un ENVIADO", () => {
  const out = html(ok([correo()]));

  it("dice cuándo, quién y a qué correo, en verde, con «Ver contenido»", () => {
    expect(out).toContain("Se le ha enviado 1 correo al cliente.");
    expect(out).not.toContain(TEXTO_SIN_CORREOS);
    expect(out.match(/data-correo-estado="ENVIADO"/g)).toHaveLength(1);
    expect(out).toMatch(/Enviado el 09\/11\/2026, 10:40 a\.\s?m\. por Itzel a ana@x\.com/);
    expect(out).toContain(">Enviado</");
    expect(out).toContain(BOTON_VER_CONTENIDO);
    expect(out).toContain("data-ver-contenido-correo");
  });

  it("jamás el uuid de quien lo envió ni el HTML del correo suelto en la página", () => {
    expect(out).not.toContain(USUARIO);
    // El contenido solo existe dentro del diálogo (cerrado) y, ahí, en un iframe.
    expect(out).not.toContain("Hola Ana");
    expect(out).not.toContain("<script");
  });
});

describe("CorreoClienteCard — con un FALLIDO", () => {
  const fallido = correo({
    id: "c0000002-0000-4000-8000-000000000002",
    estado: "FALLIDO",
    error: "Mailbox does not exist",
  });

  it("en rojo, con su motivo, y el resumen dice que al cliente no le llegó nada", () => {
    const out = html(ok([fallido]));
    expect(out).toContain('data-correo-estado="FALLIDO"');
    expect(out).toContain("No se envió");
    expect(out).toContain("Motivo: Mailbox does not exist");
    expect(out).toContain("Al cliente no le ha llegado ningún correo: el único intento falló.");
    expect(out).not.toContain("Se le ha enviado");
    // Se puede volver a intentar.
    expect(out).toContain("data-enviar-confirmacion");
  });

  it("mezclados: el más reciente primero, tal como los manda el API", () => {
    const out = html(ok([fallido, correo()]));
    expect(out.indexOf('data-correo-estado="FALLIDO"')).toBeLessThan(
      out.indexOf('data-correo-estado="ENVIADO"'),
    );
    expect(out).toContain("Se le ha enviado 1 correo al cliente. Otro intento falló.");
  });
});

describe("CorreoClienteCard — permisos", () => {
  it("Facturación y Analista VEN el historial pero no tienen botón de enviar", () => {
    for (const rol of ["FACTURACION", "ANALISTA"]) {
      const out = html(ok([correo()]), rol);
      expect(out, rol).toContain(LEYENDA_CORREO_MANUAL);
      expect(out, rol).toContain("data-correo-estado");
      expect(out, rol).toContain(BOTON_VER_CONTENIDO);
      expect(out, rol).not.toContain("data-enviar-confirmacion");
      expect(out, rol).not.toContain(BOTON_ENVIAR_CONFIRMACION);
      expect(out, rol).toContain(TEXTO_SOLO_LECTURA_CORREO);
    }
  });

  it("Dirección y Coordinación envían igual que Administración", () => {
    for (const rol of ["DIRECCION", "COORDINADOR", "ADMIN"]) {
      expect(html(ok([]), rol), rol).toContain("data-enviar-confirmacion");
    }
  });

  it("un rol que no ve correos (Socio, Piloto, sin rol) no tiene card", () => {
    for (const rol of ["SOCIO", "PILOTO", null]) {
      expect(html(ok([correo()]), rol), String(rol)).toBe("");
    }
    expect(html({ estado: "sin-acceso" })).toBe("");
  });
});

describe("CorreoClienteCard — la lectura falló: nunca «no se ha enviado nada»", () => {
  it("error: lo DICE, ofrece Reintentar y deja enviar (la vista previa dirá si ya se envió)", () => {
    const out = html({ estado: "error" });
    expect(out).toContain("data-correos-no-cargaron");
    expect(out).toContain(TEXTO_HISTORIAL_NO_CARGO);
    expect(out).toContain("Reintentar");
    expect(out).not.toContain(TEXTO_SIN_CORREOS);
    expect(out).toContain(LEYENDA_CORREO_MANUAL);
    expect(out).toContain("data-enviar-confirmacion");
  });

  it("API sin desplegar: ni «no se ha enviado», ni la leyenda (aún no es cierta), ni botón", () => {
    const out = html({ estado: "no-disponible" });
    expect(out).toContain(TITULO_CORREO_CLIENTE);
    expect(out).toContain(TEXTO_CORREOS_NO_DISPONIBLE);
    expect(out).not.toContain(TEXTO_SIN_CORREOS);
    expect(out).not.toContain(LEYENDA_CORREO_MANUAL);
    expect(out).not.toContain("data-enviar-confirmacion");
  });
});

describe("contenido del correo: De / Para / Asunto y un iframe aislado", () => {
  it("el sobre dice desde qué correo salió y a quién", () => {
    const c = correo();
    const out = renderToStaticMarkup(
      <CorreoSobre
        remitente={c.remitente}
        destinatario={c.destinatario}
        clienteNombre={c.cliente_nombre}
        asunto={c.asunto}
      />,
    );
    expect(out).toContain("De");
    expect(out).toContain("VuelaTour &lt;notificaciones@vuelatour.com&gt;");
    expect(out).toContain("Para");
    expect(out).toContain("ana@x.com (Ana Ruiz)");
    expect(out).toContain("Asunto");
    expect(out).toContain("Vuelo confirmado · CUN → CZM (folio #412)");
  });

  it("el HTML va en `srcDoc` de un iframe con `sandbox` vacío (sin scripts), nunca como marcado de la página", () => {
    const out = renderToStaticMarkup(<CorreoMarco html={correo().html} texto="Hola Ana" />);
    expect(out).toMatch(/<iframe[^>]*\ssandbox=""/);
    expect(out).toMatch(/<iframe[^>]*\ssrcDoc="/i);
    // Escapado dentro del atributo: no hay etiquetas del correo en el documento.
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<p onclick");
    expect(out).toContain("&lt;script&gt;");
    // Ningún permiso del sandbox (allow-scripts, allow-same-origin…).
    expect(out).not.toContain("allow-");
  });

  it("sin HTML cae al texto plano; sin nada, lo dice", () => {
    const soloTexto = renderToStaticMarkup(<CorreoMarco html="" texto="Hola <b>Ana</b>" />);
    expect(soloTexto).not.toContain("<iframe");
    expect(soloTexto).toContain("Hola &lt;b&gt;Ana&lt;/b&gt;");
    expect(renderToStaticMarkup(<CorreoMarco html={null} texto={null} />)).toContain(
      "Este correo no tiene contenido guardado.",
    );
  });
});
