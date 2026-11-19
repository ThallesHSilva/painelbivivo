import { createHash, randomBytes } from "node:crypto";
import {
  completePasswordReset,
  expirePasswordReset,
  findUserByEmail,
  reservePasswordReset,
} from "@/lib/database.server";
import { emailConfiguration, sendPasswordResetEmail } from "@/lib/email.server";
import { hashPassword, isAdministratorEmail, validUserPassword } from "@/lib/auth.server";

export function requestPasswordReset(email: string) {
  // Validate SMTP independently of account existence. Never reveal registered addresses.
  emailConfiguration();
  const normalized = email.trim().toLocaleLowerCase("pt-BR");
  if (isAdministratorEmail(normalized)) return;
  const user = findUserByEmail(normalized);
  if (!user || user.status === "rejected") return;
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  if (!reservePasswordReset(user, tokenHash, Date.now())) return;
  // The long-lived Node server delivers asynchronously so SMTP timing cannot enumerate accounts.
  // Delivery failures consume the link and retain the cooldown; no tokens or addresses are logged.
  void sendPasswordResetEmail(user.email, token).catch(() => {
    expirePasswordReset(tokenHash);
    console.warn("Falha no envio de recuperação de senha.");
  });
}

export async function resetPassword(token: string, password: string) {
  if (!/^[a-f0-9]{64}$/.test(token) || !validUserPassword(password) || password.length > 256)
    return false;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return completePasswordReset(tokenHash, await hashPassword(password), Date.now());
}
