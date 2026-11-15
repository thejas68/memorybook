import { Response } from 'express';
import { ZodError } from 'zod';

/**
 * Sends a 400 whose `error` is ALWAYS a readable string (the frontend does
 * `new Error(data.error)`, so an object here would show up as "[object Object]").
 * Per-field details are still available in `fields` for forms that want them.
 */
export const sendValidationError = (res: Response, error: ZodError): void => {
  const first = error.issues[0];
  const where = first && first.path.length ? `${first.path.join('.')}: ` : '';
  res.status(400).json({
    error: first ? `${where}${first.message}` : 'Invalid request',
    fields: error.flatten().fieldErrors,
  });
};
