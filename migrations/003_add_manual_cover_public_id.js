export const up = (pgm) => {
  pgm.addColumn("books", {
    manual_cover_public_id: { type: "text" },
  });
};

export const down = (pgm) => {
  pgm.dropColumn("books", "manual_cover_public_id");
};
