import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error occurred:', err);

  // Default error
  let error = {
    message: err.message || 'Internal Server Error',
    status: err.statusCode || 500
  };

  // OpenAI API errors
  if (err.name === 'OpenAIError') {
    error = {
      message: 'AI service temporarily unavailable',
      status: 503
    };
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    error = {
      message: 'Invalid input data',
      status: 400
    };
  }

  // Rate limit errors
  if (err.name === 'RateLimitError') {
    error = {
      message: 'Too many requests, please try again later',
      status: 429
    };
  }

  res.status(error.status).json({
    success: false,
    error: error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

export const notFound = (req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.originalUrl} not found`
  });
};