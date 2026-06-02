import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('messages', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('conversation_id').notNullable().references('id').inTable('conversations').onDelete('CASCADE');
    t.uuid('sender_id').notNullable();
    t.string('sender_type', 10).notNullable(); // 'child' | 'ai'
    t.text('content').notNullable();
    t.string('media_type', 20).defaultTo('text');
    t.string('media_url', 500).nullable();
    t.boolean('read').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());

    t.index(['conversation_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('messages');
}
