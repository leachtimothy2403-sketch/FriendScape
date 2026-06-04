import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ai_friends', (t) => {
    t.string('voice_id', 100).nullable();
    t.string('voice_model', 50).nullable().defaultTo('eleven_multilingual_v2');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ai_friends', (t) => {
    t.dropColumn('voice_id');
    t.dropColumn('voice_model');
  });
}
