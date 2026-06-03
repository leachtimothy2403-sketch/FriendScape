import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('children', (t) => {
    t.jsonb('personality_traits').nullable();
    t.text('personality_free_text').nullable();
    t.boolean('personality_completed').defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('children', (t) => {
    t.dropColumn('personality_traits');
    t.dropColumn('personality_free_text');
    t.dropColumn('personality_completed');
  });
}
