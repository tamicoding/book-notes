import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import expressLayouts from "express-ejs-layouts";
import pkg from "pg";
import bcrypt from "bcrypt";
import fetch from "node-fetch";

const { Pool } = pkg;
const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.resolve();

/* Postgres */

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || "5432", 10),
});

/* View engine */

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layout");

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

/* Session */

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

/* Passport local */

passport.use(
  new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
    try {
      const resu = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
      const user = resu.rows[0];
      if (!user) return done(null, false, { message: "Usuário não encontrado" });

      const match = await bcrypt.compare(password, user.password);
      if (!match) return done(null, false, { message: "Senha incorreta" });

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  const r = await pool.query("SELECT * FROM users WHERE id=$1", [id]);
  done(null, r.rows[0]);
});

/* Helpers */

function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}
function ensureGuest(req, res, next) {
  if (!req.isAuthenticated()) return next();
  res.redirect("/");
}

/* Função de capa, OpenLibrary, Google Books fallback, retorna URL */

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
  const q = `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(
    title
  )}`;
  const res = await fetch(q);
  const data = await res.json();

  const img =
    data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail ||
    data.items?.[0]?.volumeInfo?.imageLinks?.smallThumbnail;

  if (img) return img.replace("http://", "https://");
  return null;
}

/* Pega capa e salva no BD e retorna cover_url */

async function getAndSaveCover(title, author) {
  // tenta OpenLibrary
  let cover = await fetchCoverFromOL(title, author);

  // fallback: Google
  if (!cover) cover = await fetchCoverFromGoogle(title);

  return cover || null;
}

/* Auth routes */

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

app.get("/login", ensureGuest, (req, res) =>
  res.render("login", { error: null })
);

app.post("/login", ensureGuest, (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (!user) return res.render("login", { error: info.message });
    req.logIn(user, () => res.redirect("/"));
  })(req, res, next);
});

app.get("/logout", (req, res) => req.logout(() => res.redirect("/login")));

/* Home */

app.get("/", ensureAuth, async (req, res) => {
  const books = await pool.query(
    "SELECT * FROM books WHERE user_id=$1 ORDER BY id DESC",
    [req.user.id]
  );
  res.render("index", { books: books.rows, search: "" });
});

/* Add books */

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

/* Edit books */

app.get("/books/edit/:id", ensureAuth, async (req, res) => {
  const r = await pool.query(
    "SELECT * FROM books WHERE id=$1 AND user_id=$2",
    [req.params.id, req.user.id]
  );
  if (!r.rows.length) return res.send("Livro não encontrado.");
  res.render("editBook", { book: r.rows[0] });
});

app.post("/books/edit/:id", ensureAuth, async (req, res) => {
  const { title, author, notes, rating, read_date } = req.body;

  let cover_url = await getAndSaveCover(title, author);

  await pool.query(
    `UPDATE books SET title=$1, author=$2, notes=$3, rating=$4, read_date=$5, cover_url=$6
     WHERE id=$7 AND user_id=$8`,
    [
      title,
      author,
      notes || null,
      rating || null,
      read_date || null,
      cover_url,
      req.params.id,
      req.user.id,
    ]
  );

  res.redirect("/");
});

/* Delete books */

app.get("/books/delete/:id", ensureAuth, async (req, res) => {
  const r = await pool.query(
    "SELECT * FROM books WHERE id=$1 AND user_id=$2",
    [req.params.id, req.user.id]
  );
  if (!r.rows.length) return res.send("Livro não encontrado");
  res.render("deleteBook", { book: r.rows[0] });
});

app.post("/books/delete/:id", ensureAuth, async (req, res) => {
  await pool.query("DELETE FROM books WHERE id=$1 AND user_id=$2", [
    req.params.id,
    req.user.id,
  ]);
  res.redirect("/");
});

/* Search */

app.get("/search", ensureAuth, async (req, res) => {
  const q = `%${req.query.q?.toLowerCase() || ""}%`;
  const books = await pool.query(
    `SELECT * FROM books 
     WHERE user_id=$1 AND (LOWER(title) LIKE $2 OR LOWER(author) LIKE $2) 
     ORDER BY id DESC`,
    [req.user.id, q]
  );
  res.render("index", { books: books.rows, search: req.query.q });
});

/* Start */

app.listen(PORT, () =>
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`)
);
