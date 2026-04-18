import { randomBytes, timingSafeEqual } from "crypto";

function generateCsrfToken() {
  return randomBytes(32).toString("hex");
}

function tokensMatch(sessionToken, requestToken) {
  if (!sessionToken || !requestToken) {
    return false;
  }

  const sessionBuffer = Buffer.from(sessionToken);
  const requestBuffer = Buffer.from(requestToken);

  if (sessionBuffer.length !== requestBuffer.length) {
    return false;
  }

  return timingSafeEqual(sessionBuffer, requestBuffer);
}

export function csrfProtection(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCsrfToken();
  }

  res.locals.csrfToken = req.session.csrfToken;

  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const requestToken = req.body?._csrf || req.query?._csrf || req.get("x-csrf-token");

  if (!tokensMatch(req.session.csrfToken, requestToken)) {
    return res.status(403).send("Token CSRF inválido.");
  }

  return next();
}
