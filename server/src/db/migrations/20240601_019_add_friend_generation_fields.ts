import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ai_friends', (t) => {
    t.string('relationship_type', 30).nullable();
    t.uuid('generated_for_friend_id')
      .nullable()
      .references('id').inTable('ai_friends').onDelete('SET NULL');
    t.boolean('is_generated').defaultTo(false).notNullable();
    t.jsonb('generation_context').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ai_friends', (t) => {
    t.dropColumn('relationship_type');
    t.dropColumn('generated_for_friend_id');
    t.dropColumn('is_generated');
    t.dropColumn('generation_context');
  });
}
