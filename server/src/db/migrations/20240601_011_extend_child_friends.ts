import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('child_friends', (t) => {
    t.timestamp('activated_at').nullable();
    t.integer('friendship_level').defaultTo(1).notNullable();
    t.integer('friendship_xp').defaultTo(0).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('child_friends', (t) => {
    t.dropColumn('activated_at');
    t.dropColumn('friendship_level');
    t.dropColumn('friendship_xp');
  });
}
