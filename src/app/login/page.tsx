import type { Metadata } from "next";
import { Suspense } from "react";
import { VtSpinner } from "@/components/ui/vt-loader";
import { TITULOS_PAGINA } from "@/lib/admin/titulos-pestana";
import { LoginForm } from "./login-form";

// Pestaña «Iniciar sesión · Vuelatour»: aquí manda el proxy cuando la sesión vence.
export const metadata: Metadata = { title: TITULOS_PAGINA.iniciarSesion };

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Suspense
          fallback={
            <div className="vt-card p-8 h-72 flex items-center justify-center">
              <VtSpinner className="h-8 w-8 text-brand-600" />
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
