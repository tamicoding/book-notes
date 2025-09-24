import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
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
  user: "postgres",
  host: "localhost",
  database: "booknotes",
  password: "REDACTED_DB_PASSWORD",
  port: 5433
});

// ================== Função para buscar capa ==================
async function getCover(title, author) {
  try {
    const response = await axios.get(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`
    );
    const docs = response.data.docs;
    if (docs.length > 0 && docs[0].cover_i) {
      return `https://covers.openlibrary.org/b/id/${docs[0].cover_i}-M.jpg`;
    } else {
      return "/images/no-cover.png";
    }
  } catch (err) {
    console.error(err);
    return "/images/no-cover.png";
  }
}

// ================== ROTAS ==================

// Home / listar livros com filtros
app.get("/", async (req, res) => {
  try {
    let query = "SELECT * FROM books";
    const params = [];

    // Ordenação
    if (req.query.sort === "rating") query += " ORDER BY rating DESC";
    else query += " ORDER BY read_date DESC";

    const result = await pool.query(query, params);
    const books = await Promise.all(
      result.rows.map(async (book) => {
        const cover = await getCover(book.title, book.author);
        return { ...book, cover };
      })
    );
    res.render("index", { books, search: req.query.search || "" });
  } catch (err) {
    console.error(err);
    res.send("Erro ao buscar livros.");
  }
});

// Formulário adicionar
app.get("/books/add", (req, res) => res.render("addBook", { book: null }));

// Adicionar livro
app.post("/books/add", async (req, res) => {
  const { title, author, notes, rating, read_date } = req.body;
  try {
    await pool.query(
      "INSERT INTO books (title, author, notes, rating, read_date) VALUES ($1, $2, $3, $4, $5)",
      [title, author, notes, rating, read_date]
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
  const { title, author, notes, rating, read_date } = req.body;
  const id = req.params.id;
  try {
    await pool.query(
      "UPDATE books SET title=$1, author=$2, notes=$3, rating=$4, read_date=$5 WHERE id=$6",
      [title, author, notes, rating, read_date, id]
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