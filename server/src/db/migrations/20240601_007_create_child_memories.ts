import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('child_memories', (t) => {
    t.uuid('child_id').notNullable().references('id').inTable('children').onDelete('CASCADE');
    t.uuid('friend_id').notNullable().references('id').inTable('ai_friends').onDelete('CASCADE');
    t.jsonb('facts').defaultTo('[]');
    t.jsonb('emotional_history').defaultTo('[]');
    t.jsonb('milestones').defaultTo('[]');
    t.timestamp('last_updated').defaultTo(knex.fn.now());
    t.primary(['child_id', 'friend_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('child_memories');
}
