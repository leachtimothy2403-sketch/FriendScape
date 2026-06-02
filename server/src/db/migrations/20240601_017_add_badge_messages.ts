import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('badge_definitions', (t) => {
    t.text('lumi_message').nullable();
    t.text('lumi_message_fr').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('badge_definitions', (t) => {
    t.dropColumn('lumi_message');
    t.dropColumn('lumi_message_fr');
  });
}
