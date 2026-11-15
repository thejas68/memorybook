import { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { AuthRequest } from '../../middleware/auth';
import { sendValidationError } from '../../utils/validate';

const getString = (value: any): string => {
  return Array.isArray(value) ? value[0] : value;
};

// What every page response carries, so the UI can show "by <name>" and the
// reactions without extra requests (this is what fixes "by Unknown" and the
// reactions that vanished on refresh).
const pageInclude = {
  author: {
    select: {
      id: true,
      profile: { select: { displayName: true, avatarUrl: true } },
    },
  },
  reactions: {
    select: { id: true, userId: true, emoji: true },
    orderBy: { createdAt: 'asc' as const },
  },
};

// The UI stores page text as { text: "..." }. Extra keys are allowed so later
// features (images, stickers) can add fields without a breaking change.
const contentSchema = z.object({ text: z.string().max(20000) }).passthrough();

const createPageSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  content: contentSchema.optional(),
});

const updatePageSchema = z
  .object({
    title: z.string().trim().min(1, 'Title cannot be empty').max(200).optional(),
    content: contentSchema.optional(),
  })
  .refine((d) => d.title !== undefined || d.content !== undefined, {
    message: 'Nothing to update',
  });

// GET /api/books/:bookId/pages   (any member — enforced by requireRole)
export const getPages = async (req: Request, res: Response): Promise<void> => {
  const bookId = getString((req as AuthRequest).params['bookId']);

  const pages = await prisma.page.findMany({
    where: { bookId },
    include: pageInclude,
    orderBy: [{ pageNumber: 'asc' }, { createdAt: 'asc' }],
  });

  res.json(pages);
};

// POST /api/books/:bookId/pages   (owner/contributor — enforced by requireRole)
export const createPage = async (req: Request, res: Response): Promise<void> => {
  const { userId, params, body } = req as AuthRequest;
  const bookId = getString(params['bookId']);
  const authorId = getString(userId);

  const parsed = createPageSchema.safeParse(body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const { title, content } = parsed.data;

  // The server decides the page number (client-supplied values are ignored),
  // and the activity log entry is written in the same transaction.
  const page = await prisma.$transaction(async (tx) => {
    const last = await tx.page.aggregate({
      where: { bookId },
      _max: { pageNumber: true },
    });

    const created = await tx.page.create({
      data: {
        bookId,
        authorId,
        title,
        content: content as Prisma.InputJsonValue | undefined,
        pageNumber: (last._max.pageNumber ?? 0) + 1,
      },
      include: pageInclude,
    });

    await tx.activityLog.create({
      data: { bookId, userId: authorId, action: 'page_created', details: { title } },
    });

    return created;
  });

  res.status(201).json(page);
};

// PATCH /api/books/:bookId/pages/:pageId   (author only)
export const updatePage = async (req: Request, res: Response): Promise<void> => {
  const { userId, params, body } = req as AuthRequest;
  const bookId = getString(params['bookId']);
  const pageId = getString(params['pageId']);

  const parsed = updatePageSchema.safeParse(body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  // Look the page up INSIDE this book, so a book you belong to can't be used
  // as a key to touch a page that lives in some other book.
  const page = await prisma.page.findFirst({ where: { id: pageId, bookId } });
  if (!page) {
    res.status(404).json({ error: 'Page not found' });
    return;
  }

  if (page.authorId !== getString(userId)) {
    res.status(403).json({ error: 'Only the author can edit this page' });
    return;
  }

  const { title, content } = parsed.data;
  const updated = await prisma.page.update({
    where: { id: pageId },
    data: {
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content: content as Prisma.InputJsonValue }),
    },
    include: pageInclude,
  });

  res.json(updated);
};

// DELETE /api/books/:bookId/pages/:pageId   (author, or the book's owner)
export const deletePage = async (req: Request, res: Response): Promise<void> => {
  const { userId, params, memberRole } = req as AuthRequest;
  const bookId = getString(params['bookId']);
  const pageId = getString(params['pageId']);

  const page = await prisma.page.findFirst({ where: { id: pageId, bookId } });
  if (!page) {
    res.status(404).json({ error: 'Page not found' });
    return;
  }

  const isAuthor = page.authorId === getString(userId);
  if (!isAuthor && memberRole !== 'owner') {
    res.status(403).json({ error: 'Only the author or the book owner can delete this page' });
    return;
  }

  await prisma.page.deleteMany({ where: { id: pageId, bookId } });
  res.json({ message: 'Page deleted successfully' });
};
