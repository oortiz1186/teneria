"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/login/actions";

const nav = [
  ["/", "Dashboard"],
  ["/operacion", "Piso / Operación"],
  ["/recepciones", "Recepción de piel"],
  ["/lotes", "Lotes"],
  ["/produccion", "Producción"],
  ["/produccion/ordenes", "Órdenes de producción"],
  ["/inventario", "Inventario químico"],
  ["/inventario/recetas", "Recetas"],
  ["/inventario/consumos", "Consumos químicos"],
  ["/almacenes", "Almacenes"],
  ["/calidad", "Calidad"],
  ["/ventas", "Ventas"],
  ["/compras", "Compras"],
  ["/finanzas", "Administración"],
  ["/costos", "Costos"],
  ["/auditoria", "Auditoría"],
  ["/configuracion", "Configuración"]
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return <main>{children}</main>;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Tenería ERP</div>
        <nav className="nav">
          {nav.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        <form action={logoutAction} className="logout-form">
          <button className="button button-secondary" type="submit">Cerrar sesión</button>
        </form>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
