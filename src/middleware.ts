import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth-token";

const PUBLIC_PATHS = ["/login", "/favicon.ico"];

const roleRules: Array<{ prefix: string; roles: string[] }> = [
  { prefix: "/operacion", roles: ["PRODUCTION", "WAREHOUSE", "QUALITY", "MAINTENANCE"] },
  { prefix: "/mantenimiento", roles: ["MAINTENANCE", "PRODUCTION", "WAREHOUSE"] },
  { prefix: "/recepciones", roles: ["WAREHOUSE", "PURCHASING", "PRODUCTION"] },
  { prefix: "/lotes", roles: ["PRODUCTION", "WAREHOUSE", "QUALITY"] },
  { prefix: "/produccion", roles: ["PRODUCTION"] },
  { prefix: "/inventario", roles: ["WAREHOUSE", "PRODUCTION"] },
  { prefix: "/almacenes", roles: ["WAREHOUSE"] },
  { prefix: "/calidad", roles: ["QUALITY"] },
  { prefix: "/ventas", roles: ["SALES"] },
  { prefix: "/compras", roles: ["PURCHASING", "WAREHOUSE"] },
  { prefix: "/finanzas", roles: ["FINANCE"] },
  { prefix: "/costos", roles: ["FINANCE"] },
  { prefix: "/auditoria", roles: ["ADMIN"] },
  { prefix: "/configuracion", roles: ["ADMIN"] }
];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PUBLIC_PATHS.some(p => path === p || path.startsWith(`${p}/`))) return NextResponse.next();

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (session.mustChangePassword && path !== "/cuenta" && !path.startsWith("/cuenta/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/cuenta";
    url.search = "?required=1";
    return NextResponse.redirect(url);
  }

  const rule = roleRules.find(r => path === r.prefix || path.startsWith(`${r.prefix}/`));
  if (rule && !session.roles.includes("ADMIN") && !rule.roles.some(role => session.roles.includes(role))) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("forbidden", "1");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
