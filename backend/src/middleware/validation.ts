import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

// Chat message validation
const chatMessageSchema = Joi.object({
  message: Joi.string().required().min(1).max(1000),
  userId: Joi.string().required().min(3).max(50),
  context: Joi.object({
    leadSource: Joi.string().optional(),
    productType: Joi.string().optional(),
    personalityType: Joi.string().optional(),
    budget: Joi.string().optional()
  }).optional()
});



// Lead capture validation
const leadCaptureSchema = Joi.object({
  name: Joi.string().optional().min(2).max(100),
  email: Joi.string().email().optional(),
  phone: Joi.string().optional().min(10).max(15),
  source: Joi.string().required(),
  interests: Joi.array().items(Joi.string()).optional(),
  urgencyLevel: Joi.string().valid('high', 'medium', 'low').optional(),
  metadata: Joi.object().optional()
});



export const validateChatMessage = (req: Request, res: Response, next: NextFunction) => {
  console.log('Validating chat message:', req.body);
  
  if (!req.body.message || !req.body.userId) {
    return res.status(400).json({
      success: false,
      error: 'Message and userId are required'
    });
  }
  
  // Context is optional
  if (req.body.context && typeof req.body.context !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'Context must be an object'
    });
  }
  
  next();
};

export const validateLeadCapture = (req: Request, res: Response, next: NextFunction) => {
  const { error } = leadCaptureSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: error.details[0].message
    });
  }
  
  next();
};