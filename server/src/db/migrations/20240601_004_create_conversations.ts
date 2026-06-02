import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('conversations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('child_id').notNullable().references('id').inTable('children').onDelete('CASCADE');
    t.uuid('friend_id').notNullable().references('id').inTable('ai_friends').onDelete('CASCADE');
    t.timestamps(true, true);
    t.unique(['child_id', 'friend_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('conversations');
}
