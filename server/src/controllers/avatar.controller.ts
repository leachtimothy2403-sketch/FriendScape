import { Request, Response } from 'express';
import { cartoonifyPhoto } from '../services/avatar.service';

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
