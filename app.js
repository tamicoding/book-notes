import dotenv from "dotenv";
import express from "express";
import path from "path";
import session from "express-session";
import passport from "passport";
import expressLayouts from "express-ejs-layouts";
import fetch from "node-fetch";
import fs from "fs";
import winston from "winston";
import { fileURLToPath } from "url";

import { sendResetEmail as defaultSendResetEmail } from "./mailer.js";
import { pool as defaultPool } from "./db.js";
import { asyncHandler } from "./utils/request.js";
import { createBookService } from "./services/bookService.js";
import { createAuthService } from "./services/authService.js";
import { createAuthRouter } from "./routes/auth.js";
import { createBookRouter } from "./routes/books.js";
import { csrfProtection } from "./middleware/csrf.js";
import { createSessionStore } from "./services/sessionStore.js";
import { createCloudinaryService } from "./services/cloudinaryService.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(options = {}) {
  const {
    pool = defaultPool,
    sendResetEmail = defaultSendResetEmail,
    fetchImpl = fetch,
    sessionSecret = process.env.SESSION_SECRET || "troque-essa-chave",
    logger = createLogger(process.env.NODE_ENV === "production"),
    sessionStore,
    mediaService = createCloudinaryService(),
  } = options;

  const app = express();
  const isProd = process.env.NODE_ENV === "production";
  const bookService = createBookService({ pool, fetchImpl, logger });
  const authService = createAuthService({ pool, sendResetEmail, logger, isProd });
  const resolvedSessionStore =
    sessionStore || (isProd ? createSessionStore({ pool, logger }) : undefined);

  if (isProd) {
    app.set("trust proxy", 1);
  }

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  app.use(expressLayouts);
  app.set("layout", "layout");

  app.use(express.static(path.join(__dirname, "public")));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    session({
      secret: sessionSecret,
      store: resolvedSessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());
  app.use(csrfProtection);
  app.use((req, res, next) => {
    res.locals.user = req.user || null;
    res.locals.title = "MyBooks";
    next();
  });

  app.use(
    asyncHandler(async (req, res, next) => {
      if (!req.user) {
        res.locals.dates = [];
        return next();
      }

      try {
        res.locals.dates = await bookService.getUserDates(req.user.id);
      } catch (error) {
        logger.warn("Falha ao carregar datas do filtro", {
          userId: req.user.id,
          error: error.message,
        });
        res.locals.dates = [];
      }

      return next();
    })
  );

  authService.configurePassport();
  app.use(createAuthRouter({ authService }));
  app.use(createBookRouter({ bookService, mediaService }));

  app.use((req, res) => {
    res.status(404).render("status", {
      title: "Página não encontrada",
      heading: "Página não encontrada",
      message:
        "A página que você tentou acessar não existe ou foi movida. Vamos te levar de volta para um caminho conhecido.",
      primaryLabel: "Ir para início",
      primaryHref: req.isAuthenticated?.() ? "/" : "/login",
      secondaryLabel: req.isAuthenticated?.() ? "Adicionar livro" : "Criar conta",
      secondaryHref: req.isAuthenticated?.() ? "/books/add" : "/register",
      icon: "!",
    });
  });

  app.use((error, req, res, _next) => {
    logger.error("Unhandled application error", {
      path: req.originalUrl,
      method: req.method,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
    });

    if (res.headersSent) {
      return;
    }

    return res.status(500).render("status", {
      title: "Erro interno",
      heading: "Algo deu errado",
      message:
        "Ocorreu um erro inesperado. Tente novamente em instantes. Se o problema continuar, vale revisar os logs da aplicação.",
      primaryLabel: "Tentar novamente",
      primaryHref: req.originalUrl || "/",
      secondaryLabel: "Ir para início",
      secondaryHref: req.isAuthenticated?.() ? "/" : "/login",
      icon: "!",
    });
  });

  return app;
}

function createLogger(isProd) {
  const logDir = path.join(__dirname, "logs");
  if (!isProd) {
    try {
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
    } catch {
      // Ignore logger directory creation errors in development.
    }
  }

  const loggerTransports = [];

  if (!isProd) {
    loggerTransports.push(
      new winston.transports.File({
        filename: path.join(logDir, "error.log"),
        level: "error",
      })
    );
    loggerTransports.push(
      new winston.transports.File({
        filename: path.join(logDir, "combined.log"),
      })
    );
  }

  loggerTransports.push(
    new winston.transports.Console({ format: winston.format.simple() })
  );

  return winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: loggerTransports,
  });
}
