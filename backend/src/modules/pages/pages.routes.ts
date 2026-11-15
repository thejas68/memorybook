import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/roleGuard';
import { getPages, createPage, updatePage, deletePage } from './pages.controller';

const router = Router({ mergeParams: true }); // mergeParams to access :bookId

// Everyone in the book can read; only owner/contributor can write.
// Per-page rules (author vs owner) are enforced in the controller.
router.get('/', requireAuth, requireRole('owner', 'contributor', 'viewer'), getPages);
router.post('/', requireAuth, requireRole('owner', 'contributor'), createPage);
router.patch('/:pageId', requireAuth, requireRole('owner', 'contributor'), updatePage);
router.delete('/:pageId', requireAuth, requireRole('owner', 'contributor'), deletePage);

export default router;
