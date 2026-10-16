/**
 * Renglón sintético «Saldo inicial al 1-sep-2026» al PIE de un historial
 * recortado por el inicio oficial (auditoría 16-oct-2026, API 0.0.85):
 * tacómetros del avión y cardex del artículo. Las cifras son las que el API
 * ya calculó con el historial completo (no se recalcula nada). No es una
 * fila: no se edita ni entra a la búsqueda de la tabla. Mismo aspecto que el
 * de Caja chica. Sin piezas, solo la etiqueta.
 */
export function RenglonSaldoInicial({
  etiqueta,
  piezas,
  className,
}: {
  etiqueta: string;
  piezas: { titulo: string; valor: string }[];
  className?: string;
}) {
  return (
    <div
      data-saldo-inicial
      className={`flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-2.5 text-sm ${className ?? ""}`}
    >
      <span className="font-medium">{etiqueta}</span>
      {piezas.length > 0 && (
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
          {piezas.map((p) => (
            <span key={p.titulo}>
              <span className="text-xs text-muted-foreground">{p.titulo} </span>
              {p.valor}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
