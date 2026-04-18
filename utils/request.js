export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeEmail(email) {
  return normalizeText(email).toLowerCase();
}
