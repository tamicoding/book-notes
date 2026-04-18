export const up = (pgm) => {
  pgm.addColumn("books", {
    manual_cover_url: { type: "text" },
  });
};

export const down = (pgm) => {
  pgm.dropColumn("books", "manual_cover_url");
};
