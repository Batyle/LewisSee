import { Router } from 'express';
import { login, me } from '../controllers/adminAuthController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = Router();
router.post('/login', login);
router.get('/me', authMiddleware, me);
export default router;
