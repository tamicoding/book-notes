import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype?.startsWith("image/")) {
      callback(null, true);
      return;
    }

    callback(new Error("Envie uma imagem válida para a capa."));
  },
});

export function handleOptionalBookCoverUpload(req, res, next) {
  if (!req.is("multipart/form-data")) {
    return next();
  }

  return upload.single("cover_image")(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      req.coverUploadError = "A imagem da capa pode ter no máximo 5 MB.";
      return next();
    }

    req.coverUploadError = error.message || "Não foi possível processar a imagem enviada.";
    return next();
  });
}
