import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ai_friends', (t) => {
    t.string('gemini_voice_name', 50).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ai_friends', (t) => {
    t.dropColumn('gemini_voice_name');
  });
}
