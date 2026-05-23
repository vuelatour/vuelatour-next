export interface AlertConfig {
  clave: string;
  descripcion: string;
  activa: boolean;
  canal: "socket" | "email" | "ambos";
  roles: string[];
  dias_anticipacion: number[];
  horas_anticipacion: number | null;
}
