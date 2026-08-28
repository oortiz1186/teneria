import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata = {
  title: "Tenería ERP",
  description: "Control integral de producción y administración para tenería"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
