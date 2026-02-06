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
    secure, // true normalmente só para porta 465
    auth: { user, pass },
  });
}

export async function sendResetEmail(toEmail, resetLink) {
  const transporter = createTransporter();

  const from = process.env.MAIL_FROM || "BookNotes <no-reply@booknotes>";

  const info = await transporter.sendMail({
    from,
    to: toEmail,
    subject: "Redefinição de senha - BookNotes",
    text: `Você solicitou a redefinição de senha. Abra este link:\n\n${resetLink}\n\nSe você não solicitou, ignore este email.`,
    html: `
      <p>Você solicitou a redefinição de senha.</p>
      <p><a href="${resetLink}">Clique aqui para redefinir sua senha</a></p>
      <p>Ou copie e cole no navegador:</p>
      <p>${resetLink}</p>
      <p>Se você não solicitou, ignore este email.</p>
    `,
  });

  return info;
}
