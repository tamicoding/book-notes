import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = 3000;

// Simulação de banco de dados (array)
let books = [
  { id: 1, title: "Coraline", author: "Neil Gaiman", notes: "Livro que estou lendo" },
  { id: 2, title: "O Carona na Vassoura", author: "Julia Donaldson", notes: "Rebecca adora 💜" }
];

// Configuração de caminhos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ================== ROTAS ==================

// Listar livros
app.get("/", (req, res) => {
  res.render("index", { books });
});

// Formulário adicionar
app.get("/books/add", (req, res) => {
  res.render("addBook");
});

// Adicionar livro
app.post("/books/add", (req, res) => {
  const { title, author, notes } = req.body;
  const newBook = { id: Date.now(), title, author, notes };
  books.push(newBook);
  res.redirect("/");
});

// Formulário editar
app.get("/books/edit/:id", (req, res) => {
  const book = books.find(b => b.id == req.params.id);
  if (!book) return res.send("Livro não encontrado!");
  res.render("editBook", { book });
});

// Salvar edição
app.post("/books/edit/:id", (req, res) => {
  const { title, author, notes } = req.body;
  const book = books.find(b => b.id == req.params.id);
  if (book) {
    book.title = title;
    book.author = author;
    book.notes = notes;
  }
  res.redirect("/");
});

// Formulário excluir
app.get("/books/delete/:id", (req, res) => {
  const book = books.find(b => b.id == req.params.id);
  if (!book) return res.send("Livro não encontrado!");
  res.render("deleteBook", { book });
});

// Excluir livro
app.post("/books/delete/:id", (req, res) => {
  books = books.filter(b => b.id != req.params.id);
  res.redirect("/");
});

// ================== SERVIDOR ==================
app.listen(port, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${port}`);
});