export type TipoTarifa = "PUBLICO" | "BROKER";
export type MetodoPago = "BILLPOCKET" | "HSBC_LINK" | "TRANSFERENCIA" | "EFECTIVO" | "DOLARES";
export type PaisAeronave = "MX" | "USA";

export interface CalculateQuoteRequest {
  aeronave_id: string;
  ruta_id?: string | null;
  origen_iata?: string;
  destino_iata?: string;
  millas_nauticas?: number;
  es_redondo_auto?: boolean;
  num_aterrizajes?: number;
  tipo_tarifa: TipoTarifa;
  pasajeros: number;
  pase_abordar?: boolean;
  metodo_pago: MetodoPago;
  tarifa_hora_override_usd?: number;
  tuas_override_usd_pax?: number;
  iva_pct_override?: number;
}

export interface QuoteBreakdown {
  aeronave: {
    id: string;
    matricula: string;
    modelo: string;
    pais_registro: PaisAeronave;
    velocidad_crucero_kts: number;
  };
  ruta: {
    id: string | null;
    origen_iata: string;
    destino_iata: string;
    millas_nauticas_base: number;
    millas_nauticas_totales: number;
    es_redondo_auto: boolean;
    num_aterrizajes: number;
  };
  tiempos: {
    vuelo_hr: number;
    calzos_hr: number;
    cobrable_hr: number;
  };
  tarifa: {
    tipo: TipoTarifa;
    usd_por_hora: number;
    proviene_de_override: boolean;
  };
  tuas: {
    usd_pax_default: number | undefined;
    pasajeros: number;
    origen: { iata: string; aplica: boolean; usd_pax: number; razon: string };
    destino: { iata: string; aplica: boolean; usd_pax: number; razon: string };
    total_usd: number;
  };
  iva: {
    aplica_por_metodo_pago: boolean;
    porcentaje: number;
    base_usd: number;
    monto_usd: number;
    nota: string;
  };
  totales: {
    subtotal_vuelo_usd: number;
    tuas_total_usd: number;
    iva_usd: number;
    total_usd: number;
  };
  meta: {
    calculado_at: string;
    version_motor: string;
  };
}
