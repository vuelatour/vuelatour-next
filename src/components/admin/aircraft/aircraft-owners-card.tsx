"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  closeOwnerAction,
  createOwnerAction,
  deleteOwnerAction,
  updateOwnerAction,
} from "@/app/admin/aircraft/actions";
import { SocioSelector } from "@/components/admin/aircraft/socio-selector";
import { MSG_SERVIDOR_NO_RESPONDIO } from "@/lib/admin/errores-tecnicos";
import {
  AYUDA_QUITAR_BORRAR,
  AYUDA_QUITAR_CERRAR,
  DESCRIPCION_VENTANA_PROPIETARIOS,
  ETIQUETA_AGREGAR_PROPIETARIO,
  ETIQUETA_BORRAR_HISTORIAL,
  ETIQUETA_CONFIRMAR_GUARDAR,
  ETIQUETA_DESHACER_QUITAR,
  ETIQUETA_EDITAR_PROPIETARIOS,
  ETIQUETA_GUARDANDO_PROPIETARIOS,
  ETIQUETA_GUARDAR_PROPIETARIOS,
  ETIQUETA_QUITAR,
  ETIQUETA_QUITAR_FECHA_FIN,
  ETIQUETA_REVISAR,
  ETIQUETA_ULTIMO_DIA,
  OPCION_QUITAR_BORRAR,
  OPCION_QUITAR_CERRAR,
  TEXTO_BORRAR_ANTERIOR,
  TEXTO_HISTORIAL_NO_CARGO,
  TEXTO_SIN_CAMBIOS_PROPIETARIOS,
  TEXTO_SIN_PROPIETARIOS,
  TEXTO_USUARIOS_NO_CARGARON,
  TITULO_CONFIRMAR_GUARDAR,
  TITULO_EDITAR_PROPIETARIOS,
  TITULO_VENTANA_PROPIETARIOS,
  alertaSumaCard,
  descripcionPaso,
  descripcionSocio,
  errorUltimoDia,
  estadoSuma,
  filaNueva,
  filasDeVigentes,
  lineaVigencia,
  planPideConfirmacion,
  planPropietarios,
  propietariosAnteriores,
  sugerenciaUltimoDia,
  sumaDeFilas,
  textoAnteriores,
  textoConfirmarBorrados,
  textoConfirmarMenosDeCien,
  textoGuardadoParcial,
  textoPorcentaje,
  textoResumenPropietarios,
  textoSugerenciaUltimoDia,
  textoSuma,
  tituloBorrarAnterior,
  tituloQuitar,
  toastAnteriorBorrado,
  toastPropietariosGuardados,
  validarFilas,
  vigenciasDeAnteriores,
  type FilaPropietario,
  type PasoPlan,
  type UsuarioOpcion,
} from "@/lib/admin/propietarios";
import { cn } from "@/lib/utils";
import type { AircraftOwner } from "@/types/aircraft";

interface Props {
  aircraftId: string;
  /** Los VIGENTES hoy (del snapshot del avión). */
  owners: AircraftOwner[];
  /** TODOS los regímenes (`?history=true`); null = no se pudo leer. */
  historial: AircraftOwner[] | null;
  /** Todos los usuarios (cualquier estado); null = no cargaron. */
  usuarios: UsuarioOpcion[] | null;
  /** Hoy en Cancún (`YYYY-MM-DD`). */
  hoy: string;
  /** ADMIN: «Editar propietarios» y «Borrar del historial». */
  puedeEditar: boolean;
  /** ADMIN: «＋ Nuevo socio…» dentro del selector. */
  puedeCrearSocio: boolean;
}

const CLASE_SUMA: Record<ReturnType<typeof estadoSuma>, string> = {
  CIEN: "text-emerald-600 dark:text-emerald-400",
  MENOS: "text-amber-600 dark:text-amber-400",
  MAS: "text-destructive dark:text-red-400",
};

/**
 * Propietarios del avión (19-oct-2026, API 0.0.97). La card SOLO lee; todo
 * cambio (agregar, quitar, corregir porcentajes y fechas, dar de alta un
 * socio) vive en la ventana «Editar propietarios». Las reglas y los textos
 * salen de `lib/admin/propietarios.ts`; el 100 % por día lo decide el API
 * (400 `PROPIETARIO_SUMA_EXCEDE`) y aquí solo se anticipa.
 */
export function AircraftOwnersCard({
  aircraftId,
  owners,
  historial,
  usuarios,
  hoy,
  puedeEditar,
  puedeCrearSocio,
}: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [borrando, setBorrando] = useState<AircraftOwner | null>(null);
  const [pending, startTransition] = useTransition();

  const total = useMemo(() => sumaDeFilas(filasDeVigentes(owners)), [owners]);
  const estado = estadoSuma(total);
  const alerta = alertaSumaCard(total, owners.length, puedeEditar);
  const anteriores = useMemo(
    () => (historial ? propietariosAnteriores(historial, hoy) : []),
    [historial, hoy],
  );

  const confirmarBorrado = () => {
    if (!borrando) return;
    const o = borrando;
    startTransition(async () => {
      const res = await deleteOwnerAction(aircraftId, o.id).catch(() => ({
        ok: false as const,
        error: MSG_SERVIDOR_NO_RESPONDIO,
      }));
      if (res.ok) {
        toast.success(toastAnteriorBorrado(o.usuario?.nombre ?? "El propietario"));
        setBorrando(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo borrar");
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base flex items-center gap-2">
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
            Propietarios actuales
          </CardTitle>
          <CardDescription>
            <span className={owners.length > 0 && estado !== "CIEN" ? CLASE_SUMA[estado] : undefined}>
              {textoResumenPropietarios(owners.length, total)}
            </span>
          </CardDescription>
        </div>
        {puedeEditar && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 shrink-0 cursor-pointer"
            onClick={() => setAbierto(true)}
            title={TITULO_EDITAR_PROPIETARIOS}
          >
            <PencilSquareIcon className="h-3.5 w-3.5" />
            {ETIQUETA_EDITAR_PROPIETARIOS}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {alerta && (
          <p role="alert" className={cn("text-xs", CLASE_SUMA[estado])}>
            {alerta}
          </p>
        )}
        {owners.length === 0 ? (
          <p className="text-sm text-muted-foreground">{TEXTO_SIN_PROPIETARIOS}</p>
        ) : (
          owners.map((o) => (
            <div
              key={o.id}
              data-propietario={o.id}
              className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{o.usuario?.nombre ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {o.usuario ? descripcionSocio(o.usuario) : "Socio"} · {lineaVigencia(o, hoy)}
                </p>
              </div>
              <Badge className="bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30 font-mono shrink-0">
                {textoPorcentaje(Number(o.porcentaje))}
              </Badge>
            </div>
          ))
        )}

        {historial === null ? (
          <p className="text-xs text-muted-foreground">{TEXTO_HISTORIAL_NO_CARGO}</p>
        ) : anteriores.length > 0 ? (
          <details className="group text-sm">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              {textoAnteriores(anteriores.length)}
            </summary>
            <div className="mt-2 space-y-2">
              {anteriores.map((o) => (
                <div
                  key={o.id}
                  data-propietario-anterior={o.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm truncate">{o.usuario?.nombre ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {textoPorcentaje(Number(o.porcentaje))} · {lineaVigencia(o, hoy)}
                    </p>
                  </div>
                  {puedeEditar && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 shrink-0 cursor-pointer gap-1 text-destructive"
                      onClick={() => setBorrando(o)}
                      title={TEXTO_BORRAR_ANTERIOR}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                      {ETIQUETA_BORRAR_HISTORIAL}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </CardContent>

      {abierto && (
        <EditarPropietariosDialog
          aircraftId={aircraftId}
          owners={owners}
          anteriores={anteriores}
          usuarios={usuarios}
          hoy={hoy}
          puedeCrearSocio={puedeCrearSocio}
          onClose={() => setAbierto(false)}
        />
      )}

      <AlertDialog open={!!borrando} onOpenChange={(v) => !v && !pending && setBorrando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tituloBorrarAnterior(borrando?.usuario?.nombre ?? "este propietario")}
            </AlertDialogTitle>
            <AlertDialogDescription>{TEXTO_BORRAR_ANTERIOR}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending} className="cursor-pointer">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmarBorrado();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90 cursor-pointer"
            >
              {pending ? "Borrando…" : ETIQUETA_BORRAR_HISTORIAL}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// =============================================================================
// La ventana «Editar propietarios»
// =============================================================================

interface DialogProps {
  aircraftId: string;
  owners: AircraftOwner[];
  anteriores: AircraftOwner[];
  usuarios: UsuarioOpcion[] | null;
  hoy: string;
  puedeCrearSocio: boolean;
  onClose: () => void;
}

interface Confirmacion {
  plan: PasoPlan[];
  total: number;
}

function errorDe(res: { error?: string; fieldErrors?: Record<string, string[]> }): string {
  if (res.error) return res.error;
  const f = res.fieldErrors ? Object.keys(res.fieldErrors)[0] : undefined;
  if (f && res.fieldErrors) return `${f}: ${res.fieldErrors[f]?.[0] ?? "validación"}`;
  return "Error desconocido";
}

function EditarPropietariosDialog({
  aircraftId,
  owners,
  anteriores,
  usuarios,
  hoy,
  puedeCrearSocio,
  onClose,
}: DialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Se arma UNA vez por apertura (el componente se monta al abrir): un
  // `router.refresh()` a media edición no pisa lo capturado.
  const [filas, setFilas] = useState<FilaPropietario[]>(() => filasDeVigentes(owners));
  const [usuariosLocal, setUsuariosLocal] = useState<UsuarioOpcion[]>(() => usuarios ?? []);
  const [confirmar, setConfirmar] = useState<Confirmacion | null>(null);
  const [nuevas, setNuevas] = useState(0);

  const nombres = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of [...owners, ...anteriores]) {
      if (o.usuario?.nombre) m.set(o.socio_id, o.usuario.nombre);
    }
    for (const u of usuariosLocal) m.set(u.id, u.nombre);
    return m;
  }, [owners, anteriores, usuariosLocal]);
  const extras = useMemo(() => vigenciasDeAnteriores(anteriores), [anteriores]);
  const errores = useMemo(() => validarFilas(filas, nombres, extras), [filas, nombres, extras]);
  const total = sumaDeFilas(filas);
  const estado = estadoSuma(total);

  const cambiar = (clave: string, patch: Partial<FilaPropietario>) =>
    setFilas((prev) => prev.map((f) => (f.clave === clave ? { ...f, ...patch } : f)));

  const agregarUsuario = (u: UsuarioOpcion) =>
    setUsuariosLocal((prev) => (prev.some((x) => x.id === u.id) ? prev : [...prev, u]));

  const quitar = (fila: FilaPropietario) => {
    if (fila.id === null) {
      setFilas((prev) => prev.filter((f) => f.clave !== fila.clave));
      return;
    }
    const s = sugerenciaUltimoDia(fila, filas, hoy, nombres);
    cambiar(fila.clave, { quitar: { modo: "cerrar", hasta: s.dia } });
  };

  const correrPaso = (p: PasoPlan) => {
    switch (p.tipo) {
      case "borrar":
        return deleteOwnerAction(aircraftId, p.id);
      case "cerrar":
        return closeOwnerAction(aircraftId, p.id, p.hasta);
      case "actualizar":
        return updateOwnerAction(aircraftId, p.id, p.patch);
      case "crear":
        return createOwnerAction(aircraftId, p.alta);
    }
  };

  const ejecutar = (plan: PasoPlan[]) => {
    setConfirmar(null);
    startTransition(async () => {
      let hechos = 0;
      for (const paso of plan) {
        const res = await correrPaso(paso).catch(() => ({
          ok: false as const,
          error: MSG_SERVIDOR_NO_RESPONDIO,
        }));
        if (!res.ok) {
          // Lo ya aplicado queda guardado: se dice y se repinta lo real.
          toast.error(textoGuardadoParcial(hechos, plan.length, paso, errorDe(res)), {
            duration: 15000,
          });
          onClose();
          router.refresh();
          return;
        }
        hechos += 1;
      }
      toast.success(toastPropietariosGuardados(plan.length));
      onClose();
      router.refresh();
    });
  };

  const guardar = () => {
    if (pending) return;
    const primera = Object.values(errores.porFila)[0];
    if (primera) {
      toast.error(primera);
      return;
    }
    if (errores.general) {
      toast.error(errores.general);
      return;
    }
    const plan = planPropietarios(filas, owners, nombres);
    if (plan.length === 0) {
      toast.info(TEXTO_SIN_CAMBIOS_PROPIETARIOS);
      onClose();
      return;
    }
    if (planPideConfirmacion(plan, total)) {
      setConfirmar({ plan, total });
      return;
    }
    ejecutar(plan);
  };

  const borrados = confirmar
    ? confirmar.plan.filter((p) => p.tipo === "borrar").map((p) => p.nombre)
    : [];

  return (
    <Dialog open onOpenChange={(v) => !v && !pending && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{TITULO_VENTANA_PROPIETARIOS}</DialogTitle>
          <DialogDescription>{DESCRIPCION_VENTANA_PROPIETARIOS}</DialogDescription>
        </DialogHeader>

        {usuarios === null && (
          <p role="alert" className="text-xs text-amber-600 dark:text-amber-400">
            {TEXTO_USUARIOS_NO_CARGARON}
          </p>
        )}

        <div className="space-y-3" data-filas-propietarios>
          {filas.map((fila) => {
            const nombre = nombres.get(fila.socio_id) ?? "Este propietario";
            const error = errores.porFila[fila.clave];
            if (fila.quitar) {
              const s = sugerenciaUltimoDia(fila, filas, hoy, nombres);
              const modo = fila.quitar.modo;
              const hasta = fila.quitar.modo === "cerrar" ? fila.quitar.hasta : "";
              const errHasta = modo === "cerrar" ? errorUltimoDia(fila, hasta, nombre) : null;
              return (
                <div
                  key={fila.clave}
                  data-fila-quitar={fila.clave}
                  className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{tituloQuitar(nombre)}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 cursor-pointer"
                      onClick={() => cambiar(fila.clave, { quitar: null })}
                    >
                      {ETIQUETA_DESHACER_QUITAR}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2" role="group" aria-label={tituloQuitar(nombre)}>
                    <Button
                      type="button"
                      size="sm"
                      variant={modo === "cerrar" ? "default" : "outline"}
                      aria-pressed={modo === "cerrar"}
                      className="cursor-pointer"
                      title={AYUDA_QUITAR_CERRAR}
                      onClick={() => cambiar(fila.clave, { quitar: { modo: "cerrar", hasta: s.dia } })}
                    >
                      {OPCION_QUITAR_CERRAR}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={modo === "borrar" ? "destructive" : "outline"}
                      aria-pressed={modo === "borrar"}
                      className="cursor-pointer"
                      title={AYUDA_QUITAR_BORRAR}
                      onClick={() => cambiar(fila.clave, { quitar: { modo: "borrar" } })}
                    >
                      {OPCION_QUITAR_BORRAR}
                    </Button>
                  </div>
                  {modo === "cerrar" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor={`${fila.clave}-hasta`} className="text-xs font-medium">
                        {ETIQUETA_ULTIMO_DIA}
                      </Label>
                      <Input
                        id={`${fila.clave}-hasta`}
                        type="date"
                        className="w-44 cursor-pointer"
                        value={hasta}
                        min={fila.vigente_desde}
                        aria-invalid={errHasta ? true : undefined}
                        onChange={(e) =>
                          cambiar(fila.clave, { quitar: { modo: "cerrar", hasta: e.target.value } })
                        }
                      />
                      <p
                        role={errHasta ? "alert" : undefined}
                        className={cn("text-xs", errHasta ? "text-destructive" : "text-muted-foreground")}
                      >
                        {errHasta ?? `${AYUDA_QUITAR_CERRAR} ${textoSugerenciaUltimoDia(s)}`}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-destructive">{AYUDA_QUITAR_BORRAR}</p>
                  )}
                </div>
              );
            }
            return (
              <div key={fila.clave} data-fila-propietario={fila.clave} className="space-y-1.5">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_10rem_auto] sm:items-end">
                  <div className="space-y-1">
                    <Label htmlFor={`${fila.clave}-socio`} className="text-xs font-medium">
                      Socio
                    </Label>
                    <SocioSelector
                      id={`${fila.clave}-socio`}
                      value={fila.socio_id}
                      onChange={(v) => cambiar(fila.clave, { socio_id: v })}
                      usuarios={usuariosLocal}
                      onUsuarioNuevo={agregarUsuario}
                      puedeCrear={puedeCrearSocio}
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${fila.clave}-pct`} className="text-xs font-medium">
                      %
                    </Label>
                    <Input
                      id={`${fila.clave}-pct`}
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      min={0.001}
                      max={100}
                      placeholder="50"
                      value={fila.porcentaje}
                      aria-invalid={error ? true : undefined}
                      disabled={pending}
                      onChange={(e) => cambiar(fila.clave, { porcentaje: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${fila.clave}-desde`} className="text-xs font-medium">
                      Desde
                    </Label>
                    <Input
                      id={`${fila.clave}-desde`}
                      type="date"
                      className="cursor-pointer"
                      value={fila.vigente_desde}
                      disabled={pending}
                      onChange={(e) => cambiar(fila.clave, { vigente_desde: e.target.value })}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-9 cursor-pointer gap-1 text-destructive"
                    onClick={() => quitar(fila)}
                    disabled={pending}
                    title={fila.id === null ? "Quitar esta fila" : "Dejó de ser propietario o se agregó por error"}
                  >
                    <XMarkIcon className="h-4 w-4" />
                    {ETIQUETA_QUITAR}
                  </Button>
                </div>
                {fila.vigente_hasta !== "" && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Label htmlFor={`${fila.clave}-fin`} className="text-xs font-medium">
                      {ETIQUETA_ULTIMO_DIA}
                    </Label>
                    <Input
                      id={`${fila.clave}-fin`}
                      type="date"
                      className="h-8 w-40 cursor-pointer"
                      value={fila.vigente_hasta}
                      min={fila.vigente_desde}
                      disabled={pending}
                      onChange={(e) => cambiar(fila.clave, { vigente_hasta: e.target.value })}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 cursor-pointer"
                      onClick={() => cambiar(fila.clave, { vigente_hasta: "" })}
                      disabled={pending}
                    >
                      {ETIQUETA_QUITAR_FECHA_FIN}
                    </Button>
                  </div>
                )}
                {error && (
                  <p role="alert" className="text-xs text-destructive">
                    {error}
                  </p>
                )}
              </div>
            );
          })}

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="cursor-pointer gap-1.5"
            disabled={pending}
            onClick={() => {
              setFilas((prev) => [...prev, filaNueva(hoy, nuevas + 1)]);
              setNuevas((n) => n + 1);
            }}
          >
            <PlusIcon className="h-3.5 w-3.5" />
            {ETIQUETA_AGREGAR_PROPIETARIO}
          </Button>
        </div>

        <p data-suma-propietarios className={cn("text-sm font-medium", CLASE_SUMA[estado])}>
          {textoSuma(total)}
        </p>
        {errores.general && (
          <p role="alert" className="text-xs text-destructive">
            {errores.general}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" className="cursor-pointer" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" className="cursor-pointer" onClick={guardar} disabled={pending}>
            {pending ? ETIQUETA_GUARDANDO_PROPIETARIOS : ETIQUETA_GUARDAR_PROPIETARIOS}
          </Button>
        </DialogFooter>

        {/* Confirmación DENTRO del popup: Base UI la anida (Esc cierra solo esta). */}
        <AlertDialog open={!!confirmar} onOpenChange={(v) => !v && setConfirmar(null)}>
          <AlertDialogContent backdropForceRender>
            <AlertDialogHeader>
              <AlertDialogTitle>{TITULO_CONFIRMAR_GUARDAR}</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <span className="block">Esto es lo que cambia:</span>
                <span className="block">
                  {confirmar?.plan.map((p, i) => (
                    <span key={i} className="block">
                      · {descripcionPaso(p)}
                    </span>
                  ))}
                </span>
                {borrados.length > 0 && (
                  <span className="block text-destructive">{textoConfirmarBorrados(borrados)}</span>
                )}
                {confirmar && estadoSuma(confirmar.total) === "MENOS" && (
                  <span className="block text-amber-600 dark:text-amber-400">
                    {textoConfirmarMenosDeCien(confirmar.total)}
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="cursor-pointer">{ETIQUETA_REVISAR}</AlertDialogCancel>
              <AlertDialogAction
                className={cn("cursor-pointer", borrados.length > 0 && "bg-destructive text-white hover:bg-destructive/90")}
                onClick={(e) => {
                  e.preventDefault();
                  if (confirmar) ejecutar(confirmar.plan);
                }}
              >
                {ETIQUETA_CONFIRMAR_GUARDAR}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
