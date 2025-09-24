import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "pg";
const { Pool } = pkg;

const app = express();
const port = 3000;

// ================== Configurações ==================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ================== Conexão com PostgreSQL ==================
const pool = new Pool({
  user: "postgres",       // seu usuário
  host: "localhost",
  database: "booknotes",  // nome do banco
  password: "REDACTED_DB_PASSWORD",  // sua senha
  port: 5433
});

// ================== ROTAS ==================

// Listar livros
app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM books ORDER BY id DESC");
    res.render("index", { books: result.rows });
  } catch (err) {
    console.error(err);
    res.send("Erro ao buscar livros.");
  }
});

// Formulário adicionar
app.get("/books/add", (req, res) => {
  res.render("addBook");
});

// Adicionar livro
app.post("/books/add", async (req, res) => {
  const { title, author, notes } = req.body;
  try {
    await pool.query(
      "INSERT INTO books (title, author, notes) VALUES ($1, $2, $3)",
      [title, author, notes]
    );
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.send("Erro ao adicionar livro.");
  }
});

// Formulário editar
app.get("/books/edit/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const result = await pool.query("SELECT * FROM books WHERE id=$1", [id]);
    const book = result.rows[0];
    if (!book) return res.send("Livro não encontrado!");
    res.render("editBook", { book });
  } catch (err) {
    console.error(err);
    res.send("Erro ao buscar livro para edição.");
  }
});

// Salvar edição
app.post("/books/edit/:id", async (req, res) => {
  const { title, author, notes } = req.body;
  const id = req.params.id;
  try {
    await pool.query(
      "UPDATE books SET title=$1, author=$2, notes=$3 WHERE id=$4",
      [title, author, notes, id]
    );
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.send("Erro ao editar livro.");
  }
});

// Formulário excluir
app.get("/books/delete/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const result = await pool.query("SELECT * FROM books WHERE id=$1", [id]);
    const book = result.rows[0];
    if (!book) return res.send("Livro não encontrado!");
    res.render("deleteBook", { book });
  } catch (err) {
    console.error(err);
    res.send("Erro ao buscar livro para exclusão.");
  }
});

// Excluir livro
app.post("/books/delete/:id", async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query("DELETE FROM books WHERE id=$1", [id]);
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.send("Erro ao remover livro.");
  }
});

// ================== SERVIDOR ==================
app.listen(port, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${port}`);
});