import mysql from "mysql2/promise";
import "dotenv/config";

export const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "campushub",
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});

/** Quick startup check so a bad connection fails loudly, not silently. */
export async function assertDbConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.query("SELECT 1");
  } finally {
    conn.release();
  }
}
