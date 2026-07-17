import { randomUUID } from 'node:crypto'
import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://gesture:gesture@localhost:5432/gesturelab',
})

export { randomUUID }

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id UUID PRIMARY KEY,
      sync_key TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gestures (
      id TEXT PRIMARY KEY,
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      frames JSONB NOT NULL,
      reaction JSONB NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS gestures_workspace_idx ON gestures(workspace_id);
  `)
}
