import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('children', (table) => {
    table.jsonb('avatar_config').nullable();
    table.string('avatar_background').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('children', (table) => {
    table.dropColumn('avatar_config');
    table.dropColumn('avatar_background');
  });
}
