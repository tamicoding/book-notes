import bcrypt from "bcrypt";
import express from "express";
import { createHash } from "node:crypto";

import { createApp } from "../../app.js";

export class InMemoryPool {
  constructor() {
    this.reset();
  }

  reset() {
    this.nextUserId = 1;
    this.nextBookId = 1;
    this.users = [];
    this.books = [];
  }

  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, " ").trim();

    if (normalized === "SELECT 1 FROM users WHERE email = $1") {
      const [email] = params;
      return {
        rows: this.users.filter((user) => user.email === email).map(() => ({ "?column?": 1 })),
      };
    }

    if (normalized === "SELECT * FROM users WHERE email = $1") {
      const [email] = params;
      return {
        rows: this.users.filter((user) => user.email === email).map((user) => ({ ...user })),
      };
    }

    if (normalized === "SELECT * FROM users WHERE id = $1") {
      const [id] = params;
      const user = this.users.find((entry) => entry.id === Number(id));
      return { rows: user ? [{ ...user }] : [] };
    }

    if (normalized === "SELECT id FROM users WHERE email = $1") {
      const [email] = params;
      const user = this.users.find((entry) => entry.email === email);
      return { rows: user ? [{ id: user.id }] : [] };
    }

    if (
      normalized === "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *"
    ) {
      const [name, email, password] = params;
      const user = {
        id: this.nextUserId++,
        name,
        email,
        password,
        google_id: null,
        reset_token: null,
        reset_token_expires: null,
      };
      this.users.push(user);
      return { rows: [{ ...user }] };
    }

    if (normalized === "UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3") {
      const [tokenHash, expires, id] = params;
      const user = this.users.find((entry) => entry.id === Number(id));
      if (!user) return { rowCount: 0, rows: [] };
      user.reset_token = tokenHash;
      user.reset_token_expires = new Date(expires);
      return { rowCount: 1, rows: [] };
    }

    if (
      normalized.includes(
        "SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()"
      )
    ) {
      const [tokenHash] = params;
      const user = this.users.find(
        (entry) =>
          entry.reset_token === tokenHash &&
          entry.reset_token_expires &&
          entry.reset_token_expires > new Date()
      );
      return { rows: user ? [{ id: user.id }] : [] };
    }

    if (
      normalized.includes(
        "UPDATE users SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE reset_token = $2"
      )
    ) {
      const [passwordHash, tokenHash] = params;
      const user = this.users.find(
        (entry) =>
          entry.reset_token === tokenHash &&
          entry.reset_token_expires &&
          entry.reset_token_expires > new Date()
      );

      if (!user) return { rows: [] };

      user.password = passwordHash;
      user.reset_token = null;
      user.reset_token_expires = null;
      return { rows: [{ id: user.id }] };
    }

    if (
      normalized ===
      "INSERT INTO books (user_id, title, author, notes, rating, read_date, cover_url) VALUES ($1, $2, $3, $4, $5, $6, $7)"
    ) {
      const [userId, title, author, notes, rating, readDate, coverUrl] = params;
      const book = {
        id: this.nextBookId++,
        user_id: Number(userId),
        title,
        author,
        notes,
        rating,
        read_date: readDate ? new Date(readDate) : null,
        cover_url: coverUrl,
        manual_cover_url: null,
        manual_cover_public_id: null,
      };
      this.books.push(book);
      return { rows: [] };
    }

    if (
      normalized ===
      "INSERT INTO books ( user_id, title, author, notes, rating, read_date, cover_url, manual_cover_url, manual_cover_public_id ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
    ) {
      const [
        userId,
        title,
        author,
        notes,
        rating,
        readDate,
        coverUrl,
        manualCoverUrl,
        manualCoverPublicId,
      ] = params;
      const book = {
        id: this.nextBookId++,
        user_id: Number(userId),
        title,
        author,
        notes,
        rating,
        read_date: readDate ? new Date(readDate) : null,
        cover_url: coverUrl,
        manual_cover_url: manualCoverUrl,
        manual_cover_public_id: manualCoverPublicId,
      };
      this.books.push(book);
      return { rows: [] };
    }

    if (normalized === "SELECT COUNT(*)::int AS total FROM books WHERE user_id = $1") {
      const [userId] = params;
      return {
        rows: [{ total: this.books.filter((book) => book.user_id === Number(userId)).length }],
      };
    }

    if (normalized === "SELECT * FROM books WHERE user_id = $1 ORDER BY id DESC") {
      const [userId] = params;
      return {
        rows: this.books
          .filter((book) => book.user_id === Number(userId))
          .sort((a, b) => b.id - a.id)
          .map((book) => ({ ...book })),
      };
    }

    if (
      normalized.includes("SELECT * FROM books WHERE user_id = $1 ORDER BY id DESC LIMIT $2 OFFSET $3")
    ) {
      const [userId, limit, offset] = params;
      return {
        rows: paginateRows(
          this.books
            .filter((book) => book.user_id === Number(userId))
            .sort((a, b) => b.id - a.id)
            .map((book) => ({ ...book })),
          limit,
          offset
        ),
      };
    }

    if (normalized === "SELECT * FROM books WHERE id = $1 AND user_id = $2") {
      const [id, userId] = params;
      const book = this.books.find(
        (entry) => entry.id === Number(id) && entry.user_id === Number(userId)
      );
      return { rows: book ? [{ ...book }] : [] };
    }

    if (
      normalized.includes(
        "UPDATE books SET title = $1, author = $2, notes = $3, rating = $4, read_date = $5, cover_url = $6 WHERE id = $7 AND user_id = $8"
      )
    ) {
      const [title, author, notes, rating, readDate, coverUrl, id, userId] = params;
      const book = this.books.find(
        (entry) => entry.id === Number(id) && entry.user_id === Number(userId)
      );
      if (!book) return { rows: [] };
      book.title = title;
      book.author = author;
      book.notes = notes;
      book.rating = rating;
      book.read_date = readDate ? new Date(readDate) : null;
      book.cover_url = coverUrl;
      return { rows: [] };
    }

    if (
      normalized.includes(
        "UPDATE books SET title = $1, author = $2, notes = $3, rating = $4, read_date = $5, cover_url = $6, manual_cover_url = $7, manual_cover_public_id = $8 WHERE id = $9 AND user_id = $10"
      )
    ) {
      const [
        title,
        author,
        notes,
        rating,
        readDate,
        coverUrl,
        manualCoverUrl,
        manualCoverPublicId,
        id,
        userId,
      ] = params;
      const book = this.books.find(
        (entry) => entry.id === Number(id) && entry.user_id === Number(userId)
      );
      if (!book) return { rows: [] };
      book.title = title;
      book.author = author;
      book.notes = notes;
      book.rating = rating;
      book.read_date = readDate ? new Date(readDate) : null;
      book.cover_url = coverUrl;
      book.manual_cover_url = manualCoverUrl;
      book.manual_cover_public_id = manualCoverPublicId;
      return { rows: [] };
    }

    if (normalized === "DELETE FROM books WHERE id = $1 AND user_id = $2") {
      const [id, userId] = params;
      this.books = this.books.filter(
        (entry) => !(entry.id === Number(id) && entry.user_id === Number(userId))
      );
      return { rows: [] };
    }

    if (
      normalized.includes(
        "SELECT * FROM books WHERE user_id = $1 AND (LOWER(title) LIKE $2 OR LOWER(COALESCE(author, '')) LIKE $2) ORDER BY id DESC"
      )
    ) {
      const [userId, query] = params;
      const needle = String(query).replace(/%/g, "");
      return {
        rows: this.books
          .filter(
            (book) =>
              book.user_id === Number(userId) &&
              (`${book.title}`.toLowerCase().includes(needle) ||
                `${book.author || ""}`.toLowerCase().includes(needle))
          )
          .sort((a, b) => b.id - a.id)
          .map((book) => ({ ...book })),
      };
    }

    if (
      normalized.includes(
        "SELECT COUNT(*)::int AS total FROM books WHERE user_id = $1 AND (LOWER(title) LIKE $2 OR LOWER(COALESCE(author, '')) LIKE $2)"
      )
    ) {
      const [userId, query] = params;
      const needle = String(query).replace(/%/g, "");
      return {
        rows: [
          {
            total: this.books.filter(
              (book) =>
                book.user_id === Number(userId) &&
                (`${book.title}`.toLowerCase().includes(needle) ||
                  `${book.author || ""}`.toLowerCase().includes(needle))
            ).length,
          },
        ],
      };
    }

    if (
      normalized.includes(
        "SELECT * FROM books WHERE user_id = $1 AND (LOWER(title) LIKE $2 OR LOWER(COALESCE(author, '')) LIKE $2) ORDER BY id DESC LIMIT $3 OFFSET $4"
      )
    ) {
      const [userId, query, limit, offset] = params;
      const needle = String(query).replace(/%/g, "");
      const rows = this.books
        .filter(
          (book) =>
            book.user_id === Number(userId) &&
            (`${book.title}`.toLowerCase().includes(needle) ||
              `${book.author || ""}`.toLowerCase().includes(needle))
        )
        .sort((a, b) => b.id - a.id)
        .map((book) => ({ ...book }));

      return {
        rows: paginateRows(rows, limit, offset),
      };
    }

    if (
      normalized.includes(
        "SELECT COUNT(*)::int AS total FROM books WHERE user_id = $1 AND EXTRACT(YEAR FROM read_date) = $2 AND EXTRACT(MONTH FROM read_date) = $3 AND EXTRACT(DAY FROM read_date) = $4"
      )
    ) {
      const [userId, year, month, day] = params;
      return {
        rows: [{ total: filterByDay(this.books, userId, year, month, day).length }],
      };
    }

    if (
      normalized.includes(
        "SELECT * FROM books WHERE user_id = $1 AND read_date IS NOT NULL AND EXTRACT(YEAR FROM read_date) = $2 AND EXTRACT(MONTH FROM read_date) = $3 AND EXTRACT(DAY FROM read_date) = $4 ORDER BY read_date DESC LIMIT $5 OFFSET $6"
      )
    ) {
      const [userId, year, month, day, limit, offset] = params;
      const rows = filterByDay(this.books, userId, year, month, day)
        .sort((a, b) => new Date(b.read_date) - new Date(a.read_date))
        .map((book) => ({ ...book }));

      return { rows: paginateRows(rows, limit, offset) };
    }

    if (
      normalized.includes(
        "SELECT COUNT(*)::int AS total FROM books WHERE user_id = $1 AND EXTRACT(YEAR FROM read_date) = $2 AND EXTRACT(MONTH FROM read_date) = $3"
      )
    ) {
      const [userId, year, month] = params;
      return {
        rows: [{ total: filterByMonth(this.books, userId, year, month).length }],
      };
    }

    if (
      normalized.includes(
        "SELECT * FROM books WHERE user_id = $1 AND EXTRACT(YEAR FROM read_date) = $2 AND EXTRACT(MONTH FROM read_date) = $3 ORDER BY id DESC LIMIT $4 OFFSET $5"
      )
    ) {
      const [userId, year, month, limit, offset] = params;
      const rows = filterByMonth(this.books, userId, year, month)
        .sort((a, b) => b.id - a.id)
        .map((book) => ({ ...book }));

      return { rows: paginateRows(rows, limit, offset) };
    }

    if (
      normalized.includes(
        "SELECT COUNT(*)::int AS total FROM books WHERE user_id = $1 AND EXTRACT(YEAR FROM read_date) = $2"
      )
    ) {
      const [userId, year] = params;
      return {
        rows: [{ total: filterByYear(this.books, userId, year).length }],
      };
    }

    if (
      normalized.includes(
        "SELECT * FROM books WHERE user_id = $1 AND EXTRACT(YEAR FROM read_date) = $2 ORDER BY id DESC LIMIT $3 OFFSET $4"
      )
    ) {
      const [userId, year, limit, offset] = params;
      const rows = filterByYear(this.books, userId, year)
        .sort((a, b) => b.id - a.id)
        .map((book) => ({ ...book }));

      return { rows: paginateRows(rows, limit, offset) };
    }

    if (
      normalized.includes(
        "SELECT DISTINCT EXTRACT(YEAR FROM read_date) AS year, EXTRACT(MONTH FROM read_date) AS month, EXTRACT(DAY FROM read_date) AS day FROM books"
      )
    ) {
      const [userId] = params;
      const unique = new Map();

      this.books
        .filter((book) => book.user_id === Number(userId) && book.read_date)
        .forEach((book) => {
          const date = new Date(book.read_date);
          const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
          unique.set(key, {
            year: date.getUTCFullYear(),
            month: date.getUTCMonth() + 1,
            day: date.getUTCDate(),
          });
        });

      return {
        rows: [...unique.values()].sort(
          (a, b) => b.year - a.year || b.month - a.month || b.day - a.day
        ),
      };
    }

    if (
      normalized.includes("SELECT * FROM books FROM books") ||
      normalized.includes("SELECT * FROM users WHERE google_id = $1 OR email = $2") ||
      normalized.includes("UPDATE users SET google_id = $1 WHERE id = $2 RETURNING *") ||
      normalized.includes(
        "INSERT INTO users (name, email, google_id) VALUES ($1, $2, $3) RETURNING *"
      )
    ) {
      throw new Error(`Query not supported in test pool: ${normalized}`);
    }

    throw new Error(`Query not supported in test pool: ${normalized}`);
  }
}

function paginateRows(rows, limit, offset) {
  return rows.slice(Number(offset), Number(offset) + Number(limit));
}

function filterByYear(books, userId, year) {
  return books.filter((book) => {
    if (book.user_id !== Number(userId) || !book.read_date) return false;
    return new Date(book.read_date).getUTCFullYear() === Number(year);
  });
}

function filterByMonth(books, userId, year, month) {
  return filterByYear(books, userId, year).filter(
    (book) => new Date(book.read_date).getUTCMonth() + 1 === Number(month)
  );
}

function filterByDay(books, userId, year, month, day) {
  return filterByMonth(books, userId, year, month).filter(
    (book) => new Date(book.read_date).getUTCDate() === Number(day)
  );
}

export function createFetchStub() {
  return async () => ({
    ok: true,
    async json() {
      return {};
    },
  });
}

export function createMailStub() {
  const sent = [];
  return {
    sent,
    async sendResetEmail(to, resetLink) {
      sent.push({ to, resetLink });
    },
  };
}

export function createMediaStub() {
  let nextUploadId = 1;

  return {
    enabled: true,
    async uploadBookCover(file, userId) {
      if (!file) {
        return null;
      }

      const id = nextUploadId++;
      return {
        url: `https://cdn.example.com/booknotes/user-${userId}/cover-${id}.jpg`,
        publicId: `booknotes/covers/user-${userId}-cover-${id}`,
      };
    },
    async deleteBookCover() {},
  };
}

export async function createServer() {
  const pool = new InMemoryPool();
  const mail = createMailStub();
  const mediaService = createMediaStub();
  const app = createApp({
    pool,
    sendResetEmail: mail.sendResetEmail,
    fetchImpl: createFetchStub(),
    sessionSecret: "test-secret",
    mediaService,
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  });

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  return { pool, mail, server };
}

export async function createE2EServer(port = 3100) {
  const pool = new InMemoryPool();
  const mail = createMailStub();
  const mediaService = createMediaStub();
  const app = createApp({
    pool,
    sendResetEmail: mail.sendResetEmail,
    fetchImpl: createFetchStub(),
    sessionSecret: "playwright-secret",
    mediaService,
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  });

  const wrapper = express();
  wrapper.get("/__test__/reset-link", (req, res) => {
    const email = String(req.query.email || "").toLowerCase();
    const message = [...mail.sent].reverse().find((entry) => entry.to.toLowerCase() === email);

    if (!message) {
      return res.status(404).json({ error: "Reset link not found." });
    }

    return res.json({ resetLink: message.resetLink });
  });

  wrapper.get("/__test__/user", async (req, res) => {
    const email = String(req.query.email || "").toLowerCase();
    const user = pool.users.find((entry) => entry.email.toLowerCase() === email);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.json({
      id: user.id,
      email: user.email,
      hasResetToken: Boolean(user.reset_token),
      resetTokenHash: user.reset_token,
    });
  });
  wrapper.use(app);

  const server = await new Promise((resolve) => {
    const instance = wrapper.listen(port, () => resolve(instance));
  });

  return { app: wrapper, pool, mail, server };
}

export function createClient(server) {
  let cookieHeader = "";
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    async request(path, options = {}) {
      const headers = new Headers(options.headers || {});
      if (cookieHeader) {
        headers.set("cookie", cookieHeader);
      }

      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers,
        redirect: options.redirect || "manual",
      });

      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        cookieHeader = setCookie
          .split(/,\s*(?=[^;]+?=)/)
          .map((entry) => entry.split(";")[0])
          .join("; ");
      }

      return response;
    },
    async getText(path, options = {}) {
      const response = await this.request(path, options);
      const text = await response.text();
      return { response, text };
    },
  };
}

export function form(data) {
  return new URLSearchParams(data).toString();
}

export function extractCsrfToken(html, assert) {
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/i);
  if (assert) {
    assert.ok(match, "CSRF token não encontrado na resposta HTML.");
  } else if (!match) {
    throw new Error("CSRF token não encontrado na resposta HTML.");
  }
  return match[1];
}

export async function seedUser(pool, { name, email, password }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: pool.nextUserId++,
    name,
    email,
    password: passwordHash,
    google_id: null,
    reset_token: null,
    reset_token_expires: null,
  };
  pool.users.push(user);
  return user;
}

export function getResetTokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}
