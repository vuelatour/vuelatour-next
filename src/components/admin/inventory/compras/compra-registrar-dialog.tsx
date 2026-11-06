"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, ShoppingBagIcon, TrashIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import { ProveedorSelector } from "@/components/admin/expenses/proveedor-selector";
import {
  agregarGastoCompraAction,
  createCompraAction,
  recibirCompraAction,
  registrarGastoCompraAction,
} from "@/app/admin/inventory/compras/actions";
import { uploadGastoComprobante } from "@/lib/storage/gasto-fotos";
import { todayCancun } from "@/lib/datetime";
import {
  BOTON_AGREGAR_OTRO_GASTO,
  ETIQUETA_COMO_SE_PAGO,
  ETIQUETA_QUITAR_OTRO_GASTO,
  ETIQUETA_RECIBIR_AHORA,
  ETIQUETA_Y_EL_PAGO,
  HINT_OTROS_GASTOS_DIRECTA,
  HINT_RECIBIR_AHORA,
  HINT_LINEAS_COMPRA,
  HINT_TC_COMPRA_OPCIONAL,
  MSG_LINEAS_SIN_COSTO_PARA_GASTO,
  OPCIONES_PAGO_COMPRA,
  PAGO_COMPRA_DEFAULT,
  ROL_OTRO_GASTO_OPTIONS,
  TITULO_BOTON_COMPRA_DIRECTA,
  TITULO_OTROS_GASTOS_DIRECTA,
  TITULO_REGISTRAR_COMPRA,
  avisoCompraSinGasto,
  avisoCompraSinRecepcion,
  avisoOtroGastoNoRegistrado,
  cuerpoRegistrarCompra,
  cuerpoOtroGastoDirecta,
  cuerpoRegistrarGastoCompra,
  descripcionRegistrarCompra,
  errorOtrosGastos,
  etiquetaBotonRegistrarCompra,
  filaOtroGastoVacia,
  formGastoCompraVacio,
  formRegistrarCompraVacio,
  lineaCompraVacia,
  lineasConCosto,
  recibirAhoraDefault,
  sufijoOtrosGastosToast,
  tcInicialCompra,
  textoConfirmarCompraConGasto,
  textoOtrosGastosConfirmar,
  tituloRegistrarCompra,
  toastCompraConGasto,
  toastCompraDirecta,
  toastCompraRecibida,
  toastCompraRegistrada,
  type FilaOtroGastoDirecta,
  type FormGastoCompra,
  type FormRegistrarCompra,
  type LineaCompraForm,
  type ModoRegistrarCompra,
  type OpcionPagoCompra,
} from "@/lib/admin/compras-estado";
import type { CompraMoneda, CompraRolOtro, GastoCandidatoCompra } from "@/types/compras";
import { CompraGastoCampos, ComprobanteArchivo } from "./compra-gasto-campos";
import { GastoCandidatoSelector } from "./gasto-candidato-selector";

const MONEDAS: Array<{ value: CompraMoneda; label: string }> = [
  { value: "USD", label: "USD (dólares)" },
  { value: "MXN", label: "MXN (pesos)" },
];

const NUEVO_ITEM = "__nuevo__";

export interface ItemCompraOption {
  id: string;
  nombre: string;
  numero_parte: string | null;
}

/**
 * «Registrar compra» (21-oct-2026): el pedido o la factura del proveedor con
 * sus líneas ⇒ compra ABIERTA («Pedida, sin recibir»). Desde el 4-nov-2026
 * (API 0.0.120) la misma captura resuelve el pago: «Ya la pagué» crea la
 * compra y, enseguida, su gasto en Gastos (dos llamadas: si la segunda
 * falla, la compra queda sin gasto y se dice completo); «Todavía no la
 * pago» la deja «Sin gasto registrado»; «La factura ya está en Gastos» la
 * vincula (y, sin líneas capturadas, el API las arma con lo que leyó la IA
 * de ese gasto). El envío y la aduana que se pagan aparte se agregan en el
 * detalle con «Agregar gasto».
 *
 * «Compra directa» (6-nov-2026, `modo="directa"`, botón principal de «Compras de la tienda»):
 * lo que se compró directo y ya está en bodega, en UN paso. El pago es
 * siempre «ahora» y «Ya está en bodega» nace marcado: tras el gasto se
 * llama `recibir` y las líneas entran al inventario; al terminar se queda en
 * Inventario (sin entrar a la compra). En Compras el mismo checkbox existe,
 * sin marcar.
 */
export function CompraRegistrarDialog({
  providers,
  items,
  tcOficialHoy = null,
  modo = "compras",
}: {
  providers: { id: string; nombre: string }[];
  items: ItemCompraOption[];
  /** T.C. oficial de hoy (sugerencia del gasto; null = sin dato). */
  tcOficialHoy?: number | null;
  /** `directa` = compra ya pagada, en un paso (y a bodega si se marca). */
  modo?: ModoRegistrarCompra;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormRegistrarCompra>(() => formRegistrarCompraVacio(todayCancun()));
  const [pago, setPago] = useState<OpcionPagoCompra>(PAGO_COMPRA_DEFAULT);
  const [recibirAhora, setRecibirAhora] = useState(() => recibirAhoraDefault(modo));
  // Gastos aparte (envío, aduana, otro cargo) de la misma captura (6-nov-2026).
  const [otros, setOtros] = useState<FilaOtroGastoDirecta[]>([]);
  const [otrosArchivos, setOtrosArchivos] = useState<Record<string, File | null>>({});
  const [contadorOtros, setContadorOtros] = useState(0);
  const [gastoForm, setGastoForm] = useState<FormGastoCompra>(() =>
    formGastoCompraVacio({ tc: tcInicialCompra(null, tcOficialHoy), fecha: todayCancun() }),
  );
  const [archivo, setArchivo] = useState<File | null>(null);
  const [gasto, setGasto] = useState<GastoCandidatoCompra | null>(null);
  const [contador, setContador] = useState(1);
  const [confirmar, setConfirmar] = useState(false);

  const set = (patch: Partial<FormRegistrarCompra>) => setForm((f) => ({ ...f, ...patch }));
  const setGastoCampo = (patch: Partial<FormGastoCompra>) => setGastoForm((f) => ({ ...f, ...patch }));
  const setLinea = (key: string, patch: Partial<LineaCompraForm>) =>
    setForm((f) => ({ ...f, lineas: f.lineas.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  const abrir = (o: boolean) => {
    if (o) {
      const hoy = todayCancun();
      setForm(formRegistrarCompraVacio(hoy));
      // Compra directa: siempre pagada («ahora»).
      setPago(modo === "directa" ? "ahora" : PAGO_COMPRA_DEFAULT);
      setRecibirAhora(recibirAhoraDefault(modo));
      setOtros([]);
      setOtrosArchivos({});
      setContadorOtros(0);
      setGastoForm(formGastoCompraVacio({ tc: tcInicialCompra(null, tcOficialHoy), fecha: hoy }));
      setArchivo(null);
      setGasto(null);
      setContador(1);
      setConfirmar(false);
    }
    setOpen(o);
  };

  const elegirPago = (o: OpcionPagoCompra) => {
    setPago(o);
    if (o !== "vincular") elegirGasto(null);
  };

  const elegirGasto = (g: GastoCandidatoCompra | null) => {
    setGasto(g);
    set({
      gasto_mercancia_id: g?.id ?? "",
      // La moneda y el proveedor de la compra son los de su factura.
      ...(g ? { moneda: g.moneda, proveedor_id: g.proveedor?.id ?? form.proveedor_id, fecha: g.fecha_gasto } : {}),
    });
  };

  const agregarLinea = () => {
    const n = contador + 1;
    setContador(n);
    setForm((f) => ({ ...f, lineas: [...f.lineas, lineaCompraVacia(`l-${n}`)] }));
  };

  const quitarLinea = (key: string) =>
    setForm((f) => ({ ...f, lineas: f.lineas.length > 1 ? f.lineas.filter((l) => l.key !== key) : f.lineas }));

  const agregarOtro = () => {
    const n = contadorOtros + 1;
    setContadorOtros(n);
    setOtros((xs) => [...xs, filaOtroGastoVacia(`o-${n}`)]);
  };
  const setOtro = (key: string, patch: Partial<FilaOtroGastoDirecta>) =>
    setOtros((xs) => xs.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  const quitarOtro = (key: string) => {
    setOtros((xs) => xs.filter((o) => o.key !== key));
    setOtrosArchivos((a) => ({ ...a, [key]: null }));
  };

  const directa = modo === "directa";
  const conGasto = pago === "ahora";
  // Con «Ya la pagué» el T.C. del gasto es también el de la compra (un solo campo).
  const formCompra: FormRegistrarCompra = conGasto ? { ...form, tc_usd_mxn: gastoForm.tc } : form;
  const veredictoCompra = cuerpoRegistrarCompra(formCompra);
  const veredictoGasto = conGasto ? cuerpoRegistrarGastoCompra(gastoForm, null) : null;

  /** Todo lo que se puede validar ANTES de crear nada; null = adelante. */
  const errorPrevio = (): string | null => {
    if (!veredictoCompra.ok) return veredictoCompra.error;
    if (veredictoCompra.cuerpo.lineas.length === 0 && !veredictoCompra.cuerpo.gasto_mercancia_id) {
      return "Captura al menos una línea (o vincula el gasto de la factura para armarlas desde él).";
    }
    if (pago === "vincular" && !gasto) return "Elige el gasto que pagó esta compra.";
    if (conGasto) {
      if (!lineasConCosto(form)) return MSG_LINEAS_SIN_COSTO_PARA_GASTO;
      if (veredictoGasto && !veredictoGasto.ok) return veredictoGasto.error;
      const eOtros = errorOtrosGastos(otros);
      if (eOtros) return eOtros;
    }
    return null;
  };

  const pedir = () => {
    const e = errorPrevio();
    if (e) {
      toast.error(e);
      return;
    }
    // Dinero (se crea un gasto) o entrada a bodega ⇒ confirmación; si no, directo.
    if (conGasto || recibirAhora) setConfirmar(true);
    else registrar();
  };

  const registrar = () => {
    if (!veredictoCompra.ok) return;
    const cuerpoCompra = veredictoCompra.cuerpo;
    const cuerpoGasto = veredictoGasto && veredictoGasto.ok ? veredictoGasto.cuerpo : null;
    startTransition(async () => {
      // Los comprobantes ANTES de crear nada: si falla una subida, no nace la compra a medias.
      let fotoPath: string | null = null;
      const fotosOtros: Record<string, string | null> = {};
      try {
        if (conGasto && archivo) fotoPath = await uploadGastoComprobante(archivo);
        if (conGasto) {
          for (const o of otros) {
            const f = otrosArchivos[o.key];
            fotosOtros[o.key] = f ? await uploadGastoComprobante(f) : null;
          }
        }
      } catch (err) {
        setConfirmar(false);
        toast.error(err instanceof Error ? err.message : "No se pudo subir el comprobante");
        return;
      }
      const r = await createCompraAction(cuerpoCompra);
      if (!r.ok || !r.data) {
        setConfirmar(false);
        toast.error(r.error ?? "No se pudo registrar la compra");
        return;
      }
      const compra = r.data;
      const lineas = cuerpoCompra.lineas.length;
      let gastoOk: Parameters<typeof toastCompraConGasto>[0] | null = null;
      let otrosOk = 0;
      let todoBien = true;
      if (conGasto && cuerpoGasto) {
        const g = await registrarGastoCompraAction(compra.id, {
          ...cuerpoGasto,
          // El proveedor y el folio del gasto son los de la compra (no se capturan dos veces).
          ...(cuerpoCompra.proveedor_id ? { proveedor_id: cuerpoCompra.proveedor_id } : {}),
          ...(cuerpoCompra.referencia ? { folio_ticket: cuerpoCompra.referencia } : {}),
          ...(fotoPath ? { foto_url: fotoPath } : {}),
        });
        if (g.ok && g.data) {
          gastoOk = g.data;
        } else {
          // La compra SÍ nació: se dice completo y se abre para que la terminen ahí.
          todoBien = false;
          toast.warning(avisoCompraSinGasto(compra.folio, g.error), { duration: 15000 });
        }
        // Gastos aparte (envío, aduana, otro cargo): uno por uno, ligados a la compra.
        for (const o of otros) {
          const cuerpo = cuerpoOtroGastoDirecta(o, gastoForm, fotosOtros[o.key]);
          if (!cuerpo.ok) {
            todoBien = false;
            toast.warning(avisoOtroGastoNoRegistrado(compra.folio, o, cuerpo.error), { duration: 15000 });
            continue;
          }
          const r2 = await agregarGastoCompraAction(compra.id, cuerpo.cuerpo);
          if (r2.ok) {
            otrosOk += 1;
          } else {
            todoBien = false;
            toast.warning(avisoOtroGastoNoRegistrado(compra.folio, o, r2.error), { duration: 15000 });
          }
        }
      }
      // «Ya está en bodega»: la entrada al inventario en el mismo paso.
      let recibida = false;
      if (recibirAhora) {
        const rec = await recibirCompraAction(compra.id);
        if (rec.ok) {
          recibida = true;
        } else {
          todoBien = false;
          toast.warning(avisoCompraSinRecepcion(compra.folio, rec.error), { duration: 15000 });
        }
      }
      setConfirmar(false);
      if (gastoOk && recibida) {
        toast.success(toastCompraDirecta(gastoOk, lineas) + sufijoOtrosGastosToast(otrosOk), { duration: 8000 });
      } else if (gastoOk) {
        toast.success(toastCompraConGasto(gastoOk) + sufijoOtrosGastosToast(otrosOk), { duration: 8000 });
      } else if (recibida) {
        toast.success(toastCompraRecibida(compra.folio, lineas), { duration: 8000 });
      } else if (!conGasto && !recibirAhora) {
        toast.success(toastCompraRegistrada(compra));
      }
      setOpen(false);
      // Compra directa: no hace falta entrar a la compra; la bodega se refresca.
      // Si algo falló, sí se abre la compra para terminarla ahí.
      if (directa && todoBien) router.refresh();
      else router.push(`/admin/inventory/compras/${compra.id}`);
    });
  };

  const opcionesItems = [
    { value: NUEVO_ITEM, label: "＋ Artículo nuevo (escribe el nombre)" },
    ...items.map((i) => ({ value: i.id, label: i.numero_parte ? `${i.nombre} · ${i.numero_parte}` : i.nombre })),
  ];

  return (
    <>
      {directa ? (
        <Button onClick={() => abrir(true)} className="gap-2" data-compra-directa title={TITULO_BOTON_COMPRA_DIRECTA}>
          <ShoppingBagIcon className="h-4 w-4" />
          {tituloRegistrarCompra(modo)}
        </Button>
      ) : (
        <Button onClick={() => abrir(true)} className="gap-2" data-registrar-compra>
          <PlusIcon className="h-4 w-4" />
          {TITULO_REGISTRAR_COMPRA}
        </Button>
      )}
      <Dialog open={open} onOpenChange={(o) => !pending && abrir(o)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-modo-compra={modo}>
          <DialogHeader>
            <DialogTitle>{tituloRegistrarCompra(modo)}</DialogTitle>
            <DialogDescription>{descripcionRegistrarCompra(modo)}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="Proveedor">
                <ProveedorSelector providers={providers} value={form.proveedor_id} onChange={(v) => set({ proveedor_id: v })} />
              </Field>
              <Field label={directa ? "Fecha de la compra" : "Fecha del pedido / factura"} required>
                <Input type="date" value={form.fecha} onChange={(e) => set({ fecha: e.target.value })} />
              </Field>
              <Field label="Referencia" hint="Número de orden o factura del proveedor.">
                <Input value={form.referencia} onChange={(e) => set({ referencia: e.target.value })} placeholder="Ej. AS-1234567" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Moneda" required>
                  <SearchableSelect options={MONEDAS} value={form.moneda} onChange={(v) => set({ moneda: v as CompraMoneda })} />
                </Field>
                {/* Con «Ya la pagué» el T.C. se captura UNA vez, en el gasto. */}
                {!conGasto && (
                  <Field label="T.C. (MXN por USD)" hint={HINT_TC_COMPRA_OPCIONAL}>
                    <Input
                      type="number"
                      step="0.0001"
                      min="0"
                      inputMode="decimal"
                      placeholder="Opcional"
                      value={form.tc_usd_mxn}
                      onChange={(e) => set({ tc_usd_mxn: e.target.value })}
                    />
                  </Field>
                )}
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3" data-lineas-compra>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{directa ? "Líneas (lo que compraste)" : "Líneas (lo que pediste)"}</p>
                  <p className="text-xs text-muted-foreground">{HINT_LINEAS_COMPRA}</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={agregarLinea}>
                  <PlusIcon className="h-4 w-4" />
                  Línea
                </Button>
              </div>
              {form.lineas.map((l, i) => (
                <div key={l.key} className="grid grid-cols-1 gap-2 sm:grid-cols-[1.2fr_1fr_0.6fr_0.7fr_auto] [&>*]:min-w-0" data-linea={i + 1}>
                  <SearchableSelect
                    options={opcionesItems}
                    value={l.item_id || NUEVO_ITEM}
                    onChange={(v) => {
                      const it = items.find((x) => x.id === v) ?? null;
                      setLinea(l.key, {
                        item_id: v === NUEVO_ITEM ? "" : v,
                        ...(it ? { nombre: it.nombre, numero_parte: it.numero_parte ?? "" } : {}),
                      });
                    }}
                    placeholder="Artículo"
                    aria-label={`Artículo de la línea ${i + 1}`}
                  />
                  <Input
                    value={l.nombre}
                    onChange={(e) => setLinea(l.key, { nombre: e.target.value })}
                    placeholder="Nombre de la refacción"
                    aria-label={`Nombre de la línea ${i + 1}`}
                  />
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    value={l.cantidad}
                    onChange={(e) => setLinea(l.key, { cantidad: e.target.value })}
                    placeholder="Unid."
                    aria-label={`Unidades de la línea ${i + 1}`}
                  />
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    value={l.costo_unitario}
                    onChange={(e) => setLinea(l.key, { costo_unitario: e.target.value })}
                    placeholder={`Costo c/u (${form.moneda})`}
                    aria-label={`Costo unitario de la línea ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => quitarLinea(l.key)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-destructive hover:bg-muted disabled:opacity-40"
                    title="Quitar la línea"
                    disabled={form.lineas.length === 1}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* ¿Y el pago? Tres caminos, uno solo elegido. En la compra directa el
                pago es «ahora» y solo se pregunta cómo se pagó. */}
            <fieldset className="space-y-2 rounded-lg border border-border p-3" data-pago-compra={pago}>
              <legend className="px-1 text-sm font-medium">{directa ? ETIQUETA_COMO_SE_PAGO : ETIQUETA_Y_EL_PAGO}</legend>
              {!directa && OPCIONES_PAGO_COMPRA.map((o) => (
                <label key={o.value} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="pago-compra"
                    value={o.value}
                    checked={pago === o.value}
                    onChange={() => elegirPago(o.value)}
                    className="mt-0.5 h-4 w-4 cursor-pointer accent-brand-600"
                  />
                  <span>
                    <span className="font-medium">{o.label}</span>
                    <span className="block text-xs text-muted-foreground">{o.description}</span>
                  </span>
                </label>
              ))}
              {conGasto && (
                <div className="pt-2" data-gasto-inline>
                  <CompraGastoCampos
                    form={gastoForm}
                    onChange={setGastoCampo}
                    providers={providers}
                    tcOficialHoy={tcOficialHoy}
                    archivo={archivo}
                    onArchivo={setArchivo}
                    mostrarProveedor={false}
                    mostrarFolio={false}
                    mostrarNotas={false}
                  />
                </div>
              )}
              {conGasto && (
                <div className="space-y-2 rounded-lg border border-dashed border-border p-3" data-otros-gastos={otros.length}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{TITULO_OTROS_GASTOS_DIRECTA}</p>
                      <p className="text-xs text-muted-foreground">{HINT_OTROS_GASTOS_DIRECTA}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="gap-1" onClick={agregarOtro} data-accion="agregar-otro-gasto">
                      <PlusIcon className="h-4 w-4" />
                      {BOTON_AGREGAR_OTRO_GASTO}
                    </Button>
                  </div>
                  {otros.map((o, i) => (
                    <div key={o.key} className="space-y-2 rounded-md border border-border p-2" data-otro-gasto={i + 1}>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.3fr_0.8fr_0.7fr_auto] [&>*]:min-w-0">
                        <SearchableSelect
                          options={[...ROL_OTRO_GASTO_OPTIONS]}
                          value={o.rol}
                          onChange={(v) => setOtro(o.key, { rol: v as CompraRolOtro })}
                          aria-label={`Qué pagó el gasto aparte ${i + 1}`}
                        />
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          value={o.monto}
                          onChange={(e) => setOtro(o.key, { monto: e.target.value })}
                          placeholder="Monto"
                          aria-label={`Monto del gasto aparte ${i + 1}`}
                          data-monto-otro-gasto={i + 1}
                        />
                        <SearchableSelect
                          options={MONEDAS}
                          value={o.moneda}
                          onChange={(v) => setOtro(o.key, { moneda: v === "USD" ? "USD" : "MXN" })}
                          aria-label={`Moneda del gasto aparte ${i + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => quitarOtro(o.key)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-destructive hover:bg-muted"
                          title={ETIQUETA_QUITAR_OTRO_GASTO}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 [&>*]:min-w-0">
                        <ProveedorSelector
                          providers={providers}
                          value={o.proveedor}
                          onChange={(v) => setOtro(o.key, { proveedor: v })}
                        />
                        <ComprobanteArchivo
                          archivo={otrosArchivos[o.key] ?? null}
                          onArchivo={(f) => setOtrosArchivos((a) => ({ ...a, [o.key]: f }))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {pago === "vincular" && <GastoCandidatoSelector value={gasto?.id ?? ""} onChange={elegirGasto} soloMercancia />}
              {pago === "vincular" && gasto && (
                <p className="text-xs text-muted-foreground">
                  Queda como la factura de mercancía de la compra. Si no capturas líneas, el API las arma con lo que
                  leyó la IA de ese gasto.
                </p>
              )}
            </fieldset>

            {/* «Ya está en bodega» (6-nov-2026): la entrada al inventario en el
                mismo paso. Nace SIN marcar en los dos modos (6-nov-2026). */}
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm" data-recibir-ahora={recibirAhora ? "1" : "0"}>
              <input
                type="checkbox"
                checked={recibirAhora}
                onChange={(e) => setRecibirAhora(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-brand-600"
              />
              <span>
                <span className="font-medium">{ETIQUETA_RECIBIR_AHORA}</span>
                <span className="block text-xs text-muted-foreground">{HINT_RECIBIR_AHORA}</span>
              </span>
            </label>

            <Field label="Notas">
              <Textarea rows={2} value={form.notas} onChange={(e) => set({ notas: e.target.value })} />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => abrir(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={pedir} disabled={pending} data-accion="registrar-compra">
              {pending ? "Registrando…" : etiquetaBotonRegistrarCompra({ modo, conGasto, recibir: recibirAhora })}
            </Button>
          </DialogFooter>

          {/* Dinero (nace un gasto): confirmación anidada. */}
          <AlertDialog open={confirmar} onOpenChange={(o) => !o && setConfirmar(false)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {conGasto ? "¿Registrar la compra y su gasto?" : "¿Registrar la compra y darle entrada a bodega?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {veredictoCompra.ok && veredictoGasto && veredictoGasto.ok
                    ? textoConfirmarCompraConGasto({
                        lineas: veredictoCompra.cuerpo.lineas.length,
                        moneda: form.moneda,
                        tc: veredictoGasto.cuerpo.tc_usd_mxn,
                        fecha: veredictoGasto.cuerpo.fecha_gasto,
                        medio: veredictoGasto.cuerpo.medio_pago,
                        recibir: recibirAhora,
                      }) + textoOtrosGastosConfirmar(otros)
                    : veredictoCompra.ok
                      ? `Se registra la compra con ${veredictoCompra.cuerpo.lineas.length} ${veredictoCompra.cuerpo.lineas.length === 1 ? "línea" : "líneas"} y sus unidades entran a bodega de inmediato (sin gasto todavía).`
                      : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Revisar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={pending}
                  onClick={(e) => {
                    e.preventDefault();
                    registrar();
                  }}
                >
                  {pending ? "Registrando…" : "Sí, registrar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogContent>
      </Dialog>
    </>
  );
}
