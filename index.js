import dotenv from "dotenv";
dotenv.config();
import express from "express";
import path from "path";
import { randomBytes, createHash } from 'crypto';
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import expressLayouts from "express-ejs-layouts";
import bcrypt from "bcrypt";
import fetch from "node-fetch";
import nodemailer from "nodemailer";
import { pool } from './db.js';
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.resolve();
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, 
});
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || undefined,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendResetEmail(to, link) {
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: "Redefinição de senha - Book Notes",
    html: `
      <p>Você pediu para redefinir sua senha.</p>
      <p>Clique no link abaixo (válido por 1 hora):</p>
      <p><a href="${link}">Redefinir senha</a></p>
      <p>Se não foi você, ignore este email.</p>
    `,
  });
}


/* ===== View engine =====
 */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layout");

/* ===== Middlewares estáticos + parser =====
 */
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

/* ===== Sessão =====
   Configura o `express-session` para manter sessão do usuário.
 */
app.use(
  session({
    secret: process.env.SESSION_SECRET || "troque-essa-chave",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.title = "MyBooks";
  next();
});

// Carrega datas do filtro para o layout
app.use(async (req, res, next) => {
  try {
    if (req.user) {
      const datesRes = await pool.query(
        `SELECT DISTINCT
           EXTRACT(YEAR FROM read_date) AS year,
           EXTRACT(MONTH FROM read_date) AS month
         FROM books
         WHERE user_id=$1 AND read_date IS NOT NULL
         ORDER BY year DESC, month DESC`,
        [req.user.id]
      );
      res.locals.dates = datesRes.rows;
    } else {
      res.locals.dates = [];
    }
    next();
  } catch (err) {
    res.locals.dates = [];
    next();
  }
});

/* ===== Passport (Local Strategy) =====
   Autenticação via email/senha armazenada no banco.
 */
passport.use(
  new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
    try {
      const resu = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
      const user = resu.rows[0];
      if (!user) return done(null, false, { message: "Usuário não encontrado" });

      if (!user.password) return done(null, false, { message: "Conta sem senha (use Google)" });

      const match = await bcrypt.compare(password, user.password);
      if (!match) return done(null, false, { message: "Senha incorreta" });

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

/* ===== Passport (Google OAuth) =====
   Integração com Google OAuth2. Procura usuario por google_id ou
   por email. Se usuário não existir, cria novo registro.
 */
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const googleId = profile.id;

        let r = await pool.query(
          "SELECT * FROM users WHERE google_id=$1 OR email=$2",
          [googleId, email]
        );

        if (r.rows.length === 0) {

          const ins = await pool.query(
            "INSERT INTO users (name, email, google_id) VALUES ($1,$2,$3) RETURNING *",
            [profile.displayName, email, googleId]
          );
          return done(null, ins.rows[0]);
        }

        const user = r.rows[0];
        if (!user.google_id) {
          await pool.query("UPDATE users SET google_id=$1 WHERE id=$2", [googleId, user.id]);
        }

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

/* ===== Passport: serialização =====
   Controla como o usuário fica armazenado na sessão.
 */
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  const r = await pool.query("SELECT * FROM users WHERE id=$1", [id]);
  done(null, r.rows[0]);
});

/* ===== Helpers de rota =====
   ensureAuth: protege rotas que exigem login
   ensureGuest: redireciona usuário logado para a home
 */
function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}
function ensureGuest(req, res, next) {
  if (!req.isAuthenticated()) return next();
  res.redirect("/");
}

/* ===== Funções para buscar capas =====
   fetchCoverFromOL: tenta encontrar capa no OpenLibrary
   fetchCoverFromGoogle: fallback para Google Books
   getAndSaveCover: tenta ambas e retorna URL ou null
 */
async function fetchCoverFromOL(title, author) {
  const q = `https://openlibrary.org/search.json?title=${encodeURIComponent(
    title
  )}&author=${encodeURIComponent(author)}&limit=1`;

  const res = await fetch(q);
  const data = await res.json();

  if (data.docs && data.docs.length && data.docs[0].cover_i) {
    return `https://covers.openlibrary.org/b/id/${data.docs[0].cover_i}-M.jpg`;
  }
  return null;
}

async function fetchCoverFromGoogle(title) {
  const q = `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(title)}`;
  const res = await fetch(q);
  const data = await res.json();

  const img =
    data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail ||
    data.items?.[0]?.volumeInfo?.imageLinks?.smallThumbnail;

  if (img) return img.replace("http://", "https://");
  return null;
}

async function getAndSaveCover(title, author) {
  let cover = await fetchCoverFromOL(title, author);
  if (!cover) cover = await fetchCoverFromGoogle(title);
  return cover || null;
}

/* ===== Função utilitária: datas do usuário =====
   Retorna ano/mês/dia únicos das leituras para popular o filtro.
 */
async function getUserDates(userId) {
  const dates = await pool.query(
    `
    SELECT DISTINCT
      EXTRACT(YEAR FROM read_date)  AS year,
      EXTRACT(MONTH FROM read_date) AS month,
      EXTRACT(DAY FROM read_date)   AS day
    FROM books
    WHERE user_id=$1 AND read_date IS NOT NULL
    ORDER BY year DESC, month DESC, day DESC
    `,
    [userId]
  );

  return dates.rows || [];
}

/* ===== Rotas de autenticação (register/login/logout) ===== */
app.get("/register", ensureGuest, (req, res) => res.render("register", { error: null }));
app.post("/register", ensureGuest, async (req, res) => {
  const { name, email, password } = req.body;

  const exists = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
  if (exists.rows.length) return res.render("register", { error: "Email já existe" });

  const hash = await bcrypt.hash(password, 10);
  const ins = await pool.query(
    "INSERT INTO users (name, email, password) VALUES ($1,$2,$3) RETURNING *",
    [name, email, hash]
  );
  req.login(ins.rows[0], () => res.redirect("/"));
});

app.get("/login", ensureGuest, (req, res) => {
  const message = req.query.reset ? "Senha redefinida com sucesso. Faça login." : null;
  res.render("login", { error: null, message });
});

app.post("/login", ensureGuest, (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (!user) return res.render("login", { error: info?.message });
    req.logIn(user, () => res.redirect("/"));
  })(req, res, next);
});

app.get("/logout", (req, res) => req.logout(() => res.redirect("/login")));

/* ===== Esqueci a senha =====
   - GET: renderiza o formulário
   - POST: verifica se o email existe e, em ambiente de teste,
     gera um token e mostra o link no terminal (não persiste).
 */
app.get("/forgot-password", (req, res) => {
  res.render("forgot-password", { message: null, error: null });
});

// Envia (gera) link de reset - por enquanto mostra no terminal
app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.render("forgot-password", {
        message: null,
        error: "Digite um email válido."
      });
    }

    const userResult = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    // Segurança: sempre responde igual, mesmo se email não existir
    if (!userResult.rows.length) {
      return res.render("forgot-password", {
        message: "Se o email existir, vamos enviar um link de redefinição.",
        error: null
      });
    }

    const userId = userResult.rows[0].id;

    // gera token (enviado por email) e armazena apenas o hash (SHA-256) no banco
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await pool.query(
      "UPDATE users SET reset_token=$1, reset_token_expires=$2 WHERE id=$3",
      [tokenHash, expires, userId]
    );

    // Monta link de reset 
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const resetLink = `${String(baseUrl).replace(/\/$/, '')}/reset-password/${token}`;

    // Tenta enviar por email; em caso de falha, cai para o log (fallback)
    let mailSent = false;
    try {
      await sendResetEmail(email, resetLink);
      mailSent = true;
    } catch (err) {
      console.error("Erro ao enviar email de reset:", err);
      console.log("RESET LINK:", resetLink);
      mailSent = false;
    }

    const message = mailSent
      ? "Se o email existir, enviamos um link de redefinição. Verifique sua caixa de entrada." 
      : "Se o email existir, tentamos enviar o link, mas houve um erro no envio. Verifique o terminal (ambiente de teste) ou tente novamente.";

    return res.render("forgot-password", {
      message,
      error: null
    });
  } catch (err) {
    console.error(err);
    return res.render("forgot-password", {
      message: null,
      error: "Deu um erro. Tenta de novo."
    });
  }
});

/* ===== Reset de senha (abrir link + salvar nova senha) ===== */
app.get("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const tokenHash = createHash('sha256').update(String(token)).digest('hex');

    const user = await pool.query(
      `
      SELECT id
      FROM users
      WHERE reset_token = $1
        AND reset_token_expires > NOW()
      `,
      [tokenHash]
    );

    if (!user.rows.length) {
      return res.send("Link inválido ou expirado.");
    }

    return res.render("reset-password", { token, error: null });
  } catch (err) {
    console.error(err);
    return res.send("Erro ao abrir o link. Tente novamente.");
  }
});

app.post("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (!password || password.length < 6) {
      return res.render("reset-password", { token, error: "Senha muito curta (mínimo 6 caracteres)." });
    }

    if (password !== confirmPassword) {
      return res.render("reset-password", { token, error: "As senhas não conferem." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const tokenHash = createHash('sha256').update(String(token)).digest('hex');

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
      return res.render("reset-password", { token, error: "Token inválido ou expirado." });
    }

    return res.redirect("/login?reset=1");
  } catch (err) {
    console.error(err);
    return res.render("reset-password", { token: req.params.token, error: "Erro ao redefinir senha." });
  }
});

/* ===== Rotas Google OAuth ===== */
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    res.redirect("/");
  }
);

/* ===== Home =====
   Lista livros do usuário e renderiza a view `index`.
 */
app.get("/", ensureAuth, async (req, res) => {
  const books = await pool.query(
    "SELECT * FROM books WHERE user_id=$1 ORDER BY id DESC",
    [req.user.id]
  );

  const dates = await getUserDates(req.user.id);
  res.render("index", { books: books.rows, search: "", dates });
});

/* ===== Filtros por data =====
   Rotas para filtrar livros por ano/mês/dia.
 */

app.get("/filter/date/:year/:month/:day", ensureAuth, async (req, res) => {
  const { year, month, day } = req.params;

  const books = await pool.query(
    `
    SELECT * FROM books
    WHERE user_id=$1
      AND read_date IS NOT NULL
      AND EXTRACT(YEAR FROM read_date) = $2
      AND EXTRACT(MONTH FROM read_date) = $3
      AND EXTRACT(DAY FROM read_date) = $4
    ORDER BY read_date DESC
    `,
    [req.user.id, year, month, day]
  );

  const dates = await getUserDates(req.user.id);
  res.render("index", { books: books.rows, search: "", dates });
});

app.get("/filter/date/:year/:month", ensureAuth, async (req, res) => {
  const { year, month } = req.params;

  const books = await pool.query(
    `SELECT * FROM books 
      WHERE user_id=$1 
      AND EXTRACT(YEAR FROM read_date) = $2
      AND EXTRACT(MONTH FROM read_date) = $3
      ORDER BY id DESC`,
    [req.user.id, year, month]
  );

  const dates = await getUserDates(req.user.id);
  res.render("index", { books: books.rows, search: "", dates });
});

/* filtrar só por ano */
app.get("/filter/date/:year", ensureAuth, async (req, res) => {
  const { year } = req.params;

  const books = await pool.query(
    `SELECT * FROM books 
      WHERE user_id=$1 
      AND EXTRACT(YEAR FROM read_date) = $2
      ORDER BY id DESC`,
    [req.user.id, year]
  );

  const dates = await getUserDates(req.user.id);
  res.render("index", { books: books.rows, search: "", dates });
});

/* ===== CRUD: Adicionar livros ===== */
app.get("/books/add", ensureAuth, (req, res) => res.render("addBook"));

app.post("/books/add", ensureAuth, async (req, res) => {
  const { title, author, notes, rating, read_date } = req.body;

  const cover_url = await getAndSaveCover(title, author);

  await pool.query(
    `INSERT INTO books (user_id, title, author, notes, rating, read_date, cover_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [req.user.id, title, author, notes || null, rating || null, read_date || null, cover_url]
  );

  res.redirect("/");
});

/* ===== CRUD: Editar livros ===== */
app.get("/books/edit/:id", ensureAuth, async (req, res) => {
  const r = await pool.query("SELECT * FROM books WHERE id=$1 AND user_id=$2", [
    req.params.id,
    req.user.id,
  ]);
  if (!r.rows.length) return res.send("Livro não encontrado.");
  res.render("editBook", { book: r.rows[0] });
});

app.post("/books/edit/:id", ensureAuth, async (req, res) => {
  const { title, author, notes, rating, read_date } = req.body;

  let cover_url = await getAndSaveCover(title, author);

  await pool.query(
    `UPDATE books SET title=$1, author=$2, notes=$3, rating=$4, read_date=$5, cover_url=$6
     WHERE id=$7 AND user_id=$8`,
    [title, author, notes || null, rating || null, read_date || null, cover_url, req.params.id, req.user.id]
  );

  res.redirect("/");
});

/* ===== CRUD: Excluir livros ===== */
app.get("/books/delete/:id", ensureAuth, async (req, res) => {
  const r = await pool.query("SELECT * FROM books WHERE id=$1 AND user_id=$2", [
    req.params.id,
    req.user.id,
  ]);
  if (!r.rows.length) return res.send("Livro não encontrado");
  res.render("deleteBook", { book: r.rows[0] });
});

app.post("/books/delete/:id", ensureAuth, async (req, res) => {
  await pool.query("DELETE FROM books WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  res.redirect("/");
});

/* ===== Busca =====
   Pesquisa por título ou autor (case-insensitive)
 */
app.get("/search", ensureAuth, async (req, res) => {
  const q = `%${req.query.q?.toLowerCase() || ""}%`;
  const books = await pool.query(
    `SELECT * FROM books 
     WHERE user_id=$1 AND (LOWER(title) LIKE $2 OR LOWER(author) LIKE $2) 
     ORDER BY id DESC`,
    [req.user.id, q]
  );

  const dates = await getUserDates(req.user.id);
  res.render("index", { books: books.rows, search: req.query.q, dates });
});

/* ===== Start server ===== */
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
