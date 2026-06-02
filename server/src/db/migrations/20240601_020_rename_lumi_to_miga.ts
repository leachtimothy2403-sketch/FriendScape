import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex('ai_friends')
    .where({ name: 'Lumi' })
    .update({ name: 'Miga' });

  await knex('children')
    .where({ mascot: 'lumi' })
    .update({ mascot: 'miga' });
}

export async function down(knex: Knex): Promise<void> {
  await knex('ai_friends')
    .where({ name: 'Miga' })
    .update({ name: 'Lumi' });

  await knex('children')
    .where({ mascot: 'miga' })
    .update({ mascot: 'lumi' });
}
