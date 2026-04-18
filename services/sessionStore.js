import session from "express-session";

const DEFAULT_TABLE_NAME = "user_sessions";

export function createSessionStore({ pool, logger, tableName = DEFAULT_TABLE_NAME }) {
  return new PgSessionStore({ pool, logger, tableName });
}

class PgSessionStore extends session.Store {
  constructor({ pool, logger, tableName }) {
    super();
    this.pool = pool;
    this.logger = logger;
    this.tableName = tableName;
    this.pruneTimer = null;
    this.startPruneJob();
  }

  startPruneJob() {
    if (this.pruneTimer) return;

    this.pruneTimer = setInterval(() => {
      this.pruneExpiredSessions().catch((error) => {
        this.logger.warn("Falha ao limpar sessões expiradas", {
          error: error.message,
        });
      });
    }, 1000 * 60 * 15);

    this.pruneTimer.unref?.();
  }

  async pruneExpiredSessions() {
    await this.pool.query(
      `DELETE FROM ${this.tableName} WHERE expire < NOW()`
    );
  }

  get(sid, callback) {
    this.pool
      .query(
        `SELECT sess
         FROM ${this.tableName}
         WHERE sid = $1
           AND expire >= NOW()`,
        [sid]
      )
      .then(({ rows }) => callback(null, rows[0]?.sess || null))
      .catch((error) => callback(error));
  }

  set(sid, sessionData, callback = () => {}) {
    const expire = getExpirationDate(sessionData);

    this.pool
      .query(
        `
        INSERT INTO ${this.tableName} (sid, sess, expire)
        VALUES ($1, $2, $3)
        ON CONFLICT (sid)
        DO UPDATE SET
          sess = EXCLUDED.sess,
          expire = EXCLUDED.expire
        `,
        [sid, sessionData, expire]
      )
      .then(() => callback(null))
      .catch((error) => callback(error));
  }

  destroy(sid, callback = () => {}) {
    this.pool
      .query(`DELETE FROM ${this.tableName} WHERE sid = $1`, [sid])
      .then(() => callback(null))
      .catch((error) => callback(error));
  }

  touch(sid, sessionData, callback = () => {}) {
    const expire = getExpirationDate(sessionData);

    this.pool
      .query(
        `
        UPDATE ${this.tableName}
        SET expire = $2,
            sess = $3
        WHERE sid = $1
        `,
        [sid, expire, sessionData]
      )
      .then(() => callback(null))
      .catch((error) => callback(error));
  }
}

function getExpirationDate(sessionData) {
  if (sessionData?.cookie?.expires) {
    return new Date(sessionData.cookie.expires);
  }

  const maxAge = Number(sessionData?.cookie?.maxAge || 1000 * 60 * 60 * 24);
  return new Date(Date.now() + maxAge);
}
