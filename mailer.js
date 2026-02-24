import nodemailer from "nodemailer";

function asBool(v, fallback = false) {
  if (v === undefined || v === null || v === "") return fallback;
  return String(v).toLowerCase() === "true";
}

export function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = asBool(process.env.SMTP_SECURE, false);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASS nas variáveis de ambiente."
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure, 

    auth: { user, pass },

    requireTLS: !secure,

    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });
}

/**
 * Envia um e-mail de redefinição de senha usando o transporte configurado.
 *
 * Se a configuração de SMTP não estiver completa, basta logar o link no
 * console (uso típico em desenvolvimento) para evitar que a aplicação quebre.
 *
 * @param {string} to endereço de destino
 * @param {string} resetLink link de redefinição
 * @returns {Promise<void|import("nodemailer").SentMessageInfo>}
 */
export async function sendResetEmail(to, resetLink) {
  // se não houver dados de SMTP, fazemos apenas fallback para console
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  ) {
    console.log("SMTP não configurado, exibindo link de reset no console:", resetLink);
    return;
  }

  const transporter = createTransporter();
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;

  const message = {
    from: fromAddress,
    to,
    subject: "Redefinição de senha - BookNotes",
    text: `Para redefinir sua senha acesse o link: ${resetLink}`,
    html: `<p>Para redefinir sua senha clique no link abaixo:</p>
           <p><a href="${resetLink}">${resetLink}</a></p>`,
  };

  return transporter.sendMail(message);
}