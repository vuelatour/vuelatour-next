"use client";

import { useState } from "react";
import { EyeIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BOTON_CERRAR,
  BOTON_VER_CONTENIDO,
  DESCRIPCION_CONTENIDO_ENVIADO,
  DESCRIPCION_CONTENIDO_FALLIDO,
  ETIQUETA_ASUNTO,
  ETIQUETA_DE,
  ETIQUETA_PARA,
  TEXTO_SIN_CONTENIDO,
  TITULO_CONTENIDO_CORREO,
  TITULO_MARCO_CORREO,
  esCorreoFallido,
  estadoCorreoUi,
  lineaEnvio,
  textoDestinatario,
  textoErrorCorreo,
  textoRemitente,
} from "@/lib/admin/correo-cliente";
import type { CorreoCliente } from "@/types/correos-cliente";

/**
 * PIEZAS para ver un correo al cliente (9-nov-2026, API 0.0.133): el «sobre»
 * (De / Para / Asunto), el contenido y el botón «Ver contenido» con su
 * diálogo. Las usan la card «Correo al cliente» (historial y vista previa) y
 * la pantalla «Correos enviados»: el correo se ve IGUAL en los tres lados.
 */

/** De / Para / Asunto. «De» responde «¿desde qué correo se mandó?». */
export function CorreoSobre({
  remitente,
  destinatario,
  clienteNombre,
  asunto,
}: {
  remitente: string | null | undefined;
  destinatario: string | null | undefined;
  clienteNombre?: string | null;
  asunto: string | null | undefined;
}) {
  return (
    <dl
      data-correo-sobre=""
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
    >
      <dt className="text-muted-foreground">{ETIQUETA_DE}</dt>
      <dd className="break-words">{textoRemitente(remitente)}</dd>
      <dt className="text-muted-foreground">{ETIQUETA_PARA}</dt>
      <dd className="break-words">{textoDestinatario(destinatario, clienteNombre)}</dd>
      <dt className="text-muted-foreground">{ETIQUETA_ASUNTO}</dt>
      <dd className="break-words font-medium">{asunto?.trim() || "—"}</dd>
    </dl>
  );
}

/**
 * El contenido EXACTO del correo, de solo lectura. Va en un `<iframe>` con
 * `sandbox=""` (sin scripts, sin formularios, sin salir del marco): el HTML es
 * el de un correo y JAMÁS se inyecta en la página con
 * `dangerouslySetInnerHTML`. Fondo blanco fijo: así lo ve el cliente en su
 * bandeja, aunque el panel esté en modo oscuro. Sin HTML cae al texto plano.
 */
export function CorreoMarco({
  html,
  texto,
}: {
  html: string | null | undefined;
  texto?: string | null;
}) {
  if (html?.trim()) {
    return (
      <iframe
        data-correo-marco=""
        sandbox=""
        srcDoc={html}
        title={TITULO_MARCO_CORREO}
        className="h-[50dvh] min-h-64 w-full rounded-lg border border-border bg-white"
      />
    );
  }
  if (texto?.trim()) {
    return (
      <pre
        data-correo-texto=""
        className="max-h-[50dvh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-white p-3 font-sans text-sm text-neutral-900"
      >
        {texto}
      </pre>
    );
  }
  return <p className="text-sm text-muted-foreground">{TEXTO_SIN_CONTENIDO}</p>;
}

/** Badge del estado: ENVIADO verde, FALLIDO rojo. */
export function CorreoEstadoBadge({ estado }: { estado: string | null | undefined }) {
  const ui = estadoCorreoUi(estado);
  return (
    <Badge variant="outline" className={`shrink-0 text-[10px] ${ui.cls}`}>
      {ui.label}
    </Badge>
  );
}

/**
 * «Ver contenido» de UN correo ya registrado: abre un diálogo con cuándo y
 * quién lo mandó, De / Para / Asunto y el contenido exacto.
 */
export function VerContenidoCorreo({ correo }: { correo: CorreoCliente }) {
  const [abierto, setAbierto] = useState(false);
  const fallido = esCorreoFallido(correo);
  const error = textoErrorCorreo(correo);
  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={() => setAbierto(true)}
        data-ver-contenido-correo=""
      >
        <EyeIcon />
        {BOTON_VER_CONTENIDO}
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{TITULO_CONTENIDO_CORREO}</DialogTitle>
            <DialogDescription>
              {fallido ? DESCRIPCION_CONTENIDO_FALLIDO : DESCRIPCION_CONTENIDO_ENVIADO}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <CorreoEstadoBadge estado={correo.estado} />
            <span className="min-w-0 break-words">{lineaEnvio(correo)}</span>
          </div>
          {error && (
            <p role="alert" className="break-words text-sm text-destructive">
              {error}
            </p>
          )}
          <CorreoSobre
            remitente={correo.remitente}
            destinatario={correo.destinatario}
            clienteNombre={correo.cliente_nombre}
            asunto={correo.asunto}
          />
          <CorreoMarco html={correo.html} texto={correo.texto} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
              {BOTON_CERRAR}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
