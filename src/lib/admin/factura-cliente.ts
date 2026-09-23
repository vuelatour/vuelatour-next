/**
 * FACTURA DEL SERVICIO, por vuelo (22-sep-2026).
 *
 * Pedido del cliente: «quisiera agregar por cada vuelo las opciones para
 * identificar vuelos **facturado**, **sin factura**, **factura elaborada y
 * enviada**, y que pueda yo también **subir la factura del servicio** a un
 * lado».
 *
 * Hasta hoy el vuelo solo tenía `facturado` (boolean) = «el sistema timbró un
 * CFDI». Eso deja fuera el caso real de la oficina: la factura se elabora en
 * otro lado (o la emite el contador) y se manda por correo; el vuelo no está
 * «sin factura» pero tampoco tiene CFDI en el sistema. De ahí el tercer
 * estado, que es MANUAL y lo lleva la oficina:
 *
 *   SIN_FACTURA · ELABORADA_ENVIADA · FACTURADO
 *
 * **El CFDI manda**: cuando `vuelo.facturado = true` el estatus queda en
 * FACTURADO y el selector se bloquea (el API responde 409 `VUELO_CON_CFDI` si
 * alguien intenta bajarlo). Al revés no: marcar FACTURADO a mano NO timbra
 * nada — es seguimiento de oficina, igual que el semáforo de los gastos.
 *
 * Módulo PURO (sin React ni `lib/format`): lo usan la card «Cobro» del vuelo
 * (cliente) y las páginas server. Prueba en `__tests__/factura-cliente.test.ts`.
 */

export type EstatusFacturaCliente = "SIN_FACTURA" | "ELABORADA_ENVIADA" | "FACTURADO";

export interface EstadoFacturaCliente {
  value: EstatusFacturaCliente;
  /** Corta: badge de la card y de las listas. */
  label: string;
  /** Larga: opciones del selector. */
  labelForm: string;
  /** Clases del pill del badge. */
  pill: string;
  /** Qué significa (tooltip del selector). */
  ayuda: string;
}

/** Sin dato NUNCA se afirma «facturado» (mismo criterio que los gastos). */
export const FACTURA_CLIENTE_DEFAULT: EstatusFacturaCliente = "SIN_FACTURA";

export const FACTURA_CLIENTE_ESTADOS: EstadoFacturaCliente[] = [
  {
    value: "SIN_FACTURA",
    label: "Sin factura",
    labelForm: "Sin factura",
    pill: "border-border text-muted-foreground",
    ayuda: "Todavía no se elaboró la factura de este servicio.",
  },
  {
    value: "ELABORADA_ENVIADA",
    label: "Factura elaborada y enviada",
    labelForm: "Factura elaborada y enviada",
    pill: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    ayuda:
      "La factura ya se hizo y se mandó al cliente, aunque el CFDI no se haya timbrado desde el sistema.",
  },
  {
    value: "FACTURADO",
    label: "Facturado",
    labelForm: "Facturado",
    pill: "border-brand-600/30 bg-brand-600/15 text-brand-600 dark:text-brand-400",
    ayuda: "El servicio quedó facturado. Si el CFDI se timbró aquí, el sistema lo marca solo.",
  },
];

/** Ficha del estado; valor desconocido o ausente ⇒ Sin factura (conservador). */
export function estadoFacturaCliente(
  value: string | null | undefined,
): EstadoFacturaCliente {
  return (
    FACTURA_CLIENTE_ESTADOS.find((e) => e.value === value) ?? FACTURA_CLIENTE_ESTADOS[0]
  );
}

/** Archivo de la factura del servicio, tal como lo manda el API. */
export interface ArchivoFacturaCliente {
  path: string;
  nombre: string | null;
  subida_at: string | null;
  subida_por_nombre?: string | null;
}

/** Bloque ADITIVO del snapshot / de la lista de vuelos. */
export interface FacturaClienteSnapshot {
  estatus: string;
  archivo: ArchivoFacturaCliente | null;
}

/**
 * Estatus VIGENTE de un vuelo, con la tolerancia al API previo.
 *
 * - Con `factura_cliente` (API nuevo) manda su `estatus`, salvo que el CFDI
 *   diga otra cosa: `facturado = true` ⇒ FACTURADO siempre (el snapshot puede
 *   ir un instante atrás del timbrado).
 * - Sin `factura_cliente` (API previo) se cae a `facturado`, que es lo ÚNICO
 *   que ese API sabe: exactamente la pantalla de hoy.
 */
export function estatusFacturaCliente(v: {
  facturado?: boolean | null;
  factura_cliente?: FacturaClienteSnapshot | null;
}): EstatusFacturaCliente {
  if (v.facturado === true) return "FACTURADO";
  const crudo = v.factura_cliente?.estatus;
  if (!crudo) return FACTURA_CLIENTE_DEFAULT;
  return estadoFacturaCliente(crudo).value;
}

/** ¿El estatus lo fija el CFDI y por eso el selector va bloqueado? */
export function bloqueadoPorCfdi(v: { facturado?: boolean | null }): boolean {
  return v.facturado === true;
}

/** Razón del bloqueo, en palabras de operador. */
export const RAZON_BLOQUEO_CFDI =
  "Este vuelo ya tiene un CFDI timbrado en el sistema: su estatus se queda en «Facturado». Si la factura se canceló, cancélala en Facturas.";

/** Extensiones que acepta «Subir factura» (espejo del API). */
export const EXTENSIONES_FACTURA = [".pdf", ".xml"] as const;

/** Tope de tamaño del archivo (espejo del API). */
export const MAX_BYTES_FACTURA = 10 * 1024 * 1024;

/** Mensaje de rechazo local, antes de gastar la subida. */
export function motivoArchivoInvalido(file: {
  name: string;
  size: number;
}): string | null {
  const nombre = (file.name ?? "").toLowerCase();
  const ok = EXTENSIONES_FACTURA.some((ext) => nombre.endsWith(ext));
  if (!ok) return "La factura se sube en PDF o XML (es el archivo que se manda al cliente).";
  if (file.size > MAX_BYTES_FACTURA) {
    return `El archivo pesa más de ${Math.round(MAX_BYTES_FACTURA / 1024 / 1024)} MB. Sube el PDF sin las fotos o comprímelo.`;
  }
  return null;
}

/**
 * Renglón bajo el archivo: «factura-232.pdf · subió Itzi · 22 sep 2026».
 * `fecha` lo formatea quien llama (hora Cancún, `fmtDate`) — este módulo es
 * PURO y no conoce zonas horarias.
 */
export function textoArchivoFactura(
  archivo: ArchivoFacturaCliente | null | undefined,
  fecha?: string | null,
): string | null {
  if (!archivo) return null;
  const partes = [archivo.nombre?.trim() || "Factura del servicio"];
  const quien = archivo.subida_por_nombre?.trim();
  if (quien) partes.push(`subió ${quien}`);
  if (fecha) partes.push(fecha);
  return partes.join(" · ");
}
