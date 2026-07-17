import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://gesture:gesture@localhost:5432/gesturelab',
})

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gestures (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      frames JSONB NOT NULL,
      reaction JSONB NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    ALTER TABLE gestures
    ADD COLUMN IF NOT EXISTS samples JSONB NOT NULL DEFAULT '[]'::jsonb;
  `)

  // Migrate away from sync-key / workspace schema if present
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'gestures'
          AND column_name = 'workspace_id'
      ) THEN
        ALTER TABLE gestures DROP CONSTRAINT IF EXISTS gestures_workspace_id_fkey;
        ALTER TABLE gestures DROP COLUMN workspace_id;
      END IF;
      DROP TABLE IF EXISTS workspaces;
    END $$;
  `)
}
