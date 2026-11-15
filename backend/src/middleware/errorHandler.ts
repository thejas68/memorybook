import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  err: Error & { status?: number; statusCode?: number; expose?: boolean },
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Client errors raised by Express/body-parser (bad JSON, body too large) carry
  // a 4xx status. Return those as-is instead of masking them as a 500.
  const status = err.status ?? err.statusCode;
  if (status && status >= 400 && status < 500) {
    res.status(status).json({
      error: status === 413 ? 'Request body too large' : status === 400 ? 'Malformed request body' : 'Bad request',
    });
    return;
  }

  console.error(`[${new Date().toISOString()}] ERROR: ${err.message}`);
  console.error(err.stack);

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
};
