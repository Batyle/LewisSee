import { Router } from 'express';
import pool from '../db.js';

const router = Router();
router.get('/', async (req, res, next) => {
  try {
    const [blocks] = await pool.execute('SELECT id, name, schedule FROM blocks ORDER BY name ASC');
    res.json({ blocks });
  } catch (error) {
    next(error);
  }
});
export default router;
