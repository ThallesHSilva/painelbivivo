import nodemailer from "nodemailer";
import { loadEnvFile } from "node:process";

try {
  loadEnvFile();
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
}

export class EmailConfigurationError extends Error {
  constructor() {
    super("O envio de e-mails ainda não foi configurado. Entre em contato com o administrador.");
    this.name = "EmailConfigurationError";
  }
}

export class EmailDeliveryError extends Error {
  constructor() {
    super("Não foi possível enviar o e-mail de confirmação. Tente reenviar em um minuto.");
    this.name = "EmailDeliveryError";
  }
}

export function emailConfiguration() {
  const {
    SMTP_HOST,
    SMTP_PORT = "587",
    SMTP_USER,
    SMTP_PASSWORD,
    MAIL_FROM,
    APP_ORIGIN,
  } = process.env;
  const port = Number(SMTP_PORT);
  if (
    !SMTP_HOST ||
    !SMTP_USER ||
    !SMTP_PASSWORD ||
    !MAIL_FROM ||
    !APP_ORIGIN ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    /[\r\n]/.test(MAIL_FROM)
  ) {
    throw new EmailConfigurationError();
  }
  let origin: URL;
  try {
    origin = new URL(APP_ORIGIN);
  } catch {
    throw new EmailConfigurationError();
  }
  if (
    origin.username ||
    origin.password ||
    (origin.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        origin.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
      ))
  ) {
    throw new EmailConfigurationError();
  }
  return {
    host: SMTP_HOST,
    port,
    user: SMTP_USER,
    password: SMTP_PASSWORD,
    from: MAIL_FROM,
    origin: origin.origin,
  };
}

export async function sendVerificationEmail(email: string, token: string) {
  const configuration = emailConfiguration();
  const link = new URL("/login", configuration.origin);
  link.hash = `verify=${token}`;
  const transport = nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.port === 465,
    requireTLS: configuration.port !== 465,
    auth: { user: configuration.user, pass: configuration.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const text = [
    "Confirme seu e-mail — Painel executivo",
    "",
    "Para confirmar seu endereço de e-mail, abra o link abaixo e clique em Confirmar meu e-mail.",
    link.toString(),
    "",
    "O link expira em 1 hora e pode ser usado uma única vez.",
    "O acesso ao painel também depende da aprovação do administrador.",
    "Se você não solicitou este cadastro, ignore esta mensagem.",
  ].join("\n");
  try {
    const result = await transport.sendMail({
      from: configuration.from,
      to: { address: email, name: "" },
      subject: "Confirme seu e-mail — Painel executivo",
      text,
    });
    if (result.rejected.length > 0 || result.accepted.length === 0) throw new EmailDeliveryError();
  } catch {
    throw new EmailDeliveryError();
  } finally {
    transport.close();
  }
}
