"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CpuChipIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Field } from "@/components/admin/form-field";
import { fmtDateTime } from "@/lib/datetime";
import { setModeloIaAction } from "@/app/admin/configuracion/actions";
import {
  DESCRIPCION_MODELO_IA,
  ETIQUETA_GUARDAR_MODELO_IA,
  ETIQUETA_SELECTOR_MODELO_IA,
  ETIQUETA_VOLVER_SERVIDOR_IA,
  OPCION_OTRO_MODELO_IA,
  TEXTO_MODELO_IA_NO_CARGO,
  TITULO_MODELO_IA,
  avisoServidorSinConfirmarIa,
  errorCampoOtroModeloIa,
  hayCambioModeloIa,
  mensajeErrorModeloIa,
  notaModeloEnUsoIa,
  notaModeloIa,
  opcionesModeloIa,
  seleccionInicialModeloIa,
  textoGuardadoModeloIa,
  textoModeloEnUsoIa,
  textosConfirmacionModeloIa,
  textoUltimoCambioModeloIa,
  validarSeleccionModeloIa,
  type ConfirmacionModeloIa,
  type NotaModeloIa,
  type SeleccionModeloIa,
} from "@/lib/admin/ia-modelo";
import type { LecturaModeloIa, ModeloIa } from "@/types/ia-modelo";

/** Nota de tarifa / aviso: neutra (gris) o ámbar con su ícono. */
function NotaModelo({ nota, cual }: { nota: NotaModeloIa; cual: "en-uso" | "elegido" }) {
  return (
    <p
      data-nota-modelo={cual}
      data-tono={nota.tono}
      className={
        nota.tono === "ambar"
          ? "flex items-start gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
          : "text-xs text-muted-foreground"
      }
    >
      {nota.tono === "ambar" && <ExclamationTriangleIcon className="mt-px h-3.5 w-3.5 shrink-0" />}
      {nota.texto}
    </p>
  );
}

const OPCIONES = opcionesModeloIa();

/** Encabezado común (título con su ícono) de los tres estados de la tarjeta. */
function TituloModeloIa() {
  return (
    <CardTitle className="text-base flex items-center gap-2">
      <CpuChipIcon className="h-4 w-4 text-muted-foreground" />
      {TITULO_MODELO_IA}
    </CardTitle>
  );
}

/**
 * Esqueleto mientras llega `GET /v1/config/ia-modelo` (la página la pinta en
 * `<Suspense>`: el API espera hasta 5 s a pyservices y el resto de
 * Configuración NO debe esperar con él).
 */
export function ModeloIaCardCargando() {
  return (
    <Card data-modelo-ia="cargando" aria-busy="true">
      <CardHeader className="pb-2">
        <TituloModeloIa />
        <CardDescription>{DESCRIPCION_MODELO_IA}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-64 max-w-full" />
        <Skeleton className="h-9 w-full sm:w-1/2" />
      </CardContent>
    </Card>
  );
}

/**
 * «Modelo de IA» (2-oct-2026, API 0.0.51), dentro de «Créditos de IA».
 * Textos y reglas en `lib/admin/ia-modelo.ts`; aquí solo se pinta.
 *
 * - `no-disponible` (API previo / sin permiso) ⇒ no se monta.
 * - `fallo` ⇒ la tarjeta dice que no se pudo cargar (nunca se esconde).
 * - `ok` ⇒ modelo en uso + selector + «Guardar» / «Volver al del servidor»,
 *   ambos con CONFIRMACIÓN: el `PUT` solo sale de `confirmar()`, que solo
 *   llama el botón de la confirmación.
 * La página la monta dentro de `<Suspense>` con `ModeloIaCardCargando`.
 */
export function ModeloIaCard({ lectura }: { lectura: LecturaModeloIa }) {
  if (lectura.estado === "no-disponible") return null;
  if (lectura.estado === "fallo") {
    return (
      <Card data-modelo-ia="fallo">
        <CardHeader>
          <TituloModeloIa />
          <CardDescription>{TEXTO_MODELO_IA_NO_CARGO}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  // key: si otro admin cambió el modelo (o se acaba de guardar), el selector
  // arranca de lo que hay HOY, no de la selección vieja de esta pestaña.
  return <ModeloIaEditor key={lectura.datos.configurado ?? ""} datos={lectura.datos} />;
}

function ModeloIaEditor({ datos }: { datos: ModeloIa }) {
  const router = useRouter();
  const [sel, setSel] = useState<SeleccionModeloIa>(() => seleccionInicialModeloIa(datos));
  // El campo «Otro» no marca su error hasta que el operador sale de él.
  const [otroTocado, setOtroTocado] = useState(false);
  // `abierto` va APARTE de la última confirmación pedida: al cerrar solo se
  // apaga `abierto` y el diálogo sigue pintando SUS textos durante la
  // animación de salida (si se borrara, «Volver al del servidor» mostraría
  // el título y el botón de «Guardar» en el fade-out). Se sustituye al pedir
  // otra.
  const [confirmacion, setConfirmacion] = useState<ConfirmacionModeloIa | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();

  const enUso = textoModeloEnUsoIa(datos);
  const notaEnUso = notaModeloEnUsoIa(datos);
  const ultimoCambio = textoUltimoCambioModeloIa(datos, fmtDateTime(datos.actualizado_at));
  const avisoServidor = avisoServidorSinConfirmarIa(datos);
  const validacion = validarSeleccionModeloIa(sel);
  const elegido = validacion.ok ? validacion.modelo : null;
  const cambio = hayCambioModeloIa(datos, elegido);
  // La nota del ELEGIDO solo cuando es un cambio: si es el mismo que está en
  // uso, su tarifa/aviso ya se lee arriba (no se repite).
  const notaElegido = cambio ? notaModeloIa(elegido) : null;
  const esOtro = sel.opcion === OPCION_OTRO_MODELO_IA;
  const errorOtro = errorCampoOtroModeloIa(validacion, otroTocado);

  const pedirConfirmacion = (c: ConfirmacionModeloIa) => {
    setConfirmacion(c);
    setAbierto(true);
  };

  const confirmar = () => {
    if (!abierto || !confirmacion) return;
    const modelo = confirmacion.tipo === "guardar" ? confirmacion.modelo : null;
    startTransition(async () => {
      const res = await setModeloIaAction(modelo);
      setAbierto(false);
      if (res.ok && res.data) {
        toast.success(textoGuardadoModeloIa(res.data));
        if (res.data.aviso) toast.warning(res.data.aviso);
        router.refresh();
      } else {
        toast.error(res.error ?? mensajeErrorModeloIa({ code: res.code }));
      }
    });
  };

  // Textos del diálogo desde la ÚLTIMA confirmación pedida (no se borra al cerrar).
  const textos = confirmacion ? textosConfirmacionModeloIa(confirmacion, datos) : null;

  return (
    <Card data-modelo-ia="ok">
      <CardHeader className="pb-2">
        <TituloModeloIa />
        <CardDescription>{DESCRIPCION_MODELO_IA}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-muted-foreground">Modelo en uso:</span>
            <span className="font-medium" data-modelo-en-uso>
              {enUso.modelo}
            </span>
            <Badge variant={datos.configurado ? "secondary" : "outline"}>{enUso.marca}</Badge>
          </p>
          {ultimoCambio && <p className="text-xs text-muted-foreground">{ultimoCambio}</p>}
          {notaEnUso && <NotaModelo nota={notaEnUso} cual="en-uso" />}
          {avisoServidor && (
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <ExclamationTriangleIcon className="mt-px h-3.5 w-3.5 shrink-0" />
              {avisoServidor}
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={ETIQUETA_SELECTOR_MODELO_IA}>
            <SearchableSelect
              options={OPCIONES}
              value={sel.opcion || null}
              onChange={(v) => {
                setSel((s) => ({ opcion: v, otro: v === OPCION_OTRO_MODELO_IA ? s.otro : "" }));
                setOtroTocado(false);
              }}
              placeholder="Elige un modelo"
              searchPlaceholder="Buscar modelo…"
              disabled={pendiente}
            />
          </Field>
          {esOtro && (
            <Field label="Id del modelo" error={errorOtro ?? undefined}>
              <Input
                value={sel.otro}
                onChange={(e) => setSel({ opcion: OPCION_OTRO_MODELO_IA, otro: e.target.value })}
                onBlur={() => setOtroTocado(true)}
                placeholder="claude-…"
                autoComplete="off"
                spellCheck={false}
                maxLength={90}
                disabled={pendiente}
              />
            </Field>
          )}
        </div>

        {notaElegido && <NotaModelo nota={notaElegido} cual="elegido" />}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => elegido && pedirConfirmacion({ tipo: "guardar", modelo: elegido })}
            disabled={!cambio || pendiente}
          >
            {pendiente ? "Guardando…" : ETIQUETA_GUARDAR_MODELO_IA}
          </Button>
          {datos.configurado && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => pedirConfirmacion({ tipo: "servidor" })}
              disabled={pendiente}
            >
              {ETIQUETA_VOLVER_SERVIDOR_IA}
            </Button>
          )}
        </div>
      </CardContent>

      {textos && (
        <AlertDialog open={abierto} onOpenChange={(o) => !o && !pendiente && setAbierto(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{textos.titulo}</AlertDialogTitle>
              <AlertDialogDescription>
                {textos.texto}
                {textos.aviso && (
                  <span
                    data-aviso-confirmacion
                    className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-800 dark:text-amber-200"
                  >
                    <ExclamationTriangleIcon className="mt-px h-3.5 w-3.5 shrink-0" />
                    {textos.aviso}
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  confirmar();
                }}
                disabled={pendiente}
              >
                {pendiente ? "Guardando…" : textos.accion}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  );
}
