import assert from "node:assert/strict";
import { mock, test } from "node:test";
import nodemailer from "nodemailer";
import dns from "node:dns/promises";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import {
  emailConfiguration,
  EmailConfigurationError,
  EmailDeliveryError,
  sendVerificationEmail,
} from "./email.server.ts";

test("mail configuration and delivery", async (t) => {
  const keys = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_AUTH",
    "SMTP_FROM",
    "MAIL_FROM",
    "APP_ORIGIN",
  ];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    mock.restoreAll();
  });
  for (const key of keys) delete process.env[key];
  assert.throws(emailConfiguration, EmailConfigurationError);
  Object.assign(process.env, {
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_USER: "user",
    SMTP_PASSWORD: "fixture",
    MAIL_FROM: "Painel executivo <acesso@example.com>",
    APP_ORIGIN: "https://painel.example.com",
  });
  const messages: Array<{ to: { address: string }; text: string }> = [];
  const transports: SMTPTransport.Options[] = [];
  let fails = false;
  let closed = 0;
  mock.method(nodemailer, "createTransport", (options: SMTPTransport.Options) => {
    transports.push(options);
    return {
      sendMail: async (message: { to: { address: string }; text: string }) => {
        if (fails) throw new Error("Provider error with credentials that must remain private");
        messages.push(message);
        return { accepted: [message.to.address], rejected: [] };
      },
      close: () => closed++,
    };
  });
  const lookups: Array<{ hostname: string; family: number }> = [];
  mock.method(dns, "lookup", async (hostname: string, options: { family: number }) => {
    lookups.push({ hostname, family: options.family });
    return { address: "192.0.2.1", family: 4 };
  });
  await sendVerificationEmail("user@example.com", "a".repeat(64));
  assert.equal(messages[0].to.address, "user@example.com");
  assert.match(messages[0].text, /https:\/\/painel.example.com\/login#verify=a{64}/);
  assert.equal(transports[0].secure, false);
  assert.equal(transports[0].requireTLS, true);
  assert.equal(transports[0].name, "painel.example.com");
  assert.deepEqual(transports[0].auth, { user: "user", pass: "fixture" });
  process.env.SMTP_PORT = "465";
  await sendVerificationEmail("user@example.com", "b".repeat(64));
  assert.equal(transports[1].secure, true);
  process.env.SMTP_HOST = "smtp-relay.gmail.com";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_AUTH = "auto";
  delete process.env.MAIL_FROM;
  process.env.SMTP_FROM = "sender@example.com";
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  assert.equal(emailConfiguration().auth, undefined);
  assert.equal(emailConfiguration().from, "sender@example.com");
  await sendVerificationEmail("user@example.com", "d".repeat(64));
  assert.equal(transports[2].requireTLS, true);
  assert.equal(transports[2].auth, undefined);
  assert.equal(transports[2].name, "painel.example.com");
  assert.deepEqual(lookups, [{ hostname: "smtp-relay.gmail.com", family: 4 }]);
  assert.equal(transports[2].host, "192.0.2.1");
  assert.equal(transports[2].tls?.servername, "smtp-relay.gmail.com");
  process.env.SMTP_HOST = "smtp.gmail.com";
  assert.throws(emailConfiguration, EmailConfigurationError);
  process.env.SMTP_USER = "user@example.com";
  process.env.SMTP_PASSWORD = "fixture";
  assert.deepEqual(emailConfiguration().auth, { user: "user@example.com", pass: "fixture" });
  process.env.SMTP_AUTH = "invalid";
  assert.throws(emailConfiguration, EmailConfigurationError);
  process.env.SMTP_AUTH = "true";
  fails = true;
  await assert.rejects(
    sendVerificationEmail("user@example.com", "c".repeat(64)),
    EmailDeliveryError,
  );
  assert.equal(closed, 4);
  process.env.APP_ORIGIN = "https://user:secret@panel.example.com";
  assert.throws(emailConfiguration, EmailConfigurationError);
  process.env.APP_ORIGIN = "https://panel.example.com";
  process.env.MAIL_FROM = "test@example.com\r\nBcc: other@example.com";
  assert.throws(emailConfiguration, EmailConfigurationError);
});
