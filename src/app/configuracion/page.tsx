import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createUser, resetUserPassword, toggleUserStatus, updateUserRoles } from "./actions";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireRole(["ADMIN"]);
  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      include: { roles: { include: { role: true } } },
      orderBy: { name: "asc" }
    }),
    prisma.role.findMany({ orderBy: { name: "asc" } })
  ]);

  return (
    <>
      <div className="header">
        <div>
          <h1 className="title">Configuración</h1>
          <div className="muted">Usuarios, roles y seguridad de acceso.</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <h2>Nuevo usuario</h2>
        <form action={createUser} className="form">
          <div className="field"><label>Nombre</label><input name="name" required minLength={2} /></div>
          <div className="field"><label>Correo</label><input name="email" type="email" required /></div>
          <div className="field"><label>Contraseña inicial</label><input name="password" type="password" minLength={12} required /></div>
          <div className="field">
            <label>Roles</label>
            <div style={{ display: "grid", gap: 6 }}>
              {roles.map(role => <label key={role.id}><input type="checkbox" name="roleIds" value={role.id} /> {role.name}</label>)}
            </div>
          </div>
          <div className="full"><button className="button" type="submit">Crear usuario</button></div>
        </form>
      </div>

      <h2>Usuarios</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Usuario</th><th>Estado</th><th>Roles</th><th>Último acceso</th><th>Acciones</th></tr></thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td><strong>{user.name}</strong><div className="muted">{user.email}</div></td>
                <td><span className="badge">{user.status}</span></td>
                <td>
                  <form action={updateUserRoles} style={{ display: "grid", gap: 6 }}>
                    <input type="hidden" name="userId" value={user.id} />
                    {roles.map(role => <label key={role.id}><input type="checkbox" name="roleIds" value={role.id} defaultChecked={user.roles.some(r => r.roleId === role.id)} /> {role.name}</label>)}
                    <button className="button" type="submit">Guardar roles</button>
                  </form>
                </td>
                <td>{user.lastLoginAt ? user.lastLoginAt.toLocaleString("es-MX") : "—"}</td>
                <td>
                  <div style={{ display: "grid", gap: 10 }}>
                    <form action={toggleUserStatus}>
                      <input type="hidden" name="userId" value={user.id} />
                      <button className="button" type="submit">{user.status === "ACTIVE" ? "Desactivar" : "Activar"}</button>
                    </form>
                    <form action={resetUserPassword} style={{ display: "grid", gap: 6 }}>
                      <input type="hidden" name="userId" value={user.id} />
                      <input name="password" type="password" minLength={12} placeholder="Nueva contraseña" required />
                      <button className="button" type="submit">Restablecer contraseña</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
