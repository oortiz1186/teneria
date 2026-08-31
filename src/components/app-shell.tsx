"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/login/actions";

type NavItem = {
  href: string;
  label: string;
  roles?: string[];
};

const nav: NavItem[] = [
  { href: "/", label: "Dashboard", roles: ["ADMIN", "FINANCE"] },
  { href: "/operacion", label: "Piso / Operación", roles: ["ADMIN", "PRODUCTION", "WAREHOUSE", "QUALITY", "MAINTENANCE"] },
  { href: "/mantenimiento", label: "Mantenimiento", roles: ["ADMIN", "MAINTENANCE", "PRODUCTION", "WAREHOUSE"] },
  { href: "/mantenimiento/ordenes", label: "Órdenes de mantenimiento", roles: ["ADMIN", "MAINTENANCE", "PRODUCTION", "WAREHOUSE"] },
  { href: "/documentos", label: "Documentos" },
  { href: "/recepciones", label: "Recepción de piel", roles: ["ADMIN", "WAREHOUSE", "PURCHASING", "PRODUCTION"] },
  { href: "/lotes", label: "Lotes", roles: ["ADMIN", "PRODUCTION", "WAREHOUSE", "QUALITY"] },
  { href: "/produccion", label: "Producción", roles: ["ADMIN", "PRODUCTION"] },
  { href: "/produccion/ordenes", label: "Órdenes de producción", roles: ["ADMIN", "PRODUCTION"] },
  { href: "/inventario", label: "Inventario químico", roles: ["ADMIN", "WAREHOUSE", "PRODUCTION"] },
  { href: "/inventario/recetas", label: "Recetas", roles: ["ADMIN", "WAREHOUSE", "PRODUCTION"] },
  { href: "/inventario/consumos", label: "Consumos químicos", roles: ["ADMIN", "WAREHOUSE", "PRODUCTION"] },
  { href: "/almacenes", label: "Almacenes", roles: ["ADMIN", "WAREHOUSE"] },
  { href: "/calidad", label: "Calidad", roles: ["ADMIN", "QUALITY"] },
  { href: "/ventas", label: "Ventas", roles: ["ADMIN", "SALES"] },
  { href: "/compras", label: "Compras", roles: ["ADMIN", "PURCHASING", "WAREHOUSE"] },
  { href: "/finanzas", label: "Administración", roles: ["ADMIN", "FINANCE"] },
  { href: "/costos", label: "Costos", roles: ["ADMIN", "FINANCE"] },
  { href: "/auditoria", label: "Auditoría", roles: ["ADMIN"] },
  { href: "/configuracion", label: "Configuración", roles: ["ADMIN"] },
  { href: "/cuenta", label: "Mi cuenta" }
];

function visibleTo(roles: string[], item: NavItem) {
  if (!item.roles) return true;
  return item.roles.some(role => roles.includes(role));
}

export function AppShell({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const pathname = usePathname();
  if (pathname === "/login") return <main>{children}</main>;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Tenería ERP</div>
        <nav className="nav">
          {nav.filter(item => visibleTo(roles, item)).map(item => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </nav>
        <form action={logoutAction} className="logout-form">
          <button className="button button-secondary" type="submit">Cerrar sesión</button>
        </form>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
