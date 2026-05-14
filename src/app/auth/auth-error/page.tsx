import Link from "next/link";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

interface PageProps {
  searchParams: Promise<{ reason?: string }>;
}

export default async function AuthErrorPage({ searchParams }: PageProps) {
  const { reason } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="vt-card p-8 space-y-6 text-center">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
              <ExclamationTriangleIcon className="h-7 w-7 text-brand-600 dark:text-brand-400" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">No pudimos iniciar tu sesión</h1>
            <p className="text-sm text-muted-foreground">
              {reason
                ? `Detalle: ${reason}`
                : "Algo salió mal durante la autenticación con Google."}
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Intentar de nuevo
          </Link>
        </div>
      </div>
    </main>
  );
}
