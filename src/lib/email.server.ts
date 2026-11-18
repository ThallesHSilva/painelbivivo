import nodemailer from "nodemailer";
import { loadEnvFile } from "node:process";
import dns from "node:dns/promises";

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
    SMTP_AUTH = "true",
    SMTP_FROM,
    MAIL_FROM,
    APP_ORIGIN,
  } = process.env;
  const port = Number(SMTP_PORT);
  const authMode = SMTP_AUTH.trim().toLowerCase();
  const authenticatedModes = ["1", "true", "yes", "on"];
  const validAuthModes = [...authenticatedModes, "0", "false", "no", "off", "auto"];
  const useAuthentication =
    authMode === "auto"
      ? SMTP_HOST?.trim().toLowerCase() !== "smtp-relay.gmail.com"
      : authenticatedModes.includes(authMode);
  const from = MAIL_FROM?.trim() || SMTP_FROM?.trim();
  if (
    !SMTP_HOST ||
    (useAuthentication && (!SMTP_USER || !SMTP_PASSWORD)) ||
    !validAuthModes.includes(authMode) ||
    !from ||
    !APP_ORIGIN ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    /[\r\n]/.test(from)
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
    auth: useAuthentication ? { user: SMTP_USER!, pass: SMTP_PASSWORD! } : undefined,
    useIpAuthentication:
      !useAuthentication && SMTP_HOST.trim().toLowerCase() === "smtp-relay.gmail.com",
    from,
    origin: origin.origin,
    serverName: origin.hostname,
  };
}

export async function sendVerificationEmail(email: string, token: string) {
  const configuration = emailConfiguration();
  const link = new URL("/login", configuration.origin);
  link.hash = `verify=${token}`;
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
  let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
  try {
    // The existing Workspace relay authorizes the VPS's public IPv4 address.
    const host = configuration.useIpAuthentication
      ? (await dns.lookup(configuration.host, { family: 4 })).address
      : configuration.host;
    transport = nodemailer.createTransport({
      host,
      port: configuration.port,
      name: configuration.serverName,
      tls: configuration.useIpAuthentication ? { servername: configuration.host } : undefined,
      secure: configuration.port === 465,
      requireTLS: configuration.port !== 465,
      auth: configuration.auth,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
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
    transport?.close();
  }
}
