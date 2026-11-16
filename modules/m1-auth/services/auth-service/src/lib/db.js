import mysql from 'mysql2/promise'

// One connection pool per service. Use 127.0.0.1, not localhost: on some hosts
// localhost resolves to IPv6 (::1), which the MySQL user may not be allowed from.
export const db = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'minsu_disciplinary',
  connectionLimit: 10,
  dateStrings: true, // DATE / DATETIME come back as plain strings, no timezone shifts
})

// Run fn(conn) inside a transaction; commits on success, rolls back on any error
export async function transaction(fn) {
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}
