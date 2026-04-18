export function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.redirect("/login");
}

export function ensureGuest(req, res, next) {
  if (!req.isAuthenticated()) return next();
  return res.redirect("/");
}
