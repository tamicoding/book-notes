import { parseWithSchema, bookSchema, searchSchema } from "../validation/schemas.js";

const PAGE_SIZE = 9;

export function createBookService({ pool, fetchImpl, logger }) {
  async function fetchJson(url) {
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Falha ao consultar serviço externo: ${response.status}`);
    }
    return response.json();
  }

  async function fetchCoverFromOL(title, author) {
    if (!title) return null;

    const query = `https://openlibrary.org/search.json?title=${encodeURIComponent(
      title
    )}&author=${encodeURIComponent(author || "")}&limit=1`;

    try {
      const data = await fetchJson(query);
      if (data.docs?.length && data.docs[0].cover_i) {
        return `https://covers.openlibrary.org/b/id/${data.docs[0].cover_i}-M.jpg`;
      }
    } catch (error) {
      logger.warn("Falha ao buscar capa na OpenLibrary", {
        title,
        author,
        error: error.message,
      });
    }

    return null;
  }

  async function fetchCoverFromGoogle(title) {
    if (!title) return null;

    const query = `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(
      title
    )}`;

    try {
      const data = await fetchJson(query);
      const image =
        data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail ||
        data.items?.[0]?.volumeInfo?.imageLinks?.smallThumbnail;

      if (image) {
        return image.replace("http://", "https://");
      }
    } catch (error) {
      logger.warn("Falha ao buscar capa no Google Books", {
        title,
        error: error.message,
      });
    }

    return null;
  }

  function normalizeBookPayload(body) {
    return parseWithSchema(bookSchema, body);
  }

  async function getUserDates(userId) {
    const dates = await pool.query(
      `
      SELECT DISTINCT
        EXTRACT(YEAR FROM read_date) AS year,
        EXTRACT(MONTH FROM read_date) AS month,
        EXTRACT(DAY FROM read_date) AS day
      FROM books
      WHERE user_id = $1 AND read_date IS NOT NULL
      ORDER BY year DESC, month DESC, day DESC
      `,
      [userId]
    );

    return dates.rows;
  }

  async function getCoverUrl(title, author, currentCoverUrl = null) {
    const newCover =
      (await fetchCoverFromOL(title, author)) || (await fetchCoverFromGoogle(title));
    return newCover || currentCoverUrl;
  }

  async function listBooksByUser(userId) {
    const result = await pool.query(
      "SELECT * FROM books WHERE user_id = $1 ORDER BY id DESC",
      [userId]
    );
    return result.rows;
  }

  async function listBooksByUserPaginated(userId, page) {
    const totalItems = await countBooksByUser(userId);
    const pagination = buildPagination(page, totalItems);
    const result = await pool.query(
      `
      SELECT *
      FROM books
      WHERE user_id = $1
      ORDER BY id DESC
      LIMIT $2 OFFSET $3
      `,
      [userId, pagination.pageSize, pagination.offset]
    );

    return {
      books: result.rows,
      pagination,
    };
  }

  async function listBooksByYear(userId, year) {
    const result = await pool.query(
      `
      SELECT *
      FROM books
      WHERE user_id = $1
        AND EXTRACT(YEAR FROM read_date) = $2
      ORDER BY id DESC
      `,
      [userId, year]
    );

    return result.rows;
  }

  async function listBooksByYearPaginated(userId, year, page) {
    const totalItems = await countBooksByYear(userId, year);
    const pagination = buildPagination(page, totalItems);
    const result = await pool.query(
      `
      SELECT *
      FROM books
      WHERE user_id = $1
        AND EXTRACT(YEAR FROM read_date) = $2
      ORDER BY id DESC
      LIMIT $3 OFFSET $4
      `,
      [userId, year, pagination.pageSize, pagination.offset]
    );

    return {
      books: result.rows,
      pagination,
    };
  }

  async function listBooksByMonth(userId, year, month) {
    const result = await pool.query(
      `
      SELECT *
      FROM books
      WHERE user_id = $1
        AND EXTRACT(YEAR FROM read_date) = $2
        AND EXTRACT(MONTH FROM read_date) = $3
      ORDER BY id DESC
      `,
      [userId, year, month]
    );

    return result.rows;
  }

  async function listBooksByMonthPaginated(userId, year, month, page) {
    const totalItems = await countBooksByMonth(userId, year, month);
    const pagination = buildPagination(page, totalItems);
    const result = await pool.query(
      `
      SELECT *
      FROM books
      WHERE user_id = $1
        AND EXTRACT(YEAR FROM read_date) = $2
        AND EXTRACT(MONTH FROM read_date) = $3
      ORDER BY id DESC
      LIMIT $4 OFFSET $5
      `,
      [userId, year, month, pagination.pageSize, pagination.offset]
    );

    return {
      books: result.rows,
      pagination,
    };
  }

  async function listBooksByDay(userId, year, month, day) {
    const result = await pool.query(
      `
      SELECT *
      FROM books
      WHERE user_id = $1
        AND read_date IS NOT NULL
        AND EXTRACT(YEAR FROM read_date) = $2
        AND EXTRACT(MONTH FROM read_date) = $3
        AND EXTRACT(DAY FROM read_date) = $4
      ORDER BY read_date DESC
      `,
      [userId, year, month, day]
    );

    return result.rows;
  }

  async function listBooksByDayPaginated(userId, year, month, day, page) {
    const totalItems = await countBooksByDay(userId, year, month, day);
    const pagination = buildPagination(page, totalItems);
    const result = await pool.query(
      `
      SELECT *
      FROM books
      WHERE user_id = $1
        AND read_date IS NOT NULL
        AND EXTRACT(YEAR FROM read_date) = $2
        AND EXTRACT(MONTH FROM read_date) = $3
        AND EXTRACT(DAY FROM read_date) = $4
      ORDER BY read_date DESC
      LIMIT $5 OFFSET $6
      `,
      [userId, year, month, day, pagination.pageSize, pagination.offset]
    );

    return {
      books: result.rows,
      pagination,
    };
  }

  async function getBookByIdForUser(bookId, userId) {
    const result = await pool.query(
      "SELECT * FROM books WHERE id = $1 AND user_id = $2",
      [bookId, userId]
    );
    return result.rows[0] || null;
  }

  async function createBook(userId, body, options = {}) {
    const bookData = normalizeBookPayload(body);
    const manualCoverUrl = options.manualCoverUrl || null;
    const manualCoverPublicId = options.manualCoverPublicId || null;
    const coverUrl = manualCoverUrl
      ? null
      : await getCoverUrl(bookData.title, bookData.author);

    await pool.query(
      `
      INSERT INTO books (
        user_id,
        title,
        author,
        notes,
        rating,
        read_date,
        cover_url,
        manual_cover_url,
        manual_cover_public_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        userId,
        bookData.title,
        bookData.author,
        bookData.notes,
        bookData.rating,
        bookData.read_date,
        coverUrl,
        manualCoverUrl,
        manualCoverPublicId,
      ]
    );
  }

  async function updateBook(bookId, userId, body, options = {}) {
    const currentBook = await getBookByIdForUser(bookId, userId);
    if (!currentBook) {
      return null;
    }

    const bookData = normalizeBookPayload(body);
    let manualCoverUrl = currentBook.manual_cover_url || null;
    let manualCoverPublicId = currentBook.manual_cover_public_id || null;

    if (options.removeManualCover) {
      manualCoverUrl = null;
      manualCoverPublicId = null;
    }

    if (options.manualCoverUrl) {
      manualCoverUrl = options.manualCoverUrl;
      manualCoverPublicId = options.manualCoverPublicId || null;
    }

    const coverUrl = manualCoverUrl
      ? currentBook.cover_url
      : await getCoverUrl(bookData.title, bookData.author, currentBook.cover_url);

    await pool.query(
      `
      UPDATE books
      SET title = $1,
          author = $2,
          notes = $3,
          rating = $4,
          read_date = $5,
          cover_url = $6,
          manual_cover_url = $7,
          manual_cover_public_id = $8
      WHERE id = $9 AND user_id = $10
      `,
      [
        bookData.title,
        bookData.author,
        bookData.notes,
        bookData.rating,
        bookData.read_date,
        coverUrl,
        manualCoverUrl,
        manualCoverPublicId,
        bookId,
        userId,
      ]
    );

    return {
      ...currentBook,
      ...bookData,
      cover_url: coverUrl,
      manual_cover_url: manualCoverUrl,
      manual_cover_public_id: manualCoverPublicId,
    };
  }

  async function deleteBook(bookId, userId) {
    await pool.query("DELETE FROM books WHERE id = $1 AND user_id = $2", [
      bookId,
      userId,
    ]);
  }

  async function searchBooks(userId, rawSearch) {
    const { q: search } = parseWithSchema(searchSchema, { q: rawSearch });
    const query = `%${search.toLowerCase()}%`;
    const result = await pool.query(
      `
      SELECT *
      FROM books
      WHERE user_id = $1
        AND (LOWER(title) LIKE $2 OR LOWER(COALESCE(author, '')) LIKE $2)
      ORDER BY id DESC
      `,
      [userId, query]
    );

    return {
      search,
      books: result.rows,
    };
  }

  async function searchBooksPaginated(userId, rawSearch, page) {
    const { q: search } = parseWithSchema(searchSchema, { q: rawSearch });
    const query = `%${search.toLowerCase()}%`;
    const totalItems = await countSearchResults(userId, query);
    const pagination = buildPagination(page, totalItems);

    const result = await pool.query(
      `
      SELECT *
      FROM books
      WHERE user_id = $1
        AND (LOWER(title) LIKE $2 OR LOWER(COALESCE(author, '')) LIKE $2)
      ORDER BY id DESC
      LIMIT $3 OFFSET $4
      `,
      [userId, query, pagination.pageSize, pagination.offset]
    );

    return {
      search,
      books: result.rows,
      pagination,
    };
  }

  async function countBooksByUser(userId) {
    const result = await pool.query(
      "SELECT COUNT(*)::int AS total FROM books WHERE user_id = $1",
      [userId]
    );
    return result.rows[0]?.total || 0;
  }

  async function countBooksByYear(userId, year) {
    const result = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM books
      WHERE user_id = $1
        AND EXTRACT(YEAR FROM read_date) = $2
      `,
      [userId, year]
    );
    return result.rows[0]?.total || 0;
  }

  async function countBooksByMonth(userId, year, month) {
    const result = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM books
      WHERE user_id = $1
        AND EXTRACT(YEAR FROM read_date) = $2
        AND EXTRACT(MONTH FROM read_date) = $3
      `,
      [userId, year, month]
    );
    return result.rows[0]?.total || 0;
  }

  async function countBooksByDay(userId, year, month, day) {
    const result = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM books
      WHERE user_id = $1
        AND read_date IS NOT NULL
        AND EXTRACT(YEAR FROM read_date) = $2
        AND EXTRACT(MONTH FROM read_date) = $3
        AND EXTRACT(DAY FROM read_date) = $4
      `,
      [userId, year, month, day]
    );
    return result.rows[0]?.total || 0;
  }

  async function countSearchResults(userId, query) {
    const result = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM books
      WHERE user_id = $1
        AND (LOWER(title) LIKE $2 OR LOWER(COALESCE(author, '')) LIKE $2)
      `,
      [userId, query]
    );
    return result.rows[0]?.total || 0;
  }

  return {
    PAGE_SIZE,
    createBook,
    deleteBook,
    getBookByIdForUser,
    getUserDates,
    listBooksByDay,
    listBooksByDayPaginated,
    listBooksByMonth,
    listBooksByMonthPaginated,
    listBooksByUser,
    listBooksByUserPaginated,
    listBooksByYear,
    listBooksByYearPaginated,
    normalizeBookPayload,
    searchBooks,
    searchBooksPaginated,
    updateBook,
  };
}

function buildPagination(rawPage, totalItems) {
  const parsedPage = Number.parseInt(String(rawPage || "1"), 10);
  const safePage = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPage = Math.min(safePage, totalPages);

  return {
    currentPage,
    totalItems,
    totalPages,
    pageSize: PAGE_SIZE,
    offset: (currentPage - 1) * PAGE_SIZE,
    hasPreviousPage: currentPage > 1,
    hasNextPage: currentPage < totalPages,
  };
}
