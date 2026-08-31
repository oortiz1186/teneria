import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { getCurrentSession } from "@/lib/auth";

export const metadata = {
  title: "Tenería ERP",
  description: "Control integral de producción y administración para tenería"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getCurrentSession();
  return (
    <html lang="es">
      <body>
        <AppShell roles={session?.roles ?? []}>{children}</AppShell>
      </body>
    </html>
  );
}
