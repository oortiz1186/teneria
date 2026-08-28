import { requireUser } from "@/lib/auth";
import { changeOwnPassword } from "./actions";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  confirm: "La confirmación no coincide con la nueva contraseña.",
  same: "La nueva contraseña debe ser diferente de la actual.",
  current: "La contraseña actual no es correcta."
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; required?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const error = params.error ? messages[params.error] : null;

  return (
    <>
      <div className="header">
        <div>
          <h1 className="title">Mi cuenta</h1>
          <div className="muted">Actualiza tus credenciales de acceso al ERP.</div>
        </div>
      </div>

      {params.required || user.mustChangePassword ? (
        <div className="alert" style={{ marginBottom: 16, background: "#fff8e6", color: "#7a5400", border: "1px solid #f1d794" }}>
          Estás usando una contraseña temporal. Debes cambiarla antes de continuar al resto del sistema.
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 20 }}>
        <strong>{user.name}</strong>
        <div className="muted">{user.email}</div>
        <div className="muted" style={{ marginTop: 6 }}>Roles: {user.roles.join(", ")}</div>
      </div>

      {error ? <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div> : null}

      <form action={changeOwnPassword} className="form">
        <div className="field full">
          <label>Contraseña actual</label>
          <input name="currentPassword" type="password" autoComplete="current-password" required />
        </div>
        <div className="field">
          <label>Nueva contraseña</label>
          <input name="newPassword" type="password" minLength={12} autoComplete="new-password" required />
        </div>
        <div className="field">
          <label>Confirmar nueva contraseña</label>
          <input name="confirmPassword" type="password" minLength={12} autoComplete="new-password" required />
        </div>
        <div className="full">
          <button className="button" type="submit">Cambiar contraseña</button>
        </div>
      </form>

      <div className="card" style={{ marginTop: 18 }}>
        <strong>Seguridad</strong>
        <div className="muted" style={{ marginTop: 6 }}>
          Al cambiar tu contraseña se cerrarán todas las sesiones anteriores, incluida ésta, y tendrás que iniciar sesión nuevamente.
        </div>
      </div>
    </>
  );
}
