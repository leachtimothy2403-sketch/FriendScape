import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('ai_friends', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 100).notNullable();
    t.jsonb('personality').defaultTo('[]');
    t.jsonb('interests').defaultTo('[]');
    t.string('avatar_style', 30).defaultTo('cartoon');
    t.string('avatar_url', 500).nullable();
    t.boolean('is_star_friend').defaultTo(false);
    t.boolean('is_teacher').defaultTo(false);
    t.text('bio').nullable();
    t.text('greeting').nullable();
    t.string('pack_id', 100).nullable();
    t.timestamps(true, true);
  });

  // Update child_friends to properly reference ai_friends
  await knex.schema.alterTable('child_friends', (t) => {
    t.foreign('friend_id').references('id').inTable('ai_friends').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('child_friends', (t) => {
    t.dropForeign(['friend_id']);
  });
  await knex.schema.dropTable('ai_friends');
}
