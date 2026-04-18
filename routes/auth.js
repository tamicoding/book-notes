import express from "express";
import passport from "passport";
import rateLimit from "express-rate-limit";

import { ensureGuest } from "../middleware/auth.js";
import { asyncHandler } from "../utils/request.js";
import { ValidationError } from "../utils/validation.js";

export function createAuthRouter({ authService }) {
  const router = express.Router();
  const forgotLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.get("/register", ensureGuest, (_req, res) =>
    res.render("register", { error: null, formData: { name: "", email: "" } })
  );

  router.post(
    "/register",
    ensureGuest,
    asyncHandler(async (req, res) => {
      try {
        const result = await authService.registerUser(req.body);

        req.login(result.user, (error) => {
          if (error) {
            return res.status(500).render("register", {
              error: "Conta criada, mas não foi possível iniciar a sessão.",
            });
          }
          return res.redirect("/");
        });
      } catch (error) {
        if (error instanceof ValidationError) {
          return authService.renderAuthView(res, "register", {
            error: error.message,
            formData: {
              name: req.body.name || "",
              email: req.body.email || "",
            },
          });
        }

        throw error;
      }
    })
  );

  router.get("/login", ensureGuest, (req, res) => {
    const message = req.query.reset ? "Senha redefinida com sucesso. Faça login." : null;
    res.render("login", { error: null, message, formData: { email: "" } });
  });

  router.post("/login", ensureGuest, (req, res, next) => {
    let validation;

    try {
      validation = authService.validateLoginInput(req.body);
    } catch (error) {
      if (error instanceof ValidationError) {
        return authService.renderAuthView(res, "login", {
          error: error.message,
          message: null,
          formData: {
            email: req.body.email || "",
          },
        });
      }

      return next(error);
    }

    if (validation.error) {
      return authService.renderAuthView(res, "login", {
        error: validation.error,
        message: null,
        formData: {
          email: req.body.email || "",
        },
      });
    }

    req.body.email = validation.email;

    passport.authenticate("local", (error, user, info) => {
      if (error) return next(error);
      if (!user) {
        return authService.renderAuthView(res, "login", {
          error: info?.message || "Não foi possível entrar.",
          message: null,
          formData: {
            email: req.body.email || "",
          },
        });
      }

      req.logIn(user, (loginError) => {
        if (loginError) return next(loginError);
        return res.redirect("/");
      });
    })(req, res, next);
  });

  router.post("/logout", (req, res, next) => {
    req.logout((error) => {
      if (error) return next(error);
      return req.session.destroy(() => res.redirect("/login"));
    });
  });

  router.get("/forgot-password", (_req, res) => {
    res.render("forgot-password", {
      message: null,
      error: null,
      formData: { email: "" },
    });
  });

  router.post(
    "/forgot-password",
    forgotLimiter,
    asyncHandler(async (req, res) => {
      try {
        const result = await authService.requestPasswordReset(req.body);

        return res.render("forgot-password", {
          message: result.message,
          error: null,
          formData: {
            email: req.body.email || "",
          },
        });
      } catch (error) {
        if (error instanceof ValidationError) {
          return res.render("forgot-password", {
            message: null,
            error: error.message,
            formData: {
              email: req.body.email || "",
            },
          });
        }

        throw error;
      }
    })
  );

  router.get(
    "/reset-password/:token",
    asyncHandler(async (req, res) => {
      const isValid = await authService.validateResetToken(req.params.token);
      if (!isValid) {
        return res.status(400).render("status", {
          title: "Link inválido",
          heading: "Esse link não está mais disponível",
          message:
            "O link de redefinição é inválido ou expirou. Você pode solicitar um novo link e tentar novamente.",
          primaryLabel: "Solicitar novo link",
          primaryHref: "/forgot-password",
          secondaryLabel: "Voltar para login",
          secondaryHref: "/login",
          icon: "!",
        });
      }

      return res.render("reset-password", {
        token: req.params.token,
        error: null,
      });
    })
  );

  router.post(
    "/reset-password/:token",
    asyncHandler(async (req, res) => {
      try {
        await authService.resetPassword(req.params.token, req.body);
        return res.redirect("/login?reset=1");
      } catch (error) {
        if (error instanceof ValidationError) {
          return authService.renderAuthView(res, "reset-password", {
            token: req.params.token,
            error: error.message,
          });
        }

        throw error;
      }
    })
  );

  if (authService.googleOAuthEnabled) {
    router.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
    router.get(
      "/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/login" }),
      (_req, res) => res.redirect("/")
    );
  }

  return router;
}
