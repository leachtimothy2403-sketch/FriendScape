import { Knex } from 'knex';

// The fixed "network friends" (Léa, Tom, Chloé, Hugo, Nico, Camille, Luca, Sofia)
// and their hub characters (Mia, Jake) were removed from 01_ai_friends.ts — every
// AI friend a child has (other than the star friends) is generated uniquely for
// that child via generatePersonalisedFriends/generateFriendNetwork at onboarding,
// not drawn from a shared seeded roster. This seed is now a no-op, kept only so
// the file numbering/history isn't disturbed. Safe to delete outright later.
export async function seed(knex: Knex): Promise<void> {
  await knex('ai_friend_network').del();
}
