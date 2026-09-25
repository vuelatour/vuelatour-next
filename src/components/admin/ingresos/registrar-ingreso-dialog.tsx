"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PaperClipIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import {
  gastosParaReembolsoAction,
  ligarAbonoCobroAction,
  vuelosCandidatosAction,
} from "@/app/admin/ingresos/actions";
import {
  motivoComprobanteIngresoInvalido,
  registrarIngreso,
  editarIngreso,
} from "@/lib/api/ingresos-browser";
import {
  CATEGORIAS_INGRESO,
  CATEGORIA_INGRESO_AYUDA,
  CATEGORIA_INGRESO_DESTINO,
  categoriaIngresoAdmiteVuelo,
  categoriaIngresoSumaAResultados,
  esAnticipo,
  etiquetaCategoriaIngreso,
  etiquetaIngreso,
} from "@/lib/admin/categorias-ingreso";
import {
  AVISO_ANTICIPO_VUELO,
  AVISO_OTRO_INGRESO_CLIENTE,
  ETIQUETA_EFECTIVO,
  HINT_TC_OFICIAL,
  VALOR_EFECTIVO,
  cambiosDeEdicion,
  candidatosDeConflicto,
  datosAltaDeFormulario,
  descripcionVueloCandidato,
  duplicadoDeConflicto,
  erroresFormularioIngreso,
  etiquetaCuentaIngreso,
  etiquetaVueloCandidato,
  fechaLegible,
  formularioDeIngreso,
  formularioDesdeAbono,
  formularioVacio,
  hayCambios,
  hayMasDatos,
  metodoDerivado,
  opcionCategoriaIngreso,
  opcionesMetodoIngreso,
  textoConfirmarDuplicado,
  type CandidatoCobroConflicto,
  type CuentaIngresoOpcion,
  type DuplicadoConflicto,
  type ErroresIngreso,
  type FormIngreso,
  type VueloCandidatoIngreso,
} from "@/lib/admin/ingresos-ui";
import { fmtMonto } from "@/lib/format";
import { fmtDateOnly, todayCancun } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type {
  AbonoPendiente,
  CategoriaIngreso,
  Ingreso,
  MetodoIngreso,
  MonedaIngreso,
} from "@/types/ingresos";

export interface CatalogosIngreso {
  cuentas: CuentaIngresoOpcion[];
  clientes: { id: string; nombre: string }[];
  aeronaves: { id: string; matricula: string }[];
}

export interface RegistrarIngresoDialogProps extends CatalogosIngreso {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edición: el ingreso vigente (sin él es un alta). */
  ingreso?: Ingreso | null;
  /** Alta DESDE un abono del banco («Registrar y conciliar»). */
  abono?: AbonoPendiente | null;
  /** «Es un anticipo»: la categoría viene fija. */
  forzarCategoria?: CategoriaIngreso | null;
  onGuardado?: (r: { ingreso: Ingreso; movimiento_id?: string | null }) => void;
}

/**
 * Alta y edición de un INGRESO (24-sep-2026). DIVULGACIÓN PROGRESIVA: a la
 * vista solo lo que todo operador sabe (categoría, fecha, concepto, monto,
 * dónde entró el dinero, cliente o quién pagó, comprobante); lo demás va en
 * «Más datos». El comprobante viaja del NAVEGADOR directo al API (tope de 4.5
 * MB de Vercel).
 *
 * Anti doble conteo: desde un abono la categoría llega VACÍA si el API no
 * sugiere una (jamás «Otros ingresos» por default) y el 409
 * ABONO_TIENE_COBRO_CANDIDATO ofrece ligar el abono al cobro del vuelo.
 */
export function RegistrarIngresoDialog(props: RegistrarIngresoDialogProps) {
  const { open, onOpenChange, ingreso, abono, forzarCategoria } = props;
  const titulo = ingreso
    ? `Editar ingreso ${etiquetaIngreso(ingreso.folio)}`
    : forzarCategoria === "ANTICIPO_CLIENTE"
      ? "Registrar anticipo de cliente"
      : abono
        ? "Registrar ingreso desde el banco"
        : "Registrar ingreso";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            {abono
              ? `Abono del ${fmtDateOnly(abono.fecha)} por ${fmtMonto(abono.monto, abono.cuenta_moneda ?? undefined)}${
                  abono.cuenta_alias ? ` en ${abono.cuenta_alias}` : ""
                }${abono.descripcion ? `: «${abono.descripcion}»` : ""}. Al guardar queda conciliado con esa línea del banco.`
              : ingreso
                ? "Corrige lo que haga falta. Si está conciliado con el banco, su dinero y su cuenta no cambian hasta desvincularlo."
                : "Dinero que entra y NO es el cobro de un vuelo: otros ingresos, anticipos de clientes, intereses del banco, reembolsos que te regresan, venta de activos o aportaciones. Los cobros de vuelos se registran en cada vuelo."}
          </DialogDescription>
        </DialogHeader>
        {/* El formulario se monta al abrir: cada apertura arranca limpia y con
            su propio client_request_id. */}
        {open && <FormularioIngreso {...props} onCerrar={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

/** Botón «Registrar ingreso» de la cabecera. */
export function RegistrarIngresoBoton(props: CatalogosIngreso) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Registrar ingreso
      </Button>
      <RegistrarIngresoDialog {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}

const CLASE_AVISO =
  "flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200";

/**
 * Errores del API cuyo campo vive en «Más datos» (plegado): al recibirlos se
 * despliega, si no el operador lee «Captura el tipo de cambio» sin ver dónde
 * (p. ej. 400 TC_REQUERIDO de un ingreso en USD sin T.C. oficial del día).
 */
const CODES_MAS_DATOS: ReadonlySet<string> = new Set([
  "TC_REQUERIDO",
  "COMISION_INVALIDA",
  "EFECTIVO_SIN_CUENTA",
  "VUELO_SOLO_EN_REEMBOLSO",
  "GASTO_SOLO_EN_REEMBOLSO",
  "VUELO_NO_EXISTE",
  "AERONAVE_NO_EXISTE",
  "GASTO_NO_EXISTE",
]);

function FormularioIngreso({
  ingreso,
  abono,
  forzarCategoria,
  cuentas,
  clientes,
  aeronaves,
  onGuardado,
  onCerrar,
}: RegistrarIngresoDialogProps & { onCerrar: () => void }) {
  const router = useRouter();
  const hoy = todayCancun();
  const modo: "alta" | "edicion" = ingreso ? "edicion" : "alta";
  const [form, setForm] = useState<FormIngreso>(() =>
    ingreso
      ? formularioDeIngreso(ingreso)
      : abono
        ? formularioDesdeAbono(abono, { forzarCategoria })
        : { ...formularioVacio(hoy), categoria: forzarCategoria ?? "" },
  );
  const [masDatos, setMasDatos] = useState(() => hayMasDatos(form));
  const [metodoTocado, setMetodoTocado] = useState(modo === "edicion");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [archivoError, setArchivoError] = useState<string | null>(null);
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [conflictoCobro, setConflictoCobro] = useState<{
    mensaje: string;
    candidatos: CandidatoCobroConflicto[];
  } | null>(null);
  const [conflictoDuplicado, setConflictoDuplicado] = useState<DuplicadoConflicto | null>(null);
  const [ligando, setLigando] = useState<string | null>(null);
  // El MISMO id en los reintentos de confirmación (409 → «de todos modos»):
  // si la primera llamada sí quedó, el API responde idempotente, no duplica.
  const [clientRequestId] = useState(() => crypto.randomUUID());
  const aceptados = useRef({ sinCobro: false, duplicado: false });
  const archivoRef = useRef<HTMLInputElement>(null);

  // Vuelo (solo reembolsos) y gasto relacionado: búsquedas a pedido.
  const [vueloQ, setVueloQ] = useState("");
  const [vuelos, setVuelos] = useState<VueloCandidatoIngreso[] | null>(null);
  const [buscandoVuelo, setBuscandoVuelo] = useState(false);
  const [vueloElegido, setVueloElegido] = useState<string | null>(
    ingreso?.vuelo_folio != null ? `Vuelo #${ingreso.vuelo_folio}` : null,
  );
  const [gastos, setGastos] = useState<Array<{ value: string; label: string; description?: string }> | null>(
    null,
  );

  const conciliado = ingreso?.conciliacion.estado === "CONCILIADO";
  const conAplicaciones = (ingreso?.anticipo?.aplicaciones_n ?? 0) > 0;
  const desdeAbono = !!abono;

  const cuentasActivas = useMemo(
    () => cuentas.filter((c) => c.activa || c.id === form.cuenta),
    [cuentas, form.cuenta],
  );
  const cuentaSel = cuentas.find((c) => c.id === form.cuenta) ?? null;
  const monedaCuenta: MonedaIngreso | null = desdeAbono
    ? (abono?.cuenta_moneda ?? null)
    : cuentaSel?.moneda ?? null;
  const errores: ErroresIngreso = intento
    ? erroresFormularioIngreso(form, { hoy, monedaCuenta })
    : {};

  const set = <K extends keyof FormIngreso>(k: K, v: FormIngreso[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const elegirCuenta = (valor: string) => {
    setForm((f) => {
      if (valor === VALOR_EFECTIVO) {
        return {
          ...f,
          cuenta: valor,
          metodo: metodoTocado && (f.metodo === "EFECTIVO" || f.metodo === "DOLARES") ? f.metodo : "EFECTIVO",
        };
      }
      const c = cuentas.find((x) => x.id === valor);
      return {
        ...f,
        cuenta: valor,
        moneda: c?.moneda ?? f.moneda,
        metodo: metodoTocado && f.metodo !== "EFECTIVO" && f.metodo !== "DOLARES" ? f.metodo : metodoDerivado(c),
      };
    });
  };

  const elegirCategoria = (valor: string) => {
    const cat = valor as CategoriaIngreso;
    setForm((f) => ({
      ...f,
      categoria: cat,
      // Un vuelo/gasto solo existe en un reembolso recibido: al cambiar de
      // categoría se sueltan (si no, el API respondería 400).
      vuelo_id: categoriaIngresoAdmiteVuelo(cat) ? f.vuelo_id : "",
      gasto_id: cat === "REEMBOLSO_DEVOLUCION" ? f.gasto_id : "",
    }));
    if (!categoriaIngresoAdmiteVuelo(cat)) setVueloElegido(null);
  };

  const opcionesCuenta = [
    ...cuentasActivas.map((c) => ({ value: c.id, label: etiquetaCuentaIngreso(c) })),
    { value: VALOR_EFECTIVO, label: ETIQUETA_EFECTIVO },
  ];

  const buscarVuelos = async () => {
    const q = vueloQ.trim();
    if (q.length < 2) {
      toast.error("Escribe el folio del vuelo o el nombre del cliente (2 letras o más).");
      return;
    }
    setBuscandoVuelo(true);
    const r = await vuelosCandidatosAction({ q, alcance: "todos" }).catch(() => null);
    setBuscandoVuelo(false);
    if (!r || !r.ok) {
      toast.error(r?.error ?? "No se pudieron buscar los vuelos.");
      return;
    }
    setVuelos(r.data ?? []);
  };

  const cargarGastos = () => {
    if (gastos !== null) return;
    setGastos([]);
    void gastosParaReembolsoAction()
      .then((r) => {
        const base = r.ok ? (r.data ?? []) : [];
        if (!r.ok) toast.error(r.error ?? "No se pudieron cargar los gastos.");
        if (form.gasto_id && !base.some((g) => g.value === form.gasto_id)) {
          base.unshift({ value: form.gasto_id, label: "Gasto ligado actualmente" });
        }
        setGastos(base);
      })
      .catch(() => setGastos([]));
  };

  const elegirArchivo = (f: File | null) => {
    if (!f) {
      setArchivo(null);
      setArchivoError(null);
      return;
    }
    const motivo = motivoComprobanteIngresoInvalido(f);
    setArchivoError(motivo);
    setArchivo(motivo ? null : f);
  };

  const guardar = async (flags: { sinCobro?: boolean; duplicado?: boolean } = {}) => {
    if (flags.sinCobro) aceptados.current.sinCobro = true;
    if (flags.duplicado) aceptados.current.duplicado = true;
    setIntento(true);
    setErrorGeneral(null);
    const errs = erroresFormularioIngreso(form, { hoy, monedaCuenta });
    if (Object.keys(errs).length > 0) {
      toast.error("Revisa los campos marcados en rojo.");
      if (errs.comision || errs.tc || errs.referencia || errs.notas || errs.vuelo_id || errs.metodo) {
        setMasDatos(true);
      }
      return;
    }
    setGuardando(true);
    try {
      if (modo === "alta") {
        const datos = datosAltaDeFormulario(form, {
          clientRequestId,
          movimientoId: abono?.id ?? null,
          aceptarSinCobro: aceptados.current.sinCobro,
          aceptarDuplicado: aceptados.current.duplicado,
        });
        // Desde un abono cuya cuenta el panel no conoce, el API toma la del abono.
        if (abono && !abono.cuenta_bancaria_id) delete datos.cuenta_bancaria_id;
        const r = await registrarIngreso(datos, archivo);
        if (r.ok) {
          const et = etiquetaIngreso(r.data.ingreso.folio);
          if (r.data.idempotente) {
            toast.info(`${et} ya estaba registrado: no se duplicó.`);
          } else {
            toast.success(
              r.data.movimiento_id
                ? `Ingreso ${et} registrado y conciliado con el abono`
                : `Ingreso ${et} registrado`,
            );
          }
          for (const a of r.data.avisos) toast.warning(a, { duration: 10_000 });
          onGuardado?.({ ingreso: r.data.ingreso, movimiento_id: r.data.movimiento_id });
          router.refresh();
          onCerrar();
          return;
        }
        if (r.code === "ABONO_TIENE_COBRO_CANDIDATO") {
          setConflictoCobro({
            mensaje: r.error.replace(/\s*El ingreso NO se guardó\.$/, ""),
            candidatos: candidatosDeConflicto(r.details),
          });
          return;
        }
        if (r.code === "ABONO_POSIBLE_DUPLICADO") {
          setConflictoDuplicado(duplicadoDeConflicto(r.details));
          return;
        }
        if (r.code && CODES_MAS_DATOS.has(r.code)) setMasDatos(true);
        setErrorGeneral(r.error);
        toast.error(r.error);
        return;
      }
      // Edición: solo lo que cambió + CAS.
      const cambios = cambiosDeEdicion(form, ingreso as Ingreso);
      if (!hayCambios(cambios) && !archivo) {
        toast.info("No hay cambios que guardar.");
        onCerrar();
        return;
      }
      const r = await editarIngreso((ingreso as Ingreso).id, cambios, archivo);
      if (r.ok) {
        toast.success(`${etiquetaIngreso(r.data.ingreso.folio)} actualizado`);
        for (const a of r.data.avisos) toast.warning(a, { duration: 10_000 });
        onGuardado?.({ ingreso: r.data.ingreso });
        router.refresh();
        onCerrar();
        return;
      }
      if (r.code === "CONFLICTO_VERSION") {
        toast.error(r.error, { description: "Se recargó con lo más reciente: vuelve a hacer el cambio." });
        router.refresh();
        onCerrar();
        return;
      }
      if (r.code && CODES_MAS_DATOS.has(r.code)) setMasDatos(true);
      setErrorGeneral(r.error);
      toast.error(r.error);
    } finally {
      setGuardando(false);
    }
  };

  const vincularAlCobro = async (c: CandidatoCobroConflicto) => {
    if (!abono) return;
    setLigando(c.id);
    const r = await ligarAbonoCobroAction(
      abono.id,
      c.tipo === "SOBRE_GRUPO" ? { cobro_grupo_id: c.id } : { cobro_id: c.id },
    ).catch(() => null);
    setLigando(null);
    if (r?.ok) {
      toast.success(`Abono conciliado con ${c.etiqueta}`);
      setConflictoCobro(null);
      router.refresh();
      onCerrar();
    } else {
      toast.error(r?.error ?? "No se pudo vincular el abono al cobro.");
    }
  };

  const cat = form.categoria || null;
  const esAnt = esAnticipo(cat);
  const esReembolso = cat === "REEMBOLSO_DEVOLUCION";
  const sinCuenta = form.cuenta === VALOR_EFECTIVO;
  const clientesOpciones = clientes.map((c) => ({ value: c.id, label: c.nombre }));
  const clienteNombre = clientes.find((c) => c.id === form.cliente_id)?.nombre ?? null;

  return (
    <>
      <div className="space-y-4">
        {/* ─────────── A la vista: lo que todo operador sabe ─────────── */}
        <Field
          label="Categoría"
          required
          error={errores.categoria}
          hint={
            cat ? (
              <>
                <span className="block text-green-600 dark:text-green-400">
                  Va a: {CATEGORIA_INGRESO_DESTINO[cat]}
                </span>
                <span className="block">{CATEGORIA_INGRESO_AYUDA[cat]}</span>
              </>
            ) : desdeAbono ? (
              // La sugerencia «Otros ingresos»/«Anticipo» NO se prellena (sería
              // el default que el contrato prohíbe): se DICE y se elige a mano.
              `${
                abono?.categoria_sugerida
                  ? `Sugerencia: «${etiquetaCategoriaIngreso(abono.categoria_sugerida)}» — elígela tú si es correcta. `
                  : ""
              }Elige qué es este dinero. Si es el pago de un vuelo, cancela y usa «Es el pago de un vuelo».`
            ) : undefined
          }
        >
          <SearchableSelect
            options={CATEGORIAS_INGRESO.map(opcionCategoriaIngreso)}
            value={form.categoria}
            onChange={elegirCategoria}
            placeholder="Elige la categoría"
            disabled={guardando || conAplicaciones || forzarCategoria === "ANTICIPO_CLIENTE"}
          />
        </Field>
        {conAplicaciones && (
          <p className="-mt-2 text-[11px] text-muted-foreground">
            Este anticipo ya se aplicó a vuelos: su categoría y su moneda no cambian hasta desaplicarlo.
          </p>
        )}

        {esAnt && (
          <div className={CLASE_AVISO}>
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{AVISO_ANTICIPO_VUELO}</span>
          </div>
        )}
        {cat === "OTRO_INGRESO" && form.cliente_id && (
          <div className={CLASE_AVISO}>
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{AVISO_OTRO_INGRESO_CLIENTE}</span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha en que entró el dinero" required error={errores.fecha}>
            <Input
              type="date"
              value={form.fecha}
              max={hoy}
              onChange={(e) => set("fecha", e.target.value)}
              disabled={guardando}
              className="cursor-pointer"
            />
          </Field>
          <Field
            label="¿Dónde entró el dinero?"
            required
            error={errores.cuenta}
            hint={
              conciliado
                ? "Está conciliado con el banco: la cuenta no cambia hasta desvincularlo."
                : sinCuenta
                  ? "Efectivo en mano: no se concilia con ningún estado de cuenta."
                  : undefined
            }
          >
            {desdeAbono ? (
              <Input
                value={
                  cuentaSel
                    ? etiquetaCuentaIngreso(cuentaSel)
                    : `${abono?.cuenta_alias ?? "Cuenta del abono"}${abono?.cuenta_moneda ? ` (${abono.cuenta_moneda})` : ""}`
                }
                disabled
                readOnly
              />
            ) : (
              <SearchableSelect
                options={opcionesCuenta}
                value={form.cuenta}
                onChange={elegirCuenta}
                placeholder="Cuenta de banco o efectivo"
                disabled={guardando || conciliado}
              />
            )}
          </Field>
        </div>

        <Field label="Concepto" required error={errores.descripcion}>
          <Input
            value={form.descripcion}
            onChange={(e) => set("descripcion", e.target.value)}
            placeholder={esAnt ? "Ej. Depósito para el vuelo a Holbox de octubre" : "Ej. Reembolso de la aseguradora por el parabrisas"}
            maxLength={300}
            disabled={guardando}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <Field
            label={esAnt ? "Monto que depositó el cliente" : "Monto recibido"}
            required
            error={errores.monto}
            hint={
              conciliado
                ? "Conciliado con el banco: el monto no cambia hasta desvincularlo."
                : conAplicaciones && ingreso?.anticipo
                  ? `Ya se aplicaron ${fmtMonto(ingreso.anticipo.aplicado, ingreso.moneda)}: no puede valer menos.`
                  : "El BRUTO: si el banco cobró comisión, anótala en «Más datos»."
            }
          >
            <Input
              inputMode="decimal"
              value={form.monto}
              onChange={(e) => set("monto", e.target.value)}
              placeholder="0.00"
              disabled={guardando || conciliado}
              className="font-mono"
            />
          </Field>
          <Field label="Moneda" required error={errores.moneda}>
            <SearchableSelect
              options={[
                { value: "MXN", label: "MXN (pesos)" },
                { value: "USD", label: "USD (dólares)" },
              ]}
              value={form.moneda}
              onChange={(v) => set("moneda", v as MonedaIngreso)}
              disabled={
                guardando || conciliado || conAplicaciones || desdeAbono || (!!cuentaSel && !sinCuenta)
              }
            />
          </Field>
        </div>

        {esAnt ? (
          <Field
            label="Cliente"
            required
            error={errores.cliente_id}
            hint="El anticipo queda a cuenta de este cliente; después lo aplicas a su vuelo."
          >
            <SearchableSelect
              options={clientesOpciones}
              value={form.cliente_id}
              onChange={(v) => set("cliente_id", v)}
              placeholder="Busca el cliente"
              disabled={guardando}
            />
          </Field>
        ) : (
          <Field
            label="Quién pagó"
            error={errores.pagador}
            hint={
              clienteNombre
                ? `Cliente ligado: ${clienteNombre} (se cambia en «Más datos»).`
                : "Opcional: aseguradora, banco, proveedor, socio…"
            }
          >
            <Input
              value={form.pagador}
              onChange={(e) => set("pagador", e.target.value)}
              placeholder="Ej. GNP Seguros"
              maxLength={200}
              disabled={guardando}
            />
          </Field>
        )}

        <Field
          label="Comprobante (foto o PDF, hasta 10 MB)"
          error={archivoError ?? undefined}
          hint={
            ingreso?.archivo && !archivo
              ? `Actual: ${ingreso.archivo.nombre}. Subir otro lo reemplaza (el anterior queda en el historial).`
              : "Opcional: ficha de depósito, captura de la transferencia, aviso del banco…"
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={archivoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => archivoRef.current?.click()}
              disabled={guardando}
            >
              <PaperClipIcon className="h-4 w-4" />
              {archivo ? "Cambiar archivo" : ingreso?.archivo ? "Reemplazar comprobante" : "Adjuntar comprobante"}
            </Button>
            {archivo && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                {archivo.name} · {(archivo.size / 1024 / 1024).toFixed(1)} MB
                <button
                  type="button"
                  className="cursor-pointer rounded p-0.5 hover:text-foreground"
                  title="Quitar este archivo"
                  onClick={() => {
                    elegirArchivo(null);
                    if (archivoRef.current) archivoRef.current.value = "";
                  }}
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </div>
        </Field>

        {/* ─────────── Más datos (plegable) ─────────── */}
        <div className="rounded-lg border border-border">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/40"
            onClick={() => setMasDatos((v) => !v)}
            aria-expanded={masDatos}
          >
            {masDatos ? (
              <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
            )}
            Más datos
            <span className="text-xs font-normal text-muted-foreground">
              comisión, tipo de cambio, método, {esReembolso ? "vuelo, gasto, " : ""}avión, referencia y notas
            </span>
          </button>
          {masDatos && (
            <div className="space-y-4 border-t border-border p-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Comisión del banco"
                  error={errores.comision}
                  hint="Lo que el banco o la pasarela se quedó. Neto = monto − comisión."
                >
                  <Input
                    inputMode="decimal"
                    value={form.comision}
                    onChange={(e) => set("comision", e.target.value)}
                    placeholder="0.00"
                    disabled={guardando || conciliado}
                    className="font-mono"
                  />
                </Field>
                {form.moneda === "USD" ? (
                  <Field
                    label="Tipo de cambio (USD → MXN)"
                    error={errores.tc}
                    hint={
                      categoriaIngresoSumaAResultados(cat)
                        ? HINT_TC_OFICIAL
                        : "Opcional (informativo): este dinero no suma a resultados."
                    }
                  >
                    <Input
                      inputMode="decimal"
                      step="0.000001"
                      value={form.tc}
                      onChange={(e) => set("tc", e.target.value)}
                      placeholder="Ej. 18.25"
                      disabled={guardando}
                      className="font-mono"
                    />
                  </Field>
                ) : (
                  <div />
                )}
              </div>
              <Field
                label="Método"
                error={errores.metodo}
                hint="Se deduce de dónde entró el dinero; cámbialo solo si fue distinto."
              >
                <SearchableSelect
                  options={opcionesMetodoIngreso(!sinCuenta)}
                  value={form.metodo}
                  onChange={(v) => {
                    setMetodoTocado(true);
                    set("metodo", v as MetodoIngreso);
                  }}
                  disabled={guardando}
                />
              </Field>

              {!esAnt && (
                <Field
                  label="Cliente (opcional)"
                  hint="Solo si el dinero viene de un cliente y NO es el pago de un vuelo."
                >
                  <SearchableSelect
                    options={[{ value: "", label: "Sin cliente" }, ...clientesOpciones]}
                    value={form.cliente_id}
                    onChange={(v) => set("cliente_id", v)}
                    placeholder="Sin cliente"
                    disabled={guardando}
                  />
                </Field>
              )}

              {esReembolso && (
                <Field
                  label="Vuelo relacionado (opcional)"
                  error={errores.vuelo_id}
                  hint="Solo como referencia (p. ej. el reembolso del seguro por un daño en ese vuelo). No suma al vuelo."
                >
                  <div className="space-y-2">
                    {vueloElegido && form.vuelo_id ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs">
                        {vueloElegido}
                        <button
                          type="button"
                          className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground"
                          title="Quitar el vuelo"
                          onClick={() => {
                            set("vuelo_id", "");
                            setVueloElegido(null);
                          }}
                        >
                          <XMarkIcon className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          value={vueloQ}
                          onChange={(e) => setVueloQ(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void buscarVuelos();
                            }
                          }}
                          placeholder="Folio o cliente del vuelo"
                          disabled={guardando}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1"
                          onClick={() => void buscarVuelos()}
                          disabled={buscandoVuelo || guardando}
                        >
                          <MagnifyingGlassIcon className="h-4 w-4" />
                          {buscandoVuelo ? "Buscando…" : "Buscar"}
                        </Button>
                      </div>
                    )}
                    {!form.vuelo_id && vuelos && (
                      <div className="max-h-40 space-y-1 overflow-y-auto">
                        {vuelos.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Ningún vuelo con esa búsqueda.</p>
                        ) : (
                          vuelos.map((v) => (
                            <button
                              key={v.vuelo_id}
                              type="button"
                              className="block w-full cursor-pointer rounded-md border border-border px-2 py-1 text-left text-xs hover:bg-muted/50"
                              onClick={() => {
                                set("vuelo_id", v.vuelo_id);
                                setVueloElegido(`Vuelo #${v.folio ?? "—"}`);
                              }}
                            >
                              <span className="font-medium">{etiquetaVueloCandidato(v)}</span>
                              <span className="block text-muted-foreground">{descripcionVueloCandidato(v)}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </Field>
              )}

              {esReembolso && (
                <Field
                  label="Gasto relacionado (opcional)"
                  hint="El gasto que este dinero te regresa (p. ej. la reparación que pagó la aseguradora). Queda como referencia."
                >
                  {gastos === null ? (
                    <Button type="button" variant="outline" size="sm" onClick={cargarGastos}>
                      {form.gasto_id ? "Cambiar el gasto ligado" : "Elegir un gasto"}
                    </Button>
                  ) : (
                    <SearchableSelect
                      options={[{ value: "", label: "Sin gasto relacionado" }, ...gastos]}
                      value={form.gasto_id}
                      onChange={(v) => set("gasto_id", v)}
                      placeholder={gastos.length === 0 ? "Cargando gastos…" : "Busca el gasto"}
                      disabled={guardando}
                    />
                  )}
                </Field>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Avión (opcional)" hint="Solo referencia: el dinero va a VuelaTour.">
                  <SearchableSelect
                    options={[
                      { value: "", label: "Sin avión" },
                      ...aeronaves.map((a) => ({ value: a.id, label: a.matricula })),
                    ]}
                    value={form.aeronave_id}
                    onChange={(v) => set("aeronave_id", v)}
                    placeholder="Sin avión"
                    disabled={guardando}
                  />
                </Field>
                <Field label="Referencia del banco" error={errores.referencia}>
                  <Input
                    value={form.referencia}
                    onChange={(e) => set("referencia", e.target.value)}
                    maxLength={120}
                    placeholder="Clave de rastreo, folio…"
                    disabled={guardando}
                  />
                </Field>
              </div>
              <Field label="Notas" error={errores.notas}>
                <Textarea
                  value={form.notas}
                  onChange={(e) => set("notas", e.target.value)}
                  rows={2}
                  maxLength={1000}
                  disabled={guardando}
                />
              </Field>
            </div>
          )}
        </div>

        {errorGeneral && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorGeneral}</span>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </Button>
        <Button onClick={() => void guardar()} disabled={guardando}>
          {guardando
            ? "Guardando…"
            : modo === "edicion"
              ? "Guardar cambios"
              : desdeAbono
                ? "Registrar y conciliar"
                : "Registrar"}
        </Button>
      </DialogFooter>

      {/* 409 ABONO_TIENE_COBRO_CANDIDATO: el abono cuadra con un cobro de
          vuelo libre. Lo correcto casi siempre es ligarlo al cobro. */}
      <Dialog open={conflictoCobro !== null} onOpenChange={(o) => !o && setConflictoCobro(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Este abono cuadra con un cobro de vuelo</DialogTitle>
            <DialogDescription>
              {conflictoCobro?.mensaje ||
                "Vincúlalo a ese cobro: registrarlo como otro ingreso contaría el mismo dinero dos veces."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(conflictoCobro?.candidatos ?? []).map((c) => (
              <div
                key={`${c.tipo}:${c.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{c.etiqueta}</p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      c.cliente,
                      c.fecha ? fechaLegible(c.fecha) : null,
                      fmtMonto(c.monto, abono?.cuenta_moneda ?? undefined),
                      Math.abs(c.neto - c.monto) > 0.005
                        ? `neto ${fmtMonto(c.neto, abono?.cuenta_moneda ?? undefined)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Button size="sm" onClick={() => void vincularAlCobro(c)} disabled={ligando !== null}>
                  {ligando === c.id ? "Vinculando…" : "Vincular a este cobro"}
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setConflictoCobro(null)} disabled={ligando !== null}>
              Cancelar
            </Button>
            <Button
              variant="outline"
              className="border-amber-500/50 text-amber-700 dark:text-amber-300"
              disabled={ligando !== null || guardando}
              onClick={() => {
                setConflictoCobro(null);
                void guardar({ sinCobro: true });
              }}
            >
              No, es otro dinero: registrar de todos modos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 409 ABONO_POSIBLE_DUPLICADO: otra línea del banco igual. */}
      <AlertDialog
        open={conflictoDuplicado !== null}
        onOpenChange={(o) => !o && setConflictoDuplicado(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Línea repetida del banco?</AlertDialogTitle>
            <AlertDialogDescription>
              {abono && conflictoDuplicado
                ? textoConfirmarDuplicado(
                    { fecha: abono.fecha, monto: abono.monto, moneda: abono.cuenta_moneda },
                    conflictoDuplicado,
                  )
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setConflictoDuplicado(null);
                void guardar({ duplicado: true });
              }}
              className={cn("bg-amber-600 text-white hover:bg-amber-600/90")}
            >
              Registrarla de todos modos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
