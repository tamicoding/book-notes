import bcrypt from "bcrypt";
import passport from "passport";
import { randomBytes, createHash } from "crypto";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

import { normalizeEmail } from "../utils/request.js";
import {
  forgotPasswordSchema,
  loginSchema,
  parseWithSchema,
  registerSchema,
  resetPasswordSchema,
} from "../validation/schemas.js";
import { ValidationError } from "../utils/validation.js";

export function createAuthService({ pool, sendResetEmail, logger, isProd }) {
  const googleOAuthEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_CALLBACK_URL?.trim()
  );

  function renderAuthView(res, view, payload = {}) {
    return res.status(payload.statusCode || 400).render(view, payload);
  }

  async function findUserByEmail(email) {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    return result.rows[0] || null;
  }

  async function findUserById(id) {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return result.rows[0] || null;
  }

  async function registerUser(body) {
    const { name, email, password } = parseWithSchema(registerSchema, body);

    const exists = await pool.query("SELECT 1 FROM users WHERE email = $1", [email]);
    if (exists.rows.length) {
      return { error: "Email já cadastrado." };
    }

    const hash = await bcrypt.hash(password, 10);
    const inserted = await pool.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *",
      [name, email, hash]
    );

    return { user: inserted.rows[0] };
  }

  function validateLoginInput(body) {
    return parseWithSchema(loginSchema, body);
  }

  async function requestPasswordReset(body) {
    const { email } = parseWithSchema(forgotPasswordSchema, body);

    const userResult = await pool.query("SELECT id FROM users WHERE email = $1", [email]);

    if (!userResult.rows.length) {
      return {
        message: "Se o email existir, vamos enviar um link de redefinição.",
      };
    }

    const userId = userResult.rows[0].id;
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    logger.info("Preparing to update reset_token for user", { userId });

    const updateResult = await pool.query(
      "UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3",
      [tokenHash, expires, userId]
    );

    logger.info("Reset token updated", { userId, rowCount: updateResult.rowCount });

    const baseUrl = process.env.BASE_URL || "https://book-notes-vvs0.onrender.com";
    const resetLink = `${String(baseUrl).replace(/\/$/, "")}/reset-password/${token}`;

    let mailSent = false;
    try {
      await sendResetEmail(email, resetLink);
      logger.info("Reset email sent", { email });
      mailSent = true;
    } catch (error) {
      logger.error("Erro ao enviar email de reset", {
        email,
        error: error.message,
        ...(isProd ? {} : { resetLink }),
      });
      console.error("Erro ao enviar email de reset:", error);
      console.log("RESET LINK:", resetLink);
    }

    return {
      message: mailSent
        ? "Se o email existir, enviamos um link de redefinição. Verifique sua caixa de entrada."
        : "Se o email existir, tentamos enviar o link, mas houve um erro no envio. Tente novamente mais tarde.",
    };
  }

  async function validateResetToken(token) {
    const tokenHash = createHash("sha256").update(String(token)).digest("hex");
    const result = await pool.query(
      `
      SELECT id
      FROM users
      WHERE reset_token = $1
        AND reset_token_expires > NOW()
      `,
      [tokenHash]
    );

    return result.rows.length > 0;
  }

  async function resetPassword(token, body) {
    const { password } = parseWithSchema(resetPasswordSchema, body);

    const passwordHash = await bcrypt.hash(password, 10);
    const tokenHash = createHash("sha256").update(String(token)).digest("hex");

    const updated = await pool.query(
      `
      UPDATE users
      SET password = $1,
          reset_token = NULL,
          reset_token_expires = NULL
      WHERE reset_token = $2
        AND reset_token_expires > NOW()
      RETURNING id
      `,
      [passwordHash, tokenHash]
    );

    if (!updated.rows.length) {
      return { error: "Token inválido ou expirado." };
    }

    return { success: true };
  }

  async function findOrCreateGoogleUser(profile) {
    const email = normalizeEmail(profile.emails?.[0]?.value);
    const googleId = profile.id;

    if (!email) {
      throw new ValidationError("A conta do Google não retornou um email válido.");
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE google_id = $1 OR email = $2",
      [googleId, email]
    );

    if (!result.rows.length) {
      const inserted = await pool.query(
        "INSERT INTO users (name, email, google_id) VALUES ($1, $2, $3) RETURNING *",
        [profile.displayName, email, googleId]
      );
      return inserted.rows[0];
    }

    const user = result.rows[0];
    if (!user.google_id) {
      const updated = await pool.query(
        "UPDATE users SET google_id = $1 WHERE id = $2 RETURNING *",
        [googleId, user.id]
      );
      return updated.rows[0];
    }

    return user;
  }

  function configurePassport() {
    passport.use(
      new LocalStrategy(
        { usernameField: "email" },
        async (email, password, done) => {
          try {
            const user = await findUserByEmail(normalizeEmail(email));

            if (!user) {
              return done(null, false, { message: "Usuário não encontrado." });
            }

            if (!user.password) {
              return done(null, false, {
                message: "Conta sem senha. Use o login com Google.",
              });
            }

            const match = await bcrypt.compare(password, user.password);
            if (!match) {
              return done(null, false, { message: "Senha incorreta." });
            }

            return done(null, user);
          } catch (error) {
            return done(error);
          }
        }
      )
    );

    if (googleOAuthEnabled) {
      passport.use(
        new GoogleStrategy(
          {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL,
          },
          async (_accessToken, _refreshToken, profile, done) => {
            try {
              const user = await findOrCreateGoogleUser(profile);
              return done(null, user);
            } catch (error) {
              return done(error, null);
            }
          }
        )
      );
    }

    passport.serializeUser((user, done) => done(null, user.id));
    passport.deserializeUser(async (id, done) => {
      try {
        const user = await findUserById(id);
        done(null, user || false);
      } catch (error) {
        done(error);
      }
    });
  }

  return {
    configurePassport,
    googleOAuthEnabled,
    renderAuthView,
    registerUser,
    requestPasswordReset,
    resetPassword,
    validateLoginInput,
    validateResetToken,
  };
}
