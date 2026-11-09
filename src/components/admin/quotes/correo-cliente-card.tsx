"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowPathIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CorreoEstadoBadge,
  CorreoMarco,
  CorreoSobre,
  VerContenidoCorreo,
} from "@/components/admin/quotes/correo-contenido";
import {
  enviarCorreoConfirmacionAction,
  previsualizarCorreoConfirmacionAction,
} from "@/app/admin/quotes/actions";
import {
  BOTON_CANCELAR_ENVIO,
  BOTON_CERRAR,
  BOTON_ENVIAR_CONFIRMACION,
  BOTON_REINTENTAR,
  DESCRIPCION_VISTA_PREVIA,
  LEYENDA_CORREO_MANUAL,
  MENSAJE_ENVIO_INCIERTO,
  MENSAJE_VISTA_PREVIA_ERROR,
  TEXTO_CARGANDO_VISTA_PREVIA,
  TEXTO_CORREOS_NO_DISPONIBLE,
  TEXTO_ENVIANDO,
  TEXTO_HISTORIAL_NO_CARGO,
  TEXTO_SOLO_LECTURA_CORREO,
  TITULO_CORREO_CLIENTE,
  TITULO_VISTA_PREVIA,
  avisoReenvio,
  errorVistaPrevia,
  esReenvio,
  lineaEnvio,
  motivoNoEnviable,
  puedeEnviarCorreoCliente,
  puedeVerCorreosCliente,
  resultadoEnvio,
  textoBotonEnviar,
  textoErrorCorreo,
  textoResumenCorreos,
} from "@/lib/admin/correo-cliente";
import type {
  CargaCorreosDeVuelo,
  CorreoCliente,
  UltimoEnvioCorreo,
  VistaPreviaCorreoConfirmacion,
} from "@/types/correos-cliente";

/**
 * «CORREO AL CLIENTE» (9-nov-2026, API 0.0.133) — en la página única de la
 * cotización y en el detalle del vuelo.
 *
 * Pedido de la oficina: «que se cancele el envío automático a los clientes;
 * que solo se mande cuando ellos le den en enviar de forma manual, solo si se
 * requiere, y saber si se mandó o no y con qué contenido». Por eso la card:
 *  1. DICE siempre que nada sale solo (leyenda fija).
 *  2. Enseña si ya se le mandó algo: cada envío con fecha, quién, a qué
 *     correo, ENVIADO/FALLIDO y «Ver contenido» (lo que salió, tal cual).
 *  3. Deja enviar SOLO tras ver la vista previa (De / Para / Asunto +
 *     contenido) y pulsar «Enviar correo». Si ya se había enviado, avisa en
 *     ámbar y el botón dice «Enviar otra vez».
 *
 * El panel no decide cuándo se puede enviar (estado del vuelo, correo del
 * cliente): lo dice el API en la vista previa (`puede_enviar` + `motivo`).
 * `carga` distingue «sin envíos» de «no se pudo leer»: jamás se pinta «no se
 * le ha enviado nada» cuando la lectura falló.
 */
export function CorreoClienteCard({
  vueloId,
  carga,
  rol,
}: {
  /** Cotización y vuelo son la MISMA fila: el id sirve en las dos pantallas. */
  vueloId: string;
  /** Historial de correos del vuelo, leído por la página (best-effort). */
  carga: CargaCorreosDeVuelo;
  /** Rol de `/v1/me`. Solo Dirección, Administración y Coordinación envían. */
  rol: string | null;
}) {
  const router = useRouter();
  const [reintentando, empezarReintento] = useTransition();

  // El rol no ve correos (el API le respondería 403): la card no existe.
  if (!puedeVerCorreosCliente(rol) || carga.estado === "sin-acceso") return null;

  // API sin desplegar: ni leyenda (un API anterior aún podría mandar el correo
  // al confirmar; afirmar «no se envían solos» sería mentir) ni botón.
  if (carga.estado === "no-disponible") {
    return (
      <Card id="correo-cliente" data-correo-cliente-card="no-disponible" className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <EnvelopeIcon className="h-4 w-4" />
            {TITULO_CORREO_CLIENTE}
          </CardTitle>
          <CardDescription className="text-xs">{TEXTO_CORREOS_NO_DISPONIBLE}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const puedeEnviar = puedeEnviarCorreoCliente(rol);
  const correos = carga.estado === "ok" ? carga.datos : null;

  return (
    <Card id="correo-cliente" data-correo-cliente-card={carga.estado} className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <EnvelopeIcon className="h-4 w-4" />
          {TITULO_CORREO_CLIENTE}
        </CardTitle>
        <CardDescription className="text-xs">{LEYENDA_CORREO_MANUAL}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {correos === null ? (
          // La lectura falló: se DICE (no es «sin envíos») y se puede reintentar.
          <div
            role="alert"
            data-correos-no-cargaron=""
            className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
          >
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 space-y-1.5">
              <p>{TEXTO_HISTORIAL_NO_CARGO}</p>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={reintentando}
                onClick={() => empezarReintento(() => router.refresh())}
              >
                <ArrowPathIcon className={reintentando ? "animate-spin" : undefined} />
                {BOTON_REINTENTAR}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p
              data-correos-resumen=""
              className={correos.length === 0 ? "text-muted-foreground" : "font-medium"}
            >
              {textoResumenCorreos(correos)}
            </p>
            {correos.length > 0 && (
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {correos.map((c) => (
                  <EnvioItem key={c.id} correo={c} />
                ))}
              </ul>
            )}
          </>
        )}

        {puedeEnviar ? (
          <EnviarConfirmacion vueloId={vueloId} />
        ) : (
          <p data-correo-solo-lectura="" className="text-[11px] text-muted-foreground">
            {TEXTO_SOLO_LECTURA_CORREO}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Un envío del historial (exportado para las pruebas de estructura). */
export function EnvioItem({ correo }: { correo: CorreoCliente }) {
  const error = textoErrorCorreo(correo);
  return (
    <li
      data-correo-estado={correo.estado}
      className={`space-y-1.5 rounded-lg border p-2.5 ${
        error ? "border-destructive/40 bg-destructive/[0.04]" : "border-border bg-muted/20"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words text-xs">{lineaEnvio(correo)}</p>
        <CorreoEstadoBadge estado={correo.estado} />
      </div>
      {error && <p className="break-words text-[11px] text-destructive">{error}</p>}
      <VerContenidoCorreo correo={correo} />
    </li>
  );
}

/** Estado de la vista previa dentro del diálogo. */
type Vista =
  | { fase: "cargando" }
  | { fase: "error"; mensaje: string }
  | { fase: "lista"; datos: VistaPreviaCorreoConfirmacion };

/**
 * Botón «Enviar confirmación al cliente» + su diálogo. Al abrir pide la VISTA
 * PREVIA al API (no envía nada) y solo «Enviar correo» manda el POST.
 *
 * La vista previa se pide en el CLIC, no en un efecto: `RefreshOnFocus`
 * entrega props nuevas al volver a la pestaña y un efecto la volvería a pedir
 * (o reiniciaría el diálogo) a media lectura.
 */
function EnviarConfirmacion({ vueloId }: { vueloId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [vista, setVista] = useState<Vista>({ fase: "cargando" });
  // 409 `CORREO_YA_ENVIADO`: alguien lo mandó mientras se veía la vista previa.
  const [yaEnviado, setYaEnviado] = useState<{ ultimo: UltimoEnvioCorreo | null } | null>(null);
  // 409 `CORREO_NO_ENVIABLE`: dejó de poderse (p. ej. le quitaron el correo al cliente).
  const [bloqueo, setBloqueo] = useState<string | null>(null);
  // El proveedor falló o no se supo si salió: mensaje en rojo dentro del diálogo.
  const [falla, setFalla] = useState<{ mensaje: string; motivo: string | null } | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Candado contra el doble clic (el estado tarda un render en deshabilitar).
  const enviandoRef = useRef(false);
  // Cada apertura es un «turno»: una respuesta de un turno viejo se descarta.
  const turnoRef = useRef(0);

  const cargarVistaPrevia = async () => {
    const turno = ++turnoRef.current;
    setVista({ fase: "cargando" });
    setYaEnviado(null);
    setBloqueo(null);
    setFalla(null);
    try {
      const res = await previsualizarCorreoConfirmacionAction(vueloId);
      if (turnoRef.current !== turno) return;
      setVista(
        res.ok && res.data
          ? { fase: "lista", datos: res.data }
          : { fase: "error", mensaje: errorVistaPrevia(res) },
      );
    } catch {
      if (turnoRef.current !== turno) return;
      setVista({ fase: "error", mensaje: MENSAJE_VISTA_PREVIA_ERROR });
    }
  };

  const abrir = () => {
    setAbierto(true);
    void cargarVistaPrevia();
  };

  const cerrar = () => {
    if (enviandoRef.current) return; // a medio envío no se cierra
    turnoRef.current++;
    setAbierto(false);
  };

  const datos = vista.fase === "lista" ? vista.datos : null;
  const noEnviable = bloqueo ?? (datos && !datos.puede_enviar ? motivoNoEnviable(datos) : null);
  const reenvio = yaEnviado !== null || esReenvio(datos);

  const enviar = async () => {
    if (enviandoRef.current || !datos || noEnviable) return;
    enviandoRef.current = true;
    setEnviando(true);
    setFalla(null);
    try {
      const res = await enviarCorreoConfirmacionAction(vueloId, { reenviar: reenvio });
      const r = resultadoEnvio(res);
      if (r.tipo === "enviado") {
        toast.success(r.mensaje);
        turnoRef.current++;
        setAbierto(false);
      } else if (r.tipo === "fallido") {
        // Quedó registrado como FALLIDO: el historial lo enseña al refrescar.
        toast.error(r.mensaje, r.motivo ? { description: r.motivo } : undefined);
        setFalla({ mensaje: r.mensaje, motivo: r.motivo });
      } else if (r.tipo === "ya-enviado") {
        // Nada salió: se pregunta otra vez, ahora como reenvío.
        setYaEnviado({ ultimo: r.ultimo });
      } else if (r.tipo === "no-enviable") {
        setBloqueo(r.mensaje);
      } else {
        toast.error(r.mensaje);
        setFalla({ mensaje: r.mensaje, motivo: null });
      }
    } catch {
      // La llamada misma se cayó (red): no se sabe si el correo salió.
      toast.error(MENSAJE_ENVIO_INCIERTO);
      setFalla({ mensaje: MENSAJE_ENVIO_INCIERTO, motivo: null });
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
      // Siempre: el historial de la card (y el de la otra pantalla) se pone al día.
      router.refresh();
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={abrir}
        className="gap-2"
        data-enviar-confirmacion=""
      >
        <PaperAirplaneIcon />
        {BOTON_ENVIAR_CONFIRMACION}
      </Button>

      <Dialog open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
        <DialogContent className="sm:max-w-2xl" showCloseButton={!enviando}>
          <DialogHeader>
            <DialogTitle>{TITULO_VISTA_PREVIA}</DialogTitle>
            <DialogDescription>{DESCRIPCION_VISTA_PREVIA}</DialogDescription>
          </DialogHeader>

          {vista.fase === "cargando" && (
            <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
              {TEXTO_CARGANDO_VISTA_PREVIA}
            </p>
          )}

          {vista.fase === "error" && (
            <div
              role="alert"
              className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <p>{vista.mensaje}</p>
              <Button type="button" size="xs" variant="outline" onClick={() => void cargarVistaPrevia()}>
                <ArrowPathIcon />
                {BOTON_REINTENTAR}
              </Button>
            </div>
          )}

          {datos && noEnviable && (
            // No se puede enviar: el porqué (del API) y ningún botón de envío.
            <div
              role="alert"
              data-correo-no-enviable=""
              className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
            >
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="min-w-0 break-words">{noEnviable}</p>
            </div>
          )}

          {datos && !noEnviable && (
            <>
              {reenvio && (
                <div
                  role="alert"
                  data-correo-reenvio=""
                  className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
                >
                  <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="min-w-0 break-words">
                    {avisoReenvio(yaEnviado ? yaEnviado.ultimo : datos.ultimo_envio, datos.enviados)}
                  </p>
                </div>
              )}
              <CorreoSobre
                remitente={datos.remitente}
                destinatario={datos.destinatario}
                clienteNombre={datos.cliente_nombre}
                asunto={datos.asunto}
              />
              <CorreoMarco html={datos.html} texto={datos.texto} />
            </>
          )}

          {falla && (
            <div
              role="alert"
              data-correo-falla=""
              className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <p className="break-words font-medium">{falla.mensaje}</p>
              {falla.motivo && <p className="break-words text-xs">{falla.motivo}</p>}
            </div>
          )}

          <DialogFooter>
            {datos && !noEnviable ? (
              <>
                <Button type="button" variant="outline" onClick={cerrar} disabled={enviando}>
                  {BOTON_CANCELAR_ENVIO}
                </Button>
                <Button
                  type="button"
                  onClick={() => void enviar()}
                  disabled={enviando}
                  className="gap-2 bg-brand-600 hover:bg-brand-600/90"
                  data-enviar-correo=""
                >
                  <PaperAirplaneIcon />
                  {enviando ? TEXTO_ENVIANDO : textoBotonEnviar(reenvio)}
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" onClick={cerrar}>
                {BOTON_CERRAR}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
