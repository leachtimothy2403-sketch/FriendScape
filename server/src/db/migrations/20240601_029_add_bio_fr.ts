import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('ai_friends', (table) => {
    table.text('bio_fr').nullable().comment('French bio for AI friends');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('ai_friends', (table) => {
    table.dropColumn('bio_fr');
  });
}
