import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "teneria_session";
export const SESSION_MAX_AGE = 60 * 60 * 8;

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  roles: string[];
  sessionVersion: number;
  mustChangePassword: boolean;
};

function getSecret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET debe tener al menos 32 caracteres.");
  return new TextEncoder().encode(value);
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySession(token?: string | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      name: String(payload.name),
      roles: Array.isArray(payload.roles) ? payload.roles.map(String) : [],
      sessionVersion: Number(payload.sessionVersion ?? 0),
      mustChangePassword: Boolean(payload.mustChangePassword ?? false)
    };
  } catch {
    return null;
  }
}
