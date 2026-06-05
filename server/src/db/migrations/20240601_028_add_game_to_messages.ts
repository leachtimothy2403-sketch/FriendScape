import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('messages', (t) => {
    t.string('message_type', 30).defaultTo('text');
    t.jsonb('game_state').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('messages', (t) => {
    t.dropColumn('message_type');
    t.dropColumn('game_state');
  });
}
