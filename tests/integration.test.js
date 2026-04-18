import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import {
  createClient,
  createServer,
  extractCsrfToken,
  form,
  getResetTokenHash,
} from "./support/testServer.js";

test("auth flow: register, logout and login again", async () => {
  const { server, pool } = await createServer();
  const client = createClient(server);

  try {
    const registerPage = await client.getText("/register");
    const registerCsrf = extractCsrfToken(registerPage.text);

    const registerResponse = await client.request("/register", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({
        _csrf: registerCsrf,
        name: "Tamiris",
        email: "tamiris@example.com",
        password: "segredo123",
      }),
    });

    assert.equal(registerResponse.status, 302);
    assert.equal(registerResponse.headers.get("location"), "/");
    assert.equal(pool.users.length, 1);
    assert.equal(pool.users[0].email, "tamiris@example.com");
    assert.ok(await bcrypt.compare("segredo123", pool.users[0].password));

    const home = await client.getText("/");
    assert.equal(home.response.status, 200);
    assert.match(home.text, /Tamiris/);
    const logoutCsrf = extractCsrfToken(home.text);

    const logoutResponse = await client.request("/logout", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ _csrf: logoutCsrf }),
    });
    assert.equal(logoutResponse.status, 302);
    assert.equal(logoutResponse.headers.get("location"), "/login");

    const loginPage = await client.getText("/login");
    const loginCsrf = extractCsrfToken(loginPage.text);

    const loginResponse = await client.request("/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({
        _csrf: loginCsrf,
        email: "tamiris@example.com",
        password: "segredo123",
      }),
    });

    assert.equal(loginResponse.status, 302);
    assert.equal(loginResponse.headers.get("location"), "/");
  } finally {
    server.close();
  }
});

test("reset de senha: gera token, redefine senha e permite novo login", async () => {
  const { server, pool, mail } = await createServer();
  const passwordHash = await bcrypt.hash("senha-antiga", 10);
  pool.users.push({
    id: pool.nextUserId++,
    name: "Leitora",
    email: "leitora@example.com",
    password: passwordHash,
    google_id: null,
    reset_token: null,
    reset_token_expires: null,
  });

  const client = createClient(server);

  try {
    const forgotPage = await client.getText("/forgot-password");
    const forgotCsrf = extractCsrfToken(forgotPage.text);

    const forgot = await client.request("/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ _csrf: forgotCsrf, email: "leitora@example.com" }),
    });

    const forgotText = await forgot.text();
    assert.equal(forgot.status, 200);
    assert.match(forgotText, /enviamos um link de redefinição/i);
    assert.equal(mail.sent.length, 1);

    const resetLink = mail.sent[0].resetLink;
    const token = resetLink.split("/").pop();
    const tokenHash = getResetTokenHash(token);

    assert.equal(pool.users[0].reset_token, tokenHash);

    const resetForm = await client.getText(`/reset-password/${token}`);
    assert.equal(resetForm.response.status, 200);
    assert.match(resetForm.text, /Redefinir senha/i);
    const resetCsrf = extractCsrfToken(resetForm.text);

    const resetPost = await client.request(`/reset-password/${token}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({
        _csrf: resetCsrf,
        password: "nova-senha123",
        confirmPassword: "nova-senha123",
      }),
    });

    assert.equal(resetPost.status, 302);
    assert.equal(resetPost.headers.get("location"), "/login?reset=1");
    assert.equal(pool.users[0].reset_token, null);
    assert.equal(pool.users[0].reset_token_expires, null);
    assert.ok(await bcrypt.compare("nova-senha123", pool.users[0].password));

    const loginPage = await client.getText("/login");
    const loginCsrf = extractCsrfToken(loginPage.text);

    const loginResponse = await client.request("/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({
        _csrf: loginCsrf,
        email: "leitora@example.com",
        password: "nova-senha123",
      }),
    });

    assert.equal(loginResponse.status, 302);
    assert.equal(loginResponse.headers.get("location"), "/");
  } finally {
    server.close();
  }
});

test("CRUD de livros: cria, edita, busca e exclui mantendo sessão autenticada", async () => {
  const { server, pool } = await createServer();
  const userPassword = await bcrypt.hash("minhasenha", 10);
  pool.users.push({
    id: pool.nextUserId++,
    name: "Maria",
    email: "maria@example.com",
    password: userPassword,
    google_id: null,
    reset_token: null,
    reset_token_expires: null,
  });

  const client = createClient(server);

  try {
    const loginPage = await client.getText("/login");
    const loginCsrf = extractCsrfToken(loginPage.text);

    const loginResponse = await client.request("/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({
        _csrf: loginCsrf,
        email: "maria@example.com",
        password: "minhasenha",
      }),
    });

    assert.equal(loginResponse.status, 302);

    const addPage = await client.getText("/books/add");
    const addCsrf = extractCsrfToken(addPage.text);

    const createResponse = await client.request("/books/add", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({
        _csrf: addCsrf,
        title: "Dom Casmurro",
        author: "Machado de Assis",
        notes: "Clássico brasileiro",
        rating: "5",
        read_date: "2026-04-18",
      }),
    });

    assert.equal(createResponse.status, 302);
    assert.equal(pool.books.length, 1);
    assert.equal(pool.books[0].title, "Dom Casmurro");

    const home = await client.getText("/");
    assert.equal(home.response.status, 200);
    assert.match(home.text, /Dom Casmurro/);
    assert.match(home.text, /Clássico brasileiro/);

    const editPage = await client.getText(`/books/edit/${pool.books[0].id}`);
    const editCsrf = extractCsrfToken(editPage.text);

    const editResponse = await client.request(`/books/edit/${pool.books[0].id}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({
        _csrf: editCsrf,
        title: "Dom Casmurro Revisado",
        author: "Machado de Assis",
        notes: "Relido em 2026",
        rating: "4",
        read_date: "2026-04-19",
      }),
    });

    assert.equal(editResponse.status, 302);
    assert.equal(pool.books[0].title, "Dom Casmurro Revisado");
    assert.equal(pool.books[0].notes, "Relido em 2026");

    const search = await client.getText("/search?q=revisado");
    assert.equal(search.response.status, 200);
    assert.match(search.text, /Dom Casmurro Revisado/);

    const deletePage = await client.getText(`/books/delete/${pool.books[0].id}`);
    const deleteCsrf = extractCsrfToken(deletePage.text);

    const deleteResponse = await client.request(`/books/delete/${pool.books[0].id}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ _csrf: deleteCsrf }),
    });

    assert.equal(deleteResponse.status, 302);
    assert.equal(pool.books.length, 0);
  } finally {
    server.close();
  }
});

test("paginação de livros: limita resultados por página e preserva navegação", async () => {
  const { server, pool } = await createServer();
  const userPassword = await bcrypt.hash("leitora123", 10);
  const userId = pool.nextUserId++;
  pool.users.push({
    id: userId,
    name: "Paginação",
    email: "paginacao@example.com",
    password: userPassword,
    google_id: null,
    reset_token: null,
    reset_token_expires: null,
  });

  for (let index = 1; index <= 11; index += 1) {
    pool.books.push({
      id: pool.nextBookId++,
      user_id: userId,
      title: `Livro ${index}`,
      author: "Teste",
      notes: `Notas ${index}`,
      rating: 4,
      read_date: new Date(`2026-04-${String(index).padStart(2, "0")}T00:00:00.000Z`),
      cover_url: null,
    });
  }

  const client = createClient(server);

  try {
    const loginPage = await client.getText("/login");
    const loginCsrf = extractCsrfToken(loginPage.text);

    const loginResponse = await client.request("/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({
        _csrf: loginCsrf,
        email: "paginacao@example.com",
        password: "leitora123",
      }),
    });

    assert.equal(loginResponse.status, 302);

    const firstPage = await client.getText("/");
    assert.equal(firstPage.response.status, 200);
    assert.match(firstPage.text, /Livro 11/);
    assert.match(firstPage.text, /Livro 3/);
    assert.doesNotMatch(firstPage.text, /Livro 2/);
    assert.match(firstPage.text, /Página 1/);
    assert.match(firstPage.text, /de 2/);
    assert.match(firstPage.text, /11 livro\(s\)/);
    assert.match(firstPage.text, /href="\/\?page=2"/);

    const secondPage = await client.getText("/?page=2");
    assert.equal(secondPage.response.status, 200);
    assert.match(secondPage.text, /Livro 2/);
    assert.match(secondPage.text, /Livro 1/);
    assert.doesNotMatch(secondPage.text, /Livro 11/);
    assert.match(secondPage.text, /Página 2/);
    assert.match(secondPage.text, /href="\/"/);
  } finally {
    server.close();
  }
});
