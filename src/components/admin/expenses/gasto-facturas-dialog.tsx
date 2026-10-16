"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowTopRightOnSquareIcon,
  DocumentArrowUpIcon,
  EyeIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
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
import {
  quitarFacturaDeGastoAction,
  subirFacturasGastoAction,
} from "@/app/admin/expenses/actions";
import { BotonAbrirFirmado, VisorPdf } from "@/components/admin/visor-archivo";
import { useFacturasDeGasto, type CargaFacturas } from "@/components/admin/expenses/use-facturas-gasto";
import { llamarSinLanzar } from "@/lib/admin/reparto-gasto";
import { nombreCorto } from "@/lib/admin/comprobante-hojas";
import {
  ACCEPT_FACTURAS,
  AYUDA_SUBIR_FACTURAS,
  AYUDA_SUBIR_UNA_FACTURA,
  BOTON_SEPARAR,
  BOTON_AGREGAR_ARCHIVOS,
  BOTON_ELEGIR_ARCHIVOS,
  BOTON_QUITAR_DE_GASTO,
  BOTON_SUBIR_FACTURAS,
  BOTON_VER_AQUI,
  CODIGO_API_SIN_VARIAS,
  MAX_BYTES_ARCHIVO_FACTURA,
  TEXTO_API_SIN_VARIAS,
  TEXTO_CARGANDO_FACTURAS,
  TEXTO_ERROR_FACTURAS,
  TEXTO_LEGADO_PARCIAL,
  TEXTO_LEGADO_YA_TIENE,
  TEXTO_POR_PISTA,
  TEXTO_REVISA_LISTA,
  TEXTO_SIN_FACTURAS,
  TITULO_FACTURAS_DIALOGO,
  TITULO_QUITAR_FACTURA,
  TITULO_REEMPLAZAR_FACTURA,
  archivosDeGrupos,
  combinarResultados,
  decidirSubida,
  detalleFactura,
  emparejarArchivosFactura,
  etiquetaFactura,
  nFacturasDeFila,
  nombreDeGrupo,
  partirEnLotes,
  pistasDeXmlCfdi,
  textoContenidoGrupo,
  textoFalloLotes,
  textoQuitarFactura,
  textoResultadoSubida,
  textoSeAgregan,
  tipoArchivoFactura,
  tituloSeccionFacturas,
  type ArchivoFacturaEntrada,
  type FacturaDeGasto,
  type GrupoFactura,
  type ResultadoSubidaFacturas,
} from "@/lib/admin/facturas-gasto";
import type { Gasto } from "@/types/expenses";

const nombresDe = (lote: readonly GrupoFactura<File>[]) =>
  lote.map((g) => nombreDeGrupo(g) ?? "archivo");

/**
 * «Facturas de este gasto» (16-oct-2026, API 0.0.86): la lista de las
 * facturas que lo amparan (Ver aquí / PDF / XML / Quitar de este gasto) y
 * UN selector de archivos `multiple` que acepta PDF y XML juntos: se
 * emparejan por nombre (`lib/admin/facturas-gasto.ts`), se ve la lista
 * previa y se suben en lotes que caben en Vercel. Las nuevas se AGREGAN.
 *
 * Con el API 0.0.85 (sin `archivos`): solo UNA factura por envío y, si el
 * gasto ya tiene una, el aviso de que la reemplaza (es lo que hace ese API).
 *
 * Las actions no revalidan: al CERRAR, si algo cambió, `router.refresh()`.
 */
export function GastoFacturasDialog({
  gasto,
  open,
  onOpenChange,
  onCambio,
}: {
  gasto: Gasto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Avisa a quien lo abrió (p. ej. «Verificar / editar») que la lista cambió. */
  onCambio?: () => void;
}) {
  const router = useRouter();
  const { carga, recargar, marcarApiPrevio } = useFacturasDeGasto(gasto.id, open);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [pistas, setPistas] = useState<Map<File, string[]>>(() => new Map());
  const [separados, setSeparados] = useState<Set<File>>(() => new Set());
  // Espejos de la selección para los manejadores ASÍNCRONOS (leer los XML,
  // subir): con el `archivos` del cierre, dos selecciones seguidas o una ✕
  // durante la lectura se perdían (revisión adversaria). Toda escritura de
  // la selección pasa por `fijarArchivos`.
  const archivosRef = useRef<File[]>([]);
  const pistasRef = useRef<Map<File, string[]>>(new Map());
  const separadosRef = useRef<Set<File>>(new Set());
  const [leyendo, setLeyendo] = useState(0);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [aQuitar, setAQuitar] = useState<FacturaDeGasto | null>(null);
  const [quitando, setQuitando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  // Con el API previo y una factura ya amarrada, subir otra la REEMPLAZA:
  // eso confirma (regla del cliente: lo destructivo pregunta).
  const [confirmarReemplazo, setConfirmarReemplazo] = useState(false);
  const huboCambio = useRef(false);
  const abiertoRef = useRef(open);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    abiertoRef.current = open;
  }, [open]);

  const { grupos } = useMemo(
    () =>
      emparejarArchivosFactura(archivos, {
        pistas: (f) => pistas.get(f) ?? [],
        separados: (f) => separados.has(f),
      }),
    [archivos, pistas, separados],
  );
  const listo = carga.fase === "listo";
  const decision = decidirSubida({ varias: carga.varias, nGrupos: grupos.length });
  const nYaTiene = listo ? carga.facturas.length : nFacturasDeFila(gasto);
  const ocupado = subiendo !== null || quitando;
  // Solo con la lista CARGADA se sabe si el API agrega o reemplaza: subir
  // antes (o con la carga fallida) reemplazaba sin preguntar con el API
  // previo (revisión adversaria).
  const puedeSubir = listo && leyendo === 0 && !ocupado && grupos.length > 0 && decision.ok;
  const reemplaza = carga.varias === false && nYaTiene > 0;

  const fijarArchivos = (calcular: (prev: File[]) => File[]) => {
    const sig = calcular(archivosRef.current);
    archivosRef.current = sig;
    setArchivos(sig);
  };

  /** Si el diálogo ya se cerró cuando terminó algo que cambió datos. */
  const refrescarSiCerrado = () => {
    if (!abiertoRef.current && huboCambio.current) {
      huboCambio.current = false;
      router.refresh();
    }
  };

  const cerrar = () => {
    if (ocupado) return;
    onOpenChange(false);
    fijarArchivos(() => []);
    pistasRef.current = new Map();
    setPistas(pistasRef.current);
    separadosRef.current = new Set();
    setSeparados(separadosRef.current);
    setFallo(null);
    if (huboCambio.current) {
      huboCambio.current = false;
      router.refresh();
    }
  };

  const agregar = async (nuevos: File[]) => {
    if (nuevos.length === 0) return;
    setLeyendo((n) => n + 1);
    try {
      // Pistas del XML (UUID/folio) para emparejarlo con un PDF de otro nombre.
      await Promise.all(
        nuevos
          .filter((f) => tipoArchivoFactura(f) === "XML" && f.size > 0 && f.size <= MAX_BYTES_ARCHIVO_FACTURA)
          .map(async (f) => {
            try {
              const p = pistasDeXmlCfdi(await f.text());
              pistasRef.current = new Map(pistasRef.current).set(f, p);
            } catch {
              /* sin pistas: se empareja por nombre */
            }
          }),
      );
    } finally {
      setLeyendo((n) => n - 1);
    }
    setPistas(pistasRef.current);
    const r = emparejarArchivosFactura([...archivosRef.current, ...nuevos], {
      pistas: (f) => pistasRef.current.get(f) ?? [],
      separados: (f) => separadosRef.current.has(f),
    });
    if (r.mensaje) toast.error(r.mensaje);
    fijarArchivos(() => archivosDeGrupos(r.grupos));
    setFallo(null);
  };

  const quitarGrupo = (g: GrupoFactura<File>) =>
    fijarArchivos((prev) => prev.filter((f) => f !== g.pdf && f !== g.xml));

  /** «Separar»: ese XML deja de emparejarse con el PDF que no es suyo. */
  const separar = (g: GrupoFactura<File>) => {
    if (!g.xml) return;
    separadosRef.current = new Set(separadosRef.current).add(g.xml);
    setSeparados(separadosRef.current);
  };

  const subir = async (reemplazoConfirmado = false) => {
    if (!puedeSubir) {
      if (!decision.ok) toast.error(decision.mensaje);
      return;
    }
    if (reemplaza && !reemplazoConfirmado) {
      setConfirmarReemplazo(true);
      return;
    }
    setConfirmarReemplazo(false);
    setFallo(null);
    // El shape de siempre (que REEMPLAZA con el API previo) solo se vale si
    // el gasto no tiene factura o el operador lo confirmó.
    const permitirLegado = nYaTiene === 0 || reemplazoConfirmado;
    const lotes = partirEnLotes(grupos);
    // Import diferido: ese módulo carga el cliente de Supabase del navegador,
    // que exige sus variables al CARGAR (y este diálogo vive dentro de
    // «Verificar / editar», que se renderiza en pruebas sin ellas).
    let fileToBase64: (f: File) => Promise<string>;
    try {
      ({ fileToBase64 } = await import("@/lib/storage/documentos-flota"));
    } catch {
      toast.error("No se pudo preparar la subida. Recarga la página e inténtalo de nuevo.");
      return;
    }
    const resultados: ResultadoSubidaFacturas[] = [];
    const subidos = new Set<File>();
    const fallos: string[] = [];
    // ¿Algún lote pudo haber escrito a medias? (red, 5xx, 504 de Vercel: el
    // API no es atómico por lote) ⇒ se recarga la lista y se pide revisarla.
    let enDuda = false;
    // API previo: «rechazó» (no subió nada) o «subió una con el shape de
    // siempre y se paró» (la siguiente la reemplazaría).
    let apiPrevio: "rechazo" | "parcial" | null = null;
    for (const [i, lote] of lotes.entries()) {
      setSubiendo(lotes.length > 1 ? `Subiendo ${i + 1} de ${lotes.length}…` : "Subiendo…");
      let entrada: ArchivoFacturaEntrada[];
      try {
        entrada = await Promise.all(
          lote.map(async (g) => ({
            ...(g.xml ? { xml_b64: await fileToBase64(g.xml) } : {}),
            ...(g.pdf ? { pdf_b64: await fileToBase64(g.pdf) } : {}),
            nombre: nombreDeGrupo(g),
          })),
        );
      } catch {
        fallos.push(textoFalloLotes(nombresDe(lote), "no se pudo leer el archivo; vuelve a elegirlo"));
        continue;
      }
      const r = await llamarSinLanzar(() =>
        subirFacturasGastoAction({ gastoId: gasto.id, archivos: entrada, permitirLegado }),
      );
      if (!r.ok) {
        enDuda = true;
        fallos.push(textoFalloLotes(nombresDe(lote), r.error));
        continue;
      }
      if (!r.valor.ok || !r.valor.data) {
        if (r.valor.code === CODIGO_API_SIN_VARIAS) {
          apiPrevio = resultados.length > 0 ? "parcial" : "rechazo";
          break;
        }
        // Un 4xx es rechazo limpio (no escribió); lo demás puede ser a medias.
        if (!(typeof r.valor.status === "number" && r.valor.status < 500)) enDuda = true;
        fallos.push(textoFalloLotes(nombresDe(lote), r.valor.error ?? "el servidor no respondió"));
        continue;
      }
      resultados.push(r.valor.data);
      for (const g of lote) {
        if (g.pdf) subidos.add(g.pdf);
        if (g.xml) subidos.add(g.xml);
      }
      // API previo (shape de siempre): la siguiente REEMPLAZARÍA a esta. Alto.
      if (r.valor.data.modo === "LEGADO" && i < lotes.length - 1) {
        apiPrevio = "parcial";
        break;
      }
    }
    setSubiendo(null);
    fijarArchivos((prev) => prev.filter((f) => !subidos.has(f)));
    if (apiPrevio) marcarApiPrevio();
    if (resultados.length > 0 || enDuda) {
      huboCambio.current = true;
      recargar();
      onCambio?.();
    }
    if (resultados.length > 0) {
      const c = combinarResultados(resultados);
      toast.success(textoResultadoSubida({ ...c, reemplazo: c.legado && nYaTiene > 0 }));
    }
    const mensajes = [
      ...(apiPrevio === "rechazo" ? [TEXTO_API_SIN_VARIAS] : []),
      ...(apiPrevio === "parcial" ? [TEXTO_LEGADO_PARCIAL] : []),
      ...fallos,
      ...(enDuda ? [TEXTO_REVISA_LISTA] : []),
    ];
    if (mensajes.length > 0) {
      setFallo(mensajes.join(" "));
      toast.error(mensajes[0]);
    }
    refrescarSiCerrado();
  };

  const confirmarQuitar = async () => {
    const f = aQuitar;
    if (!f) return;
    setQuitando(true);
    const r = await llamarSinLanzar(() =>
      quitarFacturaDeGastoAction({ facturaId: f.id, gastoId: gasto.id }),
    );
    setQuitando(false);
    if (!r.ok || !r.valor.ok) {
      toast.error((r.ok ? r.valor.error : r.error) || "No se pudo quitar la factura");
      // Otra persona ya la quitó o cambió las facturas (404/409): la lista
      // está vieja; se cierra la confirmación y se recarga.
      if (r.ok && (r.valor.status === 404 || r.valor.status === 409)) {
        setAQuitar(null);
        recargar();
      }
      return;
    }
    setAQuitar(null);
    huboCambio.current = true;
    toast.success("Factura quitada de este gasto. Sigue en Facturas recibidas.");
    recargar();
    onCambio?.();
    refrescarSiCerrado();
  };

  // Avisos NO bloqueantes del API (Σ facturas vs monto, ámbar): los del
  // detalle, que se recarga tras subir o quitar.
  const avisos = carga.avisos;
  const varias = carga.varias === true;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : cerrar())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-facturas-gasto>
        <DialogHeader>
          <DialogTitle>{TITULO_FACTURAS_DIALOGO}</DialogTitle>
          <DialogDescription>
            Las facturas quedan en Facturas recibidas y amparan este gasto, que pasa a 🟢
            Facturada.
            {varias && " Puedes subir varias (por ejemplo, las 5 de una carga de ASA)."}
          </DialogDescription>
        </DialogHeader>

        <ListaFacturas
          carga={carga}
          onReintentar={recargar}
          onQuitar={varias ? setAQuitar : undefined}
          deshabilitado={ocupado}
        />

        {avisos.length > 0 && <AvisosAmbar avisos={avisos} />}

        {/* Subir: UN selector para PDF y XML juntos. */}
        <div
          className={
            "space-y-2 rounded-lg border border-dashed p-3 text-sm transition-colors " +
            (arrastrando ? "border-brand-500 bg-brand-500/5" : "border-border")
          }
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            if (!ocupado) void agregar(Array.from(e.dataTransfer.files ?? []));
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium">{varias ? BOTON_SUBIR_FACTURAS : "Subir factura"}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={() => inputRef.current?.click()}
              disabled={ocupado}
            >
              <DocumentArrowUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {archivos.length > 0 ? BOTON_AGREGAR_ARCHIVOS : BOTON_ELEGIR_ARCHIVOS}
            </Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_FACTURAS}
            className="hidden"
            onChange={(e) => {
              void agregar(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            {carga.varias === false ? AYUDA_SUBIR_UNA_FACTURA : AYUDA_SUBIR_FACTURAS}
          </p>
          {reemplaza ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
              {TEXTO_LEGADO_YA_TIENE}
            </p>
          ) : (
            varias &&
            textoSeAgregan(nYaTiene) && <p className="text-xs font-medium">{textoSeAgregan(nYaTiene)}</p>
          )}
          {grupos.length > 0 && (
            <ul className="space-y-1" data-lista-previa>
              {grupos.map((g, i) => (
                <li key={`${nombreDeGrupo(g)}-${i}`} className="flex items-start gap-2 text-xs">
                  <span className="w-16 shrink-0 text-muted-foreground">Factura {i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" title={[g.pdf?.name, g.xml?.name].filter(Boolean).join(" + ")}>
                      {nombreCorto(nombreDeGrupo(g) ?? "")}
                      {g.porPista && g.xml && <> + {nombreCorto(g.xml.name, 28)}</>}
                    </span>
                    <span className="text-muted-foreground">{textoContenidoGrupo(g)}</span>
                    {g.porPista && (
                      <span className="block text-amber-700 dark:text-amber-400">{TEXTO_POR_PISTA}</span>
                    )}
                  </span>
                  {g.porPista && (
                    <button
                      type="button"
                      onClick={() => separar(g)}
                      disabled={ocupado}
                      title="No son la misma factura: subirlas por separado"
                      className="cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] font-medium text-brand-600 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 dark:text-brand-400"
                    >
                      {BOTON_SEPARAR}
                    </button>
                  )}
                  <button
                    type="button"
                    title="Quitar de la lista"
                    aria-label={`Quitar ${nombreDeGrupo(g) ?? "archivo"} de la lista`}
                    onClick={() => quitarGrupo(g)}
                    disabled={ocupado}
                    className="cursor-pointer rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!decision.ok && grupos.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">{decision.mensaje}</p>
          )}
          {grupos.length > 0 && !listo && (
            <p className="text-xs text-muted-foreground">
              {carga.fase === "error"
                ? "Para subir, primero tienen que cargar las facturas que ya tiene el gasto (pulsa «Reintentar» arriba)."
                : "Espera a que carguen las facturas que ya tiene el gasto…"}
            </p>
          )}
          {fallo && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              {fallo}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={cerrar} disabled={ocupado}>
            Cerrar
          </Button>
          <Button onClick={() => void subir()} disabled={!puedeSubir}>
            {subiendo ??
              (leyendo > 0
                ? "Leyendo archivos…"
                : grupos.length > 1
                  ? `${BOTON_SUBIR_FACTURAS} (${grupos.length})`
                  : "Subir factura")}
          </Button>
        </DialogFooter>

        {/* Confirmaciones ANIDADAS dentro del popup (Base UI registra el
            anidado solo así) y con backdrop propio (AGENTS.md, «Confirmaciones
            de dinero anidadas»): Esc o un clic no cierran el diálogo de abajo. */}
        <AlertDialog open={confirmarReemplazo} onOpenChange={(o) => !o && setConfirmarReemplazo(false)}>
          <AlertDialogContent backdropForceRender>
            <AlertDialogHeader>
              <AlertDialogTitle>{TITULO_REEMPLAZAR_FACTURA}</AlertDialogTitle>
              <AlertDialogDescription>{TEXTO_LEGADO_YA_TIENE}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void subir(true);
                }}
              >
                Sí, reemplazar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={aQuitar !== null} onOpenChange={(o) => !o && !quitando && setAQuitar(null)}>
          <AlertDialogContent backdropForceRender>
            <AlertDialogHeader>
              <AlertDialogTitle>{TITULO_QUITAR_FACTURA}</AlertDialogTitle>
              <AlertDialogDescription>
                {aQuitar ? textoQuitarFactura(aQuitar, nYaTiene) : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={quitando}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void confirmarQuitar();
                }}
                disabled={quitando}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {quitando ? "Quitando…" : BOTON_QUITAR_DE_GASTO}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

/** Avisos NO bloqueantes (ámbar): la suma de las facturas vs el monto, etc. */
export function AvisosAmbar({ avisos }: { avisos: readonly string[] }) {
  return (
    <div
      className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
      role="status"
      data-avisos-facturas
    >
      {avisos.map((a) => (
        <p key={a}>{a}</p>
      ))}
    </div>
  );
}

/**
 * La lista de facturas con «Ver aquí» (visor incrustado del PDF), los
 * enlaces al PDF/XML (firma al clic) y, si se pasa `onQuitar`, «Quitar de
 * este gasto». La usan el diálogo de facturas y «Verificar / editar».
 */
export function ListaFacturas({
  carga,
  onReintentar,
  onQuitar,
  deshabilitado = false,
}: {
  carga: CargaFacturas;
  onReintentar: () => void;
  onQuitar?: (f: FacturaDeGasto) => void;
  deshabilitado?: boolean;
}) {
  const [visor, setVisor] = useState<string | null>(null);
  if (carga.fase === "error" && carga.facturas.length === 0) {
    return (
      <p className="text-xs text-destructive">
        {TEXTO_ERROR_FACTURAS}{" "}
        <button type="button" onClick={onReintentar} className="cursor-pointer font-medium underline underline-offset-2">
          Reintentar
        </button>
      </p>
    );
  }
  if (carga.fase === "cargando" && carga.facturas.length === 0) {
    return <p className="text-xs text-muted-foreground">{TEXTO_CARGANDO_FACTURAS}</p>;
  }
  if (carga.facturas.length === 0) {
    return <p className="text-xs text-muted-foreground">{TEXTO_SIN_FACTURAS}</p>;
  }
  const n = carga.facturas.length;
  const claseLink =
    "inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-brand-600 hover:bg-muted dark:text-brand-400";
  return (
    <ul className="space-y-1.5" data-lista-facturas>
      {carga.fase === "error" && (
        <li className="text-xs text-destructive">
          {TEXTO_ERROR_FACTURAS}{" "}
          <button type="button" onClick={onReintentar} className="cursor-pointer font-medium underline underline-offset-2">
            Reintentar
          </button>
        </li>
      )}
      {carga.facturas.map((f) => (
        <li key={f.id} className="rounded-lg border border-border px-2 py-1.5 text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" title={etiquetaFactura(f)}>
                {etiquetaFactura(f)}
                {f.principal && n > 1 && (
                  <span
                    className="ml-1.5 rounded-full border border-border px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
                    title="La del folio en Conciliación y en el Excel"
                  >
                    principal
                  </span>
                )}
              </p>
              <p className="truncate text-muted-foreground">{detalleFactura(f)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-0.5">
              {f.pdf_url && (
                <button
                  type="button"
                  onClick={() => setVisor((v) => (v === f.id ? null : f.id))}
                  className={claseLink}
                  aria-pressed={visor === f.id}
                  title="Ver el PDF aquí mismo"
                >
                  <EyeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {visor === f.id ? "Ocultar" : BOTON_VER_AQUI}
                </button>
              )}
              {f.pdf_url && (
                <BotonAbrirFirmado bucket="facturas" path={f.pdf_url} className={claseLink} title="Abrir el PDF en una pestaña nueva">
                  PDF
                  <ArrowTopRightOnSquareIcon className="h-3 w-3" aria-hidden="true" />
                </BotonAbrirFirmado>
              )}
              {f.xml_url && (
                <BotonAbrirFirmado bucket="facturas" path={f.xml_url} className={claseLink} title="Abrir el XML en una pestaña nueva">
                  XML
                  <ArrowTopRightOnSquareIcon className="h-3 w-3" aria-hidden="true" />
                </BotonAbrirFirmado>
              )}
              {onQuitar && (
                <button
                  type="button"
                  onClick={() => onQuitar(f)}
                  disabled={deshabilitado}
                  className="inline-flex h-7 cursor-pointer items-center rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                  title="Quitar esta factura de este gasto (no se borra del buzón)"
                >
                  {BOTON_QUITAR_DE_GASTO}
                </button>
              )}
            </div>
          </div>
          {visor === f.id && f.pdf_url && (
            <VisorPdf
              key={f.pdf_url}
              bucket="facturas"
              path={f.pdf_url}
              titulo={`Factura ${etiquetaFactura(f)}`}
              onCerrar={() => setVisor(null)}
              className="mt-1.5"
            />
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Bloque «Facturas del gasto (N)» de «Verificar / editar»: la lista con
 * «Ver aquí» y el botón «Subir facturas», que abre el MISMO diálogo de la
 * columna Facturación.
 */
export function FacturasDelGastoSeccion({ gasto, activo }: { gasto: Gasto; activo: boolean }) {
  const { carga, recargar } = useFacturasDeGasto(gasto.id, activo);
  const [abrir, setAbrir] = useState(false);
  const n = carga.fase === "listo" ? carga.facturas.length : nFacturasDeFila(gasto);
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs" data-facturas-del-gasto>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{tituloSeccionFacturas(n)}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          onClick={() => setAbrir(true)}
        >
          <DocumentArrowUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {BOTON_SUBIR_FACTURAS}
        </Button>
      </div>
      <ListaFacturas carga={carga} onReintentar={recargar} />
      {carga.avisos.length > 0 && <AvisosAmbar avisos={carga.avisos} />}
      <GastoFacturasDialog gasto={gasto} open={abrir} onOpenChange={setAbrir} onCambio={recargar} />
    </div>
  );
}
