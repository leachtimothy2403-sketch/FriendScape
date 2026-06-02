import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('children', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('parent_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('name', 100).notNullable();
    t.integer('age').notNullable();
    t.string('gender', 20).defaultTo('preferNotToSay');
    t.string('language', 10).defaultTo('en');
    t.jsonb('special_needs').defaultTo('[]');
    t.boolean('pre_reader').defaultTo(false);
    t.string('avatar_theme', 30).defaultTo('animals');
    t.string('mascot', 30).defaultTo('luna');
    t.jsonb('interests').defaultTo('[]');
    t.string('selected_pack', 100).nullable();
    t.string('avatar_url', 500).nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('child_friends', (t) => {
    t.uuid('child_id').notNullable().references('id').inTable('children').onDelete('CASCADE');
    t.uuid('friend_id').notNullable();
    t.timestamps(true, true);
    t.primary(['child_id', 'friend_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('child_friends');
  await knex.schema.dropTable('children');
}
