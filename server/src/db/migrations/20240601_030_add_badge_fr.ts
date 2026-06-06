import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('badge_definitions', (table) => {
    table.string('name_fr').nullable().comment('French name for badge');
    table.text('description_fr').nullable().comment('French description for badge');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('badge_definitions', (table) => {
    table.dropColumn('name_fr');
    table.dropColumn('description_fr');
  });
}
