import { Router, Response } from 'express';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { generateSpeech } from '../services/audio.service';

const router = Router();

// POST /audio/generate
// Requires child JWT.  Returns a URL to the generated mp3.
router.post('/generate', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { text, characterId, language, messageId } = req.body as {
      text?: string;
      characterId?: string;
      language?: string;
      messageId?: string;
    };

    if (!text?.trim())        { res.status(400).json({ error: 'text is required' });        return; }
    if (!characterId?.trim()) { res.status(400).json({ error: 'characterId is required' }); return; }

    const lang = language === 'fr' ? 'fr' : 'en';
    const cacheKey = messageId
      ? `${characterId.toLowerCase()}_${lang}_msg_${messageId}`
      : undefined;

    const audioUrl = await generateSpeech(text.trim(), characterId.trim(), lang, cacheKey);

    res.json({ audioUrl });
  } catch (err) {
    console.error('[audio] generateSpeech error:', err);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
});

export default router;
