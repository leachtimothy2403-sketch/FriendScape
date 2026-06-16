import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url TEXT');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE posts DROP COLUMN IF EXISTS image_url');
}
