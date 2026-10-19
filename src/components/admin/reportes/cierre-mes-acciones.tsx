"use client";

/**
 * Botones «Cerrar <mes>» y «Reabrir mes» de la card del cierre formal
 * (16-oct-2026, API 0.0.88) con sus diálogos de confirmación (regla
 * permanente: toda acción que cambia el estado del dinero confirma).
 *
 * «Cerrar»: al ABRIR pide la previa (lectura pesada: dos repartos + el
 * pre-cierre) y la pinta: bloqueantes, los vuelos que pasarán al mes
 * siguiente (folio · cliente · avión · venta · cobrado al corte · por cobrar
 * al corte · cobrado después con su fecha), los totales y el reparto
 * antes/después por avión. Exige
 * la casilla «Entiendo que … quedará bloqueado» y manda `vuelos_esperados`
 * (los ids que se vieron): si el API responde `PREVIA_CAMBIO`, el diálogo se
 * repinta con la previa nueva y hay que volver a confirmar. Cualquier otro
 * rechazo: el `message` del API tal cual.
 *
 * «Reabrir» (solo ADMIN): motivo 5–300 + confirmación con lo que regresa.
 *
 * Ningún número se calcula aquí: todo viene del API (`lib/admin/cierre-mes.ts`
 * solo arma textos y elige qué mostrar).
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExclamationTriangleIcon, LockClosedIcon, LockOpenIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { fmtMonto } from "@/lib/format";
import { fmtDate } from "@/lib/datetime";
import { ANCLA_PRE_CIERRE } from "@/lib/admin/pre-cierre-resolver";
import { textoConteoPreCierre } from "@/lib/admin/pre-cierre-items";
import {
  ETIQUETA_BOTON_REABRIR,
  ETIQUETA_CARGANDO_PREVIA,
  ETIQUETA_CONFIRMAR_CERRAR,
  ETIQUETA_CONFIRMAR_REABRIR,
  MOTIVO_REABRIR_MAX,
  TEXTO_PREVIA_CAMBIO,
  TITULO_BLOQUEANTE_SIN_VERIFICAR,
  decidirRespuestaCerrar,
  deltasReparto,
  etiquetaBotonCerrar,
  mensajeErrorCierre,
  mesEnMinuscula,
  porCobrarYaSeCobro,
  puedeConfirmarCierre,
  resumenPrevia,
  textoCheckboxCerrar,
  textoCobradoPosterior,
  textoConfirmacionReabrir,
  textoDescripcionCerrar,
  textoNoCerrableDePrevia,
  textoToastCerrado,
  textoToastReabierto,
  tituloVuelosQuePasan,
  tituloVuelosQueVienen,
  ultimoDiaCorto,
  validarMotivoReabrir,
} from "@/lib/admin/cierre-mes";
import { sumarMeses } from "@/lib/admin/reparto-pagos";
import {
  cerrarMesAction,
  previaCierreAction,
  reabrirMesAction,
  type ActionResult,
} from "@/app/admin/reportes/actions";
import type {
  BloqueantePrevia,
  PreviaCierre,
  ResultadoCerrarMes,
  ResultadoReabrirMes,
  VueloDiferido,
} from "@/types/cierres";

const PREVIA_SIN_RESPUESTA =
  "No se pudo revisar el mes: el servidor no respondió. Cierra este cuadro y vuelve a abrirlo para reintentar.";
/** La server action no contestó (Vercel 504, deploy en curso…): el POST pudo aplicarse. */
const sinRespuesta = <T,>(): ActionResult<T> => ({ ok: false, code: "SIN_CONEXION" });

export function CierreMesAcciones({
  mes,
  cerrado,
  ofreceCerrar,
  ofreceReabrir,
  motivoNoCerrable,
  nDiferidos,
}: {
  mes: string;
  cerrado: boolean;
  ofreceCerrar: boolean;
  ofreceReabrir: boolean;
  /** Texto de por qué no se puede cerrar (orden / mes en curso); null = se puede intentar. */
  motivoNoCerrable: string | null;
  /** Vuelos que pasaron al mes siguiente con el cierre vigente (de `totales`). */
  nDiferidos: number | null;
}) {
  const [abrirCerrar, setAbrirCerrar] = useState(false);
  const [abrirReabrir, setAbrirReabrir] = useState(false);
  if (!ofreceCerrar && !ofreceReabrir) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ofreceCerrar && !cerrado && (
        <>
          <Button
            type="button"
            size="sm"
            className="cursor-pointer"
            disabled={!!motivoNoCerrable}
            title={motivoNoCerrable ?? undefined}
            onClick={() => setAbrirCerrar(true)}
          >
            <LockClosedIcon className="h-4 w-4" aria-hidden />
            {etiquetaBotonCerrar(mes)}
          </Button>
          {motivoNoCerrable && <span className="text-xs text-muted-foreground">{motivoNoCerrable}</span>}
          {abrirCerrar && <DialogoCerrar mes={mes} open={abrirCerrar} onOpenChange={setAbrirCerrar} />}
        </>
      )}
      {ofreceReabrir && cerrado && (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="cursor-pointer"
            onClick={() => setAbrirReabrir(true)}
          >
            <LockOpenIcon className="h-4 w-4" aria-hidden />
            {ETIQUETA_BOTON_REABRIR}
          </Button>
          {abrirReabrir && (
            <DialogoReabrir mes={mes} nDiferidos={nDiferidos} open={abrirReabrir} onOpenChange={setAbrirReabrir} />
          )}
        </>
      )}
    </div>
  );
}

// =============================================================================
// «Cerrar <mes>»
// =============================================================================

type EstadoPrevia =
  | { tipo: "cargando" }
  | { tipo: "error"; texto: string }
  | { tipo: "ok"; previa: PreviaCierre; cambio: boolean };

function DialogoCerrar({
  mes,
  open,
  onOpenChange,
}: {
  mes: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoPrevia>({ tipo: "cargando" });
  const [entiendo, setEntiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enviandoRef = useRef(false);
  const refrescarAlCerrar = useRef(false);

  // La previa se pide al montar (el diálogo se monta al abrir y se desmonta
  // al cerrar: cada apertura relee).
  useEffect(() => {
    let vivo = true;
    void previaCierreAction(mes)
      .catch(() => ({ ok: false as const, error: PREVIA_SIN_RESPUESTA, data: undefined }))
      .then((r) => {
        if (!vivo) return;
        if (r.ok && r.data) setEstado({ tipo: "ok", previa: r.data, cambio: false });
        else setEstado({ tipo: "error", texto: r.error || PREVIA_SIN_RESPUESTA });
      });
    return () => {
      vivo = false;
    };
  }, [mes]);

  const cambiarAbierto = (v: boolean) => {
    if (!v && enviandoRef.current) return;
    if (!v && refrescarAlCerrar.current) {
      refrescarAlCerrar.current = false;
      router.refresh();
    }
    onOpenChange(v);
  };

  const previa = estado.tipo === "ok" ? estado.previa : null;
  const destino = sumarMeses(mes, 1) ?? mes;
  const bloqueado = !puedeConfirmarCierre(previa, true);
  const puedeConfirmar = puedeConfirmarCierre(previa, entiendo);

  const cerrar = () => {
    if (!previa || !puedeConfirmar || enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true);
    setError(null);
    void cerrarMesAction(
      mes,
      previa.vuelos_que_pasan.map((v) => v.id),
    )
      .catch(sinRespuesta<ResultadoCerrarMes>)
      .then((r) => {
        enviandoRef.current = false;
        setEnviando(false);
        const d = decidirRespuestaCerrar(r, mes);
        if (d.tipo === "exito") {
          toast.success(textoToastCerrado(mes, d.diferidos, destino));
          refrescarAlCerrar.current = false;
          onOpenChange(false);
          router.refresh();
          return;
        }
        // Lo de la pantalla ya está viejo (o el cierre pudo aplicarse sin
        // respuesta): se refresca al cerrar el diálogo.
        refrescarAlCerrar.current = true;
        if (d.tipo === "previa_nueva") {
          setEstado({ tipo: "ok", previa: d.previa, cambio: true });
          setEntiendo(false);
          return;
        }
        setError(d.texto);
      });
  };

  return (
    <AlertDialog open={open} onOpenChange={cambiarAbierto}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto data-[size=default]:sm:max-w-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{`${etiquetaBotonCerrar(mes)}`}</AlertDialogTitle>
          <AlertDialogDescription>
            {textoDescripcionCerrar(mes, destino)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {estado.tipo === "cargando" && (
          <p className="text-sm text-muted-foreground" role="status">
            {ETIQUETA_CARGANDO_PREVIA}
          </p>
        )}
        {estado.tipo === "error" && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {estado.texto}
          </p>
        )}

        {previa && (
          <div className="space-y-3 text-sm">
            {estado.tipo === "ok" && estado.cambio && (
              <p role="status" className="rounded-lg border border-amber-400/50 bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {TEXTO_PREVIA_CAMBIO}
              </p>
            )}
            <p className="text-muted-foreground" data-resumen-previa>
              {resumenPrevia(previa)}
            </p>

            {previa.motivo_no_cerrable &&
              (previa.motivo_no_cerrable !== "PRECIERRE_NO_LISTO" || previa.bloqueantes.length === 0) && (
              <p role="alert" className="flex items-start gap-1.5 text-destructive">
                <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {textoNoCerrableDePrevia(previa)}
              </p>
            )}

            {previa.bloqueantes.length > 0 && (
              <div className="rounded-lg border border-amber-400/50 p-3" data-bloqueantes>
                <p className="font-medium">Pendientes que impiden cerrar</p>
                <ListaBloqueantesPrevia bloqueantes={previa.bloqueantes} />
                <a
                  href={`#${ANCLA_PRE_CIERRE}`}
                  onClick={() => cambiarAbierto(false)}
                  className="mt-2 inline-block cursor-pointer text-xs font-medium underline underline-offset-2"
                >
                  Resolver en el pre-cierre →
                </a>
              </div>
            )}

            <TablaVuelos
              titulo={tituloVuelosQuePasan(destino)}
              vacio={`Ningún vuelo pasa a ${mesEnMinuscula(destino)}: todo lo completado está cobrado al ${ultimoDiaCorto(mes)}.`}
              vuelos={previa.vuelos_que_pasan}
              corte={ultimoDiaCorto(mes)}
            />

            {previa.vuelos_que_vienen.length > 0 && (
              <TablaVuelos
                titulo={tituloVuelosQueVienen(previa.vuelos_que_vienen[0]?.origen || (sumarMeses(mes, -1) ?? mes))}
                vacio=""
                vuelos={previa.vuelos_que_vienen}
                corte={ultimoDiaCorto(mes)}
                informativo
              />
            )}

            <RepartoAntesDespues previa={previa} />

            {!bloqueado && (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 cursor-pointer"
                  checked={entiendo}
                  onChange={(e) => setEntiendo(e.target.checked)}
                  disabled={enviando}
                />
                <span>{textoCheckboxCerrar(mes)}</span>
              </label>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer" disabled={enviando}>
            Cancelar
          </AlertDialogCancel>
          <Button
            type="button"
            className="cursor-pointer"
            disabled={!puedeConfirmar || enviando}
            onClick={cerrar}
          >
            <LockClosedIcon className="h-4 w-4" aria-hidden />
            {enviando ? "Cerrando…" : ETIQUETA_CONFIRMAR_CERRAR}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Los bloqueantes de la previa del cierre. Un renglón que el API no pudo leer
 * (`lectura_fallida`, API 0.0.95) llega con `count: 0` y se pinta «sin
 * verificar» con la MISMA regla del pre-cierre (`textoConteoPreCierre`):
 * «Gastos por pagar sin confirmar · 0» bloqueando el cierre no se entendía.
 */
export function ListaBloqueantesPrevia({ bloqueantes }: { bloqueantes: readonly BloqueantePrevia[] }) {
  return (
    <ul className="mt-1 space-y-0.5 text-xs">
      {bloqueantes.map((b) => {
        const sinVerificar = b.lectura_fallida === true;
        return (
          <li key={b.clave} className="flex flex-wrap items-baseline justify-between gap-2">
            <span>
              {b.titulo}{" "}
              <span
                className="font-semibold text-amber-600"
                title={sinVerificar ? TITULO_BLOQUEANTE_SIN_VERIFICAR : undefined}
                data-sin-verificar={sinVerificar ? "" : undefined}
              >
                · {textoConteoPreCierre(b)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function TablaVuelos({
  titulo,
  vacio,
  vuelos,
  corte,
  informativo = false,
}: {
  titulo: string;
  vacio: string;
  vuelos: VueloDiferido[];
  corte: string;
  informativo?: boolean;
}) {
  return (
    <div className="space-y-1" data-vuelos-cierre={informativo ? "vienen" : "pasan"}>
      <p className="font-medium">
        {titulo} <span className="text-muted-foreground">· {vuelos.length}</span>
      </p>
      {vuelos.length === 0 ? (
        <p className="text-xs text-muted-foreground">{vacio}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-left font-medium">Folio</th>
                <th className="px-2 py-1 text-left font-medium">Cliente</th>
                <th className="px-2 py-1 text-left font-medium">Avión</th>
                <th className="px-2 py-1 text-left font-medium">Fecha</th>
                <th className="px-2 py-1 text-right font-medium">Venta</th>
                {/* «Vienen»: los montos son los del CIERRE de su mes de origen
                    (bitácora del API), no los de este corte. */}
                <th className="px-2 py-1 text-right font-medium">
                  {informativo ? "Cobrado al cerrar su mes" : `Cobrado al ${corte}`}
                </th>
                <th className="px-2 py-1 text-right font-medium">
                  {informativo ? "Por cobrar entonces" : `Por cobrar al ${corte}`}
                </th>
                {!informativo && <th className="px-2 py-1 text-right font-medium">Cobrado después</th>}
              </tr>
            </thead>
            <tbody>
              {vuelos.map((v) => (
                <tr key={v.id} className="border-t border-border" title={v.leyenda}>
                  <td className="px-2 py-1 font-mono">
                    <a href={`/admin/flights/${v.id}`} className="cursor-pointer underline underline-offset-2">
                      {v.folio != null && v.folio > 0 ? `#${v.folio}` : "vuelo"}
                    </a>
                  </td>
                  <td className="max-w-40 truncate px-2 py-1">{v.cliente ?? "—"}</td>
                  <td className="px-2 py-1 font-mono">{v.aeronave?.matricula ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-1">{v.fecha_vuelo ? fmtDate(v.fecha_vuelo) : "—"}</td>
                  <td className="px-2 py-1 text-right font-mono">{fmtMonto(v.venta_usd, "USD")}</td>
                  <td className="px-2 py-1 text-right font-mono">{fmtMonto(v.cobrado_usd, "USD")}</td>
                  {/* Caso #351: ya cobrado después ⇒ gris (el ámbar se leía «se debe»). */}
                  <td
                    className={`px-2 py-1 text-right font-mono ${
                      porCobrarYaSeCobro(v) ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {fmtMonto(v.por_cobrar_usd, "USD")}
                  </td>
                  {!informativo && (
                    <td className="whitespace-nowrap px-2 py-1 text-right font-mono">{textoCobradoPosterior(v)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RepartoAntesDespues({ previa }: { previa: PreviaCierre }) {
  if (!previa.reparto) {
    return previa.vuelos_que_pasan.length > 0 ? (
      <p className="text-xs text-muted-foreground">
        No se pudo calcular el reparto antes/después; el cierre usa el cálculo del servidor al confirmar.
      </p>
    ) : null;
  }
  const deltas = deltasReparto(previa.reparto);
  if (deltas.length === 0) return null;
  return (
    <div className="space-y-1" data-reparto-antes-despues>
      <p className="font-medium">Saldo del reparto por avión</p>
      <ul className="space-y-0.5 text-xs">
        {deltas.map((d) => (
          <li key={d.matricula} className="font-mono">
            {d.matricula}: {fmtMonto(d.antes, "USD")} → {fmtMonto(d.despues, "USD")}{" "}
            <span className={d.delta < 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}>
              ({d.delta > 0 ? "+" : ""}
              {fmtMonto(d.delta, "USD")})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// =============================================================================
// «Reabrir mes»
// =============================================================================

function DialogoReabrir({
  mes,
  nDiferidos,
  open,
  onOpenChange,
}: {
  mes: string;
  nDiferidos: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enviandoRef = useRef(false);
  const refrescarAlCerrar = useRef(false);
  const invalido = validarMotivoReabrir(motivo);

  const cambiarAbierto = (v: boolean) => {
    if (!v && enviandoRef.current) return;
    if (!v && refrescarAlCerrar.current) {
      refrescarAlCerrar.current = false;
      router.refresh();
    }
    onOpenChange(v);
  };

  const reabrir = () => {
    if (invalido || enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true);
    setError(null);
    void reabrirMesAction(mes, motivo)
      .catch(sinRespuesta<ResultadoReabrirMes>)
      .then((r) => {
        enviandoRef.current = false;
        setEnviando(false);
        if (r.ok && r.data) {
          toast.success(textoToastReabierto(mes, r.data.revertidos ?? 0));
          refrescarAlCerrar.current = false;
          onOpenChange(false);
          router.refresh();
          return;
        }
        // NO_ESTA_CERRADO / MES_SIGUIENTE_CERRADO / sin respuesta: la card
        // está vieja ⇒ se refresca al cerrar el diálogo.
        refrescarAlCerrar.current = true;
        setError(mensajeErrorCierre(r, "reabrir", mes));
      });
  };

  return (
    <AlertDialog open={open} onOpenChange={cambiarAbierto}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{`¿Reabrir ${mesEnMinuscula(mes)}?`}</AlertDialogTitle>
          <AlertDialogDescription>{textoConfirmacionReabrir(mes, nDiferidos)}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="motivo-reabrir" className="text-xs font-medium">
            Motivo
          </Label>
          <Textarea
            id="motivo-reabrir"
            value={motivo}
            maxLength={MOTIVO_REABRIR_MAX}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej.: corregir el tipo de cambio de un cobro"
            disabled={enviando}
          />
          {motivo.length > 0 && invalido && <p className="text-xs text-destructive">{invalido}</p>}
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer" disabled={enviando}>
            Cancelar
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            className="cursor-pointer"
            disabled={!!invalido || enviando}
            onClick={reabrir}
          >
            <LockOpenIcon className="h-4 w-4" aria-hidden />
            {enviando ? "Reabriendo…" : ETIQUETA_CONFIRMAR_REABRIR}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
