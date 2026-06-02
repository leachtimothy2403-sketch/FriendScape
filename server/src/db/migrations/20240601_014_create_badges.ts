import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('badge_definitions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 100).notNullable();
    t.text('description').notNullable();
    t.string('icon', 10).notNullable();
    t.enum('category', ['kindness', 'learning', 'social', 'milestone', 'special']).notNullable();
    t.integer('xp_required').nullable();
    t.string('trigger_type', 50).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());

    t.index('trigger_type');
  });

  await knex.schema.createTable('child_badges', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('child_id').notNullable().references('id').inTable('children').onDelete('CASCADE');
    t.uuid('badge_id').notNullable().references('id').inTable('badge_definitions').onDelete('CASCADE');
    t.timestamp('earned_at').defaultTo(knex.fn.now());
    t.boolean('seen').defaultTo(false);

    t.unique(['child_id', 'badge_id']);
    t.index('child_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('child_badges');
  await knex.schema.dropTableIfExists('badge_definitions');
}
