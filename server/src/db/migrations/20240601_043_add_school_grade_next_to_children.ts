import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('children', (t) => {
    t.string('school_grade_next', 20).nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('children', (t) => {
    t.dropColumn('school_grade_next');
  });
}
