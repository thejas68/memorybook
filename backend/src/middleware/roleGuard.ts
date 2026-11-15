import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { AuthRequest } from './auth';

const getString = (value: any): string => {
  return Array.isArray(value) ? value[0] : value;
};

/**
 * Allows the request only if the signed-in user is a member of :bookId with one
 * of the given roles. On success it stores the role on req.memberRole.
 * Must run AFTER requireAuth.
 */
export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authReq = req as unknown as AuthRequest;
    const bookId = getString(authReq.params['bookId']);
    const userId = getString(authReq.userId);

    if (!bookId) {
      next();
      return;
    }

    const member = await prisma.bookMember.findUnique({
      where: { bookId_userId: { bookId, userId } },
    });

    if (!member || !roles.includes(member.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    authReq.memberRole = member.role;
    next();
  };
}
