import { Router, Response } from 'express';
import { generateUUID } from '../db/sqlite.js';
import { pool } from '../db/pool.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

type IdeaBody = {
  title?: string;
  lyrics?: string;
  notes?: string;
};

function cleanTitle(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function clipText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

async function assertIdeaOwner(ideaId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT user_id FROM lyric_ideas WHERE id = $1',
    [ideaId]
  );
  return result.rows.length > 0 && result.rows[0].user_id === userId;
}

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, title, lyrics, notes, created_at, updated_at
       FROM lyric_ideas
       WHERE user_id = $1
       ORDER BY updated_at DESC, created_at DESC`,
      [req.user!.id]
    );
    res.json({ ideas: result.rows });
  } catch (error) {
    console.error('Get lyric ideas error:', error);
    res.status(500).json({ error: 'Failed to load ideas' });
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body as IdeaBody;
    const title = cleanTitle(body.title, 120) || 'Untitled idea';
    const lyrics = clipText(body.lyrics, 20_000);
    const notes = clipText(body.notes, 2_000);
    const id = generateUUID();

    const result = await pool.query(
      `INSERT INTO lyric_ideas (id, user_id, title, lyrics, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, datetime('now'), datetime('now'))
       RETURNING id, title, lyrics, notes, created_at, updated_at`,
      [id, req.user!.id, title, lyrics, notes]
    );

    res.status(201).json({ idea: result.rows[0] });
  } catch (error) {
    console.error('Create lyric idea error:', error);
    res.status(500).json({ error: 'Failed to create idea' });
  }
});

router.patch('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const owned = await assertIdeaOwner(req.params.id, req.user!.id);
    if (!owned) {
      res.status(404).json({ error: 'Idea not found' });
      return;
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    const body = req.body as IdeaBody;

    if (body.title !== undefined) {
      const title = cleanTitle(body.title, 120);
      if (!title) {
        res.status(400).json({ error: 'Title is required' });
        return;
      }
      updates.push(`title = $${paramCount}`);
      values.push(title);
      paramCount += 1;
    }

    if (body.lyrics !== undefined) {
      updates.push(`lyrics = $${paramCount}`);
      values.push(clipText(body.lyrics, 20_000));
      paramCount += 1;
    }

    if (body.notes !== undefined) {
      updates.push(`notes = $${paramCount}`);
      values.push(clipText(body.notes, 2_000));
      paramCount += 1;
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE lyric_ideas
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING id, title, lyrics, notes, created_at, updated_at`,
      values
    );

    res.json({ idea: result.rows[0] });
  } catch (error) {
    console.error('Update lyric idea error:', error);
    res.status(500).json({ error: 'Failed to update idea' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const owned = await assertIdeaOwner(req.params.id, req.user!.id);
    if (!owned) {
      res.status(404).json({ error: 'Idea not found' });
      return;
    }

    await pool.query('DELETE FROM lyric_ideas WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete lyric idea error:', error);
    res.status(500).json({ error: 'Failed to delete idea' });
  }
});

export default router;
