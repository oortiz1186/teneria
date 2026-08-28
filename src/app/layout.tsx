import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Tenería ERP",
  description: "Control integral de producción y administración para tenería"
};

const nav = [
  ["/", "Dashboard"],
  ["/recepciones", "Recepción de piel"],
  ["/lotes", "Lotes"],
  ["/produccion", "Producción"],
  ["/produccion/ordenes", "Órdenes de producción"],
  ["/almacenes", "Almacenes"],
  ["/calidad", "Calidad"],
  ["/ventas", "Ventas"],
  ["/compras", "Compras"],
  ["/finanzas", "Administración"],
  ["/configuracion", "Configuración"]
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">Tenería ERP</div>
            <nav className="nav">{nav.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
