import { Router, Request, Response } from 'express';
import { generateSpeech, generateSpeechStream, transcribeAudio } from '../services/audio.service';
import rateLimit from 'express-rate-limit';

const router = Router();

const audioLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please wait a moment and try again.' },
});

// POST /audio/generate
// Auth optional — works during onboarding before child account is created.
router.post('/generate', audioLimiter, async (req: Request, res: Response) => {
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

// POST /audio/transcribe
// Auth optional — works during onboarding before child account is created.
router.post('/transcribe', audioLimiter, async (req: Request, res: Response) => {
  try {
    const { audioBase64, mimeType, language } = req.body as {
      audioBase64?: string;
      mimeType?: string;
      language?: string;
    };
    if (!audioBase64?.trim()) {
      res.status(400).json({ error: 'audioBase64 is required' });
      return;
    }
    const transcript = await transcribeAudio(audioBase64, mimeType ?? 'audio/m4a', language);
    res.json({ transcript });
  } catch (err) {
    console.error('[audio] transcribeAudio error:', err);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

// GET /audio/stream — streams audio directly to client
router.get('/stream', audioLimiter, async (req: Request, res: Response) => {
  try {
    const { text, characterId, language, messageId } = req.query as {
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

    await generateSpeechStream(text.trim(), characterId.trim(), lang, res, cacheKey);
  } catch (err) {
    console.error('[audio] stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream audio' });
    }
  }
});

export default router;
