export const up = (pgm) => {
  pgm.createTable("users", {
    id: "id",
    name: { type: "varchar(255)", notNull: true },
    email: { type: "varchar(255)", notNull: true, unique: true },
    password: { type: "varchar(255)" },
    google_id: { type: "varchar(255)", unique: true },
    reset_token: { type: "varchar(255)" },
    reset_token_expires: { type: "timestamptz" },
  });

  pgm.createIndex("users", "reset_token", {
    name: "users_reset_token_idx",
  });

  pgm.createTable("books", {
    id: "id",
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "CASCADE",
    },
    title: { type: "varchar(255)", notNull: true },
    author: { type: "varchar(255)" },
    notes: { type: "text" },
    rating: { type: "integer" },
    read_date: { type: "date" },
    cover_url: { type: "text" },
  });

  pgm.createIndex("books", "user_id", {
    name: "books_user_id_idx",
  });

  pgm.createTable("user_sessions", {
    sid: { type: "varchar(255)", primaryKey: true },
    sess: { type: "json", notNull: true },
    expire: { type: "timestamptz", notNull: true },
  });

  pgm.createIndex("user_sessions", "expire", {
    name: "user_sessions_expire_idx",
  });
};

export const down = (pgm) => {
  pgm.dropTable("user_sessions");
  pgm.dropTable("books");
  pgm.dropTable("users");
};
