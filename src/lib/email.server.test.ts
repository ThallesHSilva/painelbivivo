import assert from "node:assert/strict";
import { mock, test } from "node:test";
import nodemailer from "nodemailer";
import {
  emailConfiguration,
  EmailConfigurationError,
  EmailDeliveryError,
  sendVerificationEmail,
} from "./email.server.ts";

test("mail configuration and delivery", async (t) => {
  const keys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM", "APP_ORIGIN"];
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
  const transports: Array<{ secure: boolean; requireTLS: boolean }> = [];
  let fails = false;
  let closed = 0;
  mock.method(
    nodemailer,
    "createTransport",
    (options: { secure: boolean; requireTLS: boolean }) => {
      transports.push(options);
      return {
        sendMail: async (message: { to: { address: string }; text: string }) => {
          if (fails) throw new Error("Provider error with credentials that must remain private");
          messages.push(message);
          return { accepted: [message.to.address], rejected: [] };
        },
        close: () => closed++,
      };
    },
  );
  await sendVerificationEmail("user@example.com", "a".repeat(64));
  assert.equal(messages[0].to.address, "user@example.com");
  assert.match(messages[0].text, /https:\/\/painel.example.com\/login#verify=a{64}/);
  assert.equal(transports[0].secure, false);
  assert.equal(transports[0].requireTLS, true);
  process.env.SMTP_PORT = "465";
  await sendVerificationEmail("user@example.com", "b".repeat(64));
  assert.equal(transports[1].secure, true);
  fails = true;
  await assert.rejects(
    sendVerificationEmail("user@example.com", "c".repeat(64)),
    EmailDeliveryError,
  );
  assert.equal(closed, 3);
  process.env.APP_ORIGIN = "https://user:secret@panel.example.com";
  assert.throws(emailConfiguration, EmailConfigurationError);
  process.env.APP_ORIGIN = "https://panel.example.com";
  process.env.MAIL_FROM = "test@example.com\r\nBcc: other@example.com";
  assert.throws(emailConfiguration, EmailConfigurationError);
});
