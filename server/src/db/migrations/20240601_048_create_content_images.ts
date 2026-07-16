import { Knex } from 'knex';

// Curated library of reusable educational/illustrative images an AI friend (e.g.
// Jules) can attach to a chat reply. Starts empty and grows organically: when a
// friend wants to show something and no existing row matches by tag, one is
// generated on the fly (same pipeline as post images) and saved here so every
// future request for that topic is instant instead of regenerating each time.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('content_images', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.specificType('tags', 'text[]').notNullable().defaultTo('{}');
    t.text('description_en').notNullable();
    t.text('description_fr').notNullable();
    t.text('image_url').notNullable();
    t.string('category', 60).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());

    t.index('tags', 'content_images_tags_gin', 'gin');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('content_images');
}
