// Conexão com o banco de dados (PostgreSQL).
// Exporta um `Pool` reutilizável para queries em todo o app.
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Se `DATABASE_URL` estiver presente (ex.: Heroku), usa-a com SSL condicional.
// Caso contrário, usa variáveis individuais (DB_USER, DB_HOST, etc.).
export const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
      }
);