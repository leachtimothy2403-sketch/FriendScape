import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('ai_friend_network', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('ai_friend_id')
      .notNullable()
      .references('id').inTable('ai_friends').onDelete('CASCADE');
    t.uuid('connected_friend_id')
      .notNullable()
      .references('id').inTable('ai_friends').onDelete('CASCADE');
    // close_friend | classmate | neighbour | cousin | teammate | star | online_friend
    t.string('relationship_type', 30).notNullable();
    t.string('relationship_description', 500).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());

    t.unique(['ai_friend_id', 'connected_friend_id']);
    t.index('ai_friend_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('ai_friend_network');
}
