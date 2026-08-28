import { loginAction } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; passwordChanged?: string }> }) {
  const params = await searchParams;
  return (
    <div className="login-shell">
      <div className="login-card">
        <div>
          <div className="brand" style={{ color: "#111820", marginBottom: 8 }}>Tenería ERP</div>
          <h1 className="title">Iniciar sesión</h1>
          <p className="muted">Acceso restringido a personal autorizado.</p>
        </div>
        {params.passwordChanged ? <div className="alert" style={{ background: "#eefaf1", color: "#216e39", border: "1px solid #cdebd5" }}>Contraseña actualizada. Inicia sesión nuevamente.</div> : null}
        {params.error ? <div className="alert alert-danger">Correo o contraseña incorrectos.</div> : null}
        <form action={loginAction} className="form" style={{ gridTemplateColumns: "1fr" }}>
          <div className="field"><label>Correo</label><input name="email" type="email" autoComplete="username" required /></div>
          <div className="field"><label>Contraseña</label><input name="password" type="password" minLength={8} autoComplete="current-password" required /></div>
          <button className="button" type="submit">Entrar</button>
        </form>
      </div>
    </div>
  );
}
