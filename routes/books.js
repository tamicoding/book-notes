import express from "express";

import { ensureAuth } from "../middleware/auth.js";
import { handleOptionalBookCoverUpload } from "../middleware/bookCoverUpload.js";
import { asyncHandler } from "../utils/request.js";
import { ValidationError } from "../utils/validation.js";

export function createBookRouter({ bookService, mediaService }) {
  const router = express.Router();

  function formatDateFilterLabel({ year, month, day }) {
    if (year && month && day) {
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      return date.toLocaleDateString("pt-BR");
    }

    if (year && month) {
      const date = new Date(Number(year), Number(month) - 1, 1);
      return date.toLocaleString("pt-BR", {
        month: "long",
        year: "numeric",
      });
    }

    return String(year);
  }

  async function renderBooksPage(res, userId, payload) {
    const dates = res.locals.dates?.length
      ? res.locals.dates
      : await bookService.getUserDates(userId);
    const feedbackMap = {
      created: "Livro adicionado com sucesso.",
      updated: "Livro atualizado com sucesso.",
      deleted: "Livro removido com sucesso.",
    };

    return res.render("index", {
      books: payload.books,
      search: payload.search || "",
      dates,
      pagination: payload.pagination,
      paginationBasePath: payload.paginationBasePath || "/",
      paginationQuery: payload.paginationQuery || {},
      activeFilter: payload.activeFilter || null,
      activeView: payload.activeView || {
        type: "all",
        label: "Todos os livros",
        description: "Sua biblioteca completa.",
      },
      message: feedbackMap[payload.search ? null : res.req.query.status] || null,
      messageType: "success",
    });
  }

  function getPage(req) {
    const page = Number.parseInt(String(req.query.page || "1"), 10);
    return Number.isNaN(page) || page < 1 ? 1 : page;
  }

  function buildPaginationQuery(query = {}) {
    const nextQuery = { ...query };
    Object.keys(nextQuery).forEach((key) => {
      if (nextQuery[key] === undefined || nextQuery[key] === null || nextQuery[key] === "") {
        delete nextQuery[key];
      }
    });
    return nextQuery;
  }

  function buildBookFormData(body = {}) {
    return {
      title: body.title || "",
      author: body.author || "",
      notes: body.notes || "",
      rating: body.rating || "",
      read_date: body.read_date || "",
      remove_manual_cover: body.remove_manual_cover || "",
    };
  }

  async function uploadManualCoverOrThrow(req, userId) {
    if (!req.file) {
      return null;
    }

    try {
      return await mediaService.uploadBookCover(req.file, userId);
    } catch (error) {
      throw new ValidationError(
        "Não foi possível enviar a capa manual agora. Tente novamente em instantes."
      );
    }
  }

  router.get(
    "/",
    ensureAuth,
    asyncHandler(async (req, res) => {
      const result = await bookService.listBooksByUserPaginated(req.user.id, getPage(req));
      return renderBooksPage(res, req.user.id, {
        ...result,
        paginationBasePath: "/",
        activeView: {
          type: "all",
          label: "Todos os livros",
          description: "Sua biblioteca completa, do mais recente para o mais antigo.",
        },
      });
    })
  );

  router.get(
    "/filter/date/:year/:month/:day",
    ensureAuth,
    asyncHandler(async (req, res) => {
      const { year, month, day } = req.params;
      const result = await bookService.listBooksByDayPaginated(
        req.user.id,
        year,
        month,
        day,
        getPage(req)
      );
      return renderBooksPage(res, req.user.id, {
        ...result,
        paginationBasePath: `/filter/date/${year}/${month}/${day}`,
        activeView: {
          type: "date",
          label: `Filtro por data: ${formatDateFilterLabel({ year, month, day })}`,
          description: "Mostrando apenas os livros lidos nesta data.",
        },
        activeFilter: {
          year: String(year),
          month: String(month),
          day: String(day),
        },
      });
    })
  );

  router.get(
    "/filter/date/:year/:month",
    ensureAuth,
    asyncHandler(async (req, res) => {
      const { year, month } = req.params;
      const result = await bookService.listBooksByMonthPaginated(
        req.user.id,
        year,
        month,
        getPage(req)
      );
      return renderBooksPage(res, req.user.id, {
        ...result,
        paginationBasePath: `/filter/date/${year}/${month}`,
        activeView: {
          type: "date",
          label: `Filtro por mês: ${formatDateFilterLabel({ year, month })}`,
          description: "Mostrando apenas os livros lidos neste mês.",
        },
        activeFilter: {
          year: String(year),
          month: String(month),
          day: null,
        },
      });
    })
  );

  router.get(
    "/filter/date/:year",
    ensureAuth,
    asyncHandler(async (req, res) => {
      const { year } = req.params;
      const result = await bookService.listBooksByYearPaginated(
        req.user.id,
        year,
        getPage(req)
      );
      return renderBooksPage(res, req.user.id, {
        ...result,
        paginationBasePath: `/filter/date/${year}`,
        activeView: {
          type: "date",
          label: `Filtro por ano: ${formatDateFilterLabel({ year })}`,
          description: "Mostrando apenas os livros lidos neste ano.",
        },
        activeFilter: {
          year: String(year),
          month: null,
          day: null,
        },
      });
    })
  );

  router.get("/books/add", ensureAuth, (_req, res) =>
    res.render("addBook", {
      error: null,
      formData: buildBookFormData(),
    })
  );

  router.post(
    "/books/add",
    ensureAuth,
    handleOptionalBookCoverUpload,
    asyncHandler(async (req, res) => {
      let uploadedCover = null;

      if (req.coverUploadError) {
        return res.status(400).render("addBook", {
          error: req.coverUploadError,
          formData: buildBookFormData(req.body),
        });
      }

      try {
        uploadedCover = await uploadManualCoverOrThrow(req, req.user.id);
        await bookService.createBook(req.user.id, req.body, {
          manualCoverUrl: uploadedCover?.url,
          manualCoverPublicId: uploadedCover?.publicId,
        });
      } catch (error) {
        if (uploadedCover?.publicId) {
          await mediaService.deleteBookCover(uploadedCover.publicId);
        }

        if (error instanceof ValidationError) {
          return res.status(400).render("addBook", {
            error: error.message,
            formData: buildBookFormData(req.body),
          });
        }

        throw error;
      }

      return res.redirect("/?status=created");
    })
  );

  router.get(
    "/books/edit/:id",
    ensureAuth,
    asyncHandler(async (req, res) => {
      const book = await bookService.getBookByIdForUser(req.params.id, req.user.id);
      if (!book) {
        return res.status(404).render("status", {
          title: "Livro não encontrado",
          heading: "Livro não encontrado",
          message:
            "Esse livro não existe mais ou não está disponível para a sua conta.",
          primaryLabel: "Voltar para a lista",
          primaryHref: "/",
          secondaryLabel: "Adicionar novo livro",
          secondaryHref: "/books/add",
          icon: "!",
        });
      }

      return res.render("editBook", { book, error: null });
    })
  );

  router.post(
    "/books/edit/:id",
    ensureAuth,
    handleOptionalBookCoverUpload,
    asyncHandler(async (req, res) => {
      let updatedBook;
      let uploadedCover = null;
      const currentBook = await bookService.getBookByIdForUser(req.params.id, req.user.id);

      if (!currentBook) {
        return res.status(404).render("status", {
          title: "Livro não encontrado",
          heading: "Não foi possível editar",
          message:
            "O livro que você tentou editar não foi encontrado ou não pertence à sua conta.",
          primaryLabel: "Voltar para a lista",
          primaryHref: "/",
          secondaryLabel: "Adicionar novo livro",
          secondaryHref: "/books/add",
          icon: "!",
        });
      }

      if (req.coverUploadError) {
        return res.status(400).render("editBook", {
          book: {
            ...currentBook,
            ...buildBookFormData(req.body),
          },
          error: req.coverUploadError,
        });
      }

      try {
        uploadedCover = await uploadManualCoverOrThrow(req, req.user.id);
        updatedBook = await bookService.updateBook(req.params.id, req.user.id, req.body, {
          manualCoverUrl: uploadedCover?.url,
          manualCoverPublicId: uploadedCover?.publicId,
          removeManualCover: req.body.remove_manual_cover === "1",
        });
      } catch (error) {
        if (uploadedCover?.publicId) {
          await mediaService.deleteBookCover(uploadedCover.publicId);
        }

        if (error instanceof ValidationError) {
          const book = {
            ...currentBook,
            ...buildBookFormData(req.body),
          };

          return res.status(400).render("editBook", {
            book,
            error: error.message,
          });
        }

        throw error;
      }

      if (req.file && currentBook.manual_cover_public_id) {
        await mediaService.deleteBookCover(currentBook.manual_cover_public_id);
      }

      if (
        req.body.remove_manual_cover === "1" &&
        currentBook.manual_cover_public_id &&
        !req.file
      ) {
        await mediaService.deleteBookCover(currentBook.manual_cover_public_id);
      }

      return res.redirect("/?status=updated");
    })
  );

  router.get(
    "/books/delete/:id",
    ensureAuth,
    asyncHandler(async (req, res) => {
      const book = await bookService.getBookByIdForUser(req.params.id, req.user.id);
      if (!book) {
        return res.status(404).render("status", {
          title: "Livro não encontrado",
          heading: "Nada para excluir aqui",
          message:
            "O livro que você tentou remover não foi encontrado ou já foi excluído.",
          primaryLabel: "Voltar para a lista",
          primaryHref: "/",
          secondaryLabel: "Adicionar novo livro",
          secondaryHref: "/books/add",
          icon: "!",
        });
      }

      return res.render("deleteBook", { book, error: null });
    })
  );

  router.post(
    "/books/delete/:id",
    ensureAuth,
    asyncHandler(async (req, res) => {
      const book = await bookService.getBookByIdForUser(req.params.id, req.user.id);
      if (!book) {
        return res.status(404).render("status", {
          title: "Livro não encontrado",
          heading: "Não foi possível excluir",
          message:
            "O livro que você tentou excluir não foi encontrado ou já foi removido.",
          primaryLabel: "Voltar para a lista",
          primaryHref: "/",
          icon: "!",
        });
      }

      if (book.manual_cover_url) {
        await mediaService.deleteBookCover(book.manual_cover_public_id);
      }

      await bookService.deleteBook(req.params.id, req.user.id);
      return res.redirect("/?status=deleted");
    })
  );

  router.get(
    "/search",
    ensureAuth,
    asyncHandler(async (req, res) => {
      const result = await bookService.searchBooksPaginated(
        req.user.id,
        req.query.q,
        getPage(req)
      );
      return renderBooksPage(res, req.user.id, {
        ...result,
        paginationBasePath: "/search",
        paginationQuery: buildPaginationQuery({ q: result.search }),
        activeView: {
          type: "search",
          label: `Busca ativa: "${result.search}"`,
          description: "Resultados filtrados por titulo ou autor.",
        },
      });
    })
  );

  return router;
}
