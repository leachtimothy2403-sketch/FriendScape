import { Request, Response } from 'express';
import { cartoonifyPhoto, generateMascotAvatar } from '../services/avatar.service';
import db from '../db';

export async function generateChildAvatar(req: Request, res: Response) {
  const { imageBase64 } = req.body as { imageBase64?: string };

  if (!imageBase64?.trim()) {
    res.status(400).json({ error: 'imageBase64 is required' });
    return;
  }

  try {
    const cartoonUrl = await cartoonifyPhoto(imageBase64);
    res.json({ cartoonUrl });
  } catch (err) {
    console.error('[avatar] generateChildAvatar error:', err);
    res.status(500).json({ error: 'Avatar generation failed' });
  }
}

export async function getMascotAvatars(_req: Request, res: Response) {
  try {
    const rows = await db('mascot_avatars').select('id', 'avatar_url');
    const map: Record<string, string> = {};
    for (const r of rows) map[r.id] = r.avatar_url;
    res.json({ mascots: map });
  } catch (err) {
    console.error('[avatar] getMascotAvatars error:', err);
    res.status(500).json({ error: 'Failed to fetch mascot avatars' });
  }
}

export async function generateMascotAvatars(_req: Request, res: Response) {
  if (process.env.NODE_ENV !== 'development') {
    res.status(403).json({ error: 'Dev only' });
    return;
  }

  try {
    const mascots = ['miga', 'pixel', 'finn', 'sage'];
    const results: Record<string, string> = {};

    for (const id of mascots) {
      const existing = await db('mascot_avatars').where({ id }).first();
      if (existing) {
        results[id] = existing.avatar_url;
        continue;
      }

      const url = await generateMascotAvatar(id);
      await db('mascot_avatars').insert({ id, avatar_url: url });
      results[id] = url;
    }

    res.json({ mascots: results });
  } catch (err) {
    console.error('[avatar] generateMascotAvatars error:', err);
    res.status(500).json({ error: 'Mascot avatar generation failed' });
  }
}
