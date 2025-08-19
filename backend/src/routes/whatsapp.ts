// Updated WhatsApp Routes with Enhanced RAG and Premium Calculation Support
// File: backend/src/routes/whatsapp.ts

import express, { Request, Response } from 'express';
import Joi from 'joi';
import AIService from '../services/AIService';
import { 
  QueryContext,
  AIResponse,
  ConversationMessage 
} from '../types/unified-rag';

const router = express.Router();
let aiService: AIService | null = null;

// WhatsApp API Configuration
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'insurance_bot_verify_token';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

// Message templates for WhatsApp
const WHATSAPP_TEMPLATES = {
  welcome: (name?: string) => `Akwaaba${name ? ` ${name}` : ''}! 👋\n\nI'm your AI insurance assistant. I can help you with:\n\n🚗 Auto Insurance\n🏥 Health Insurance\n👨‍👩‍👧‍👦 Life Insurance\n🏢 Business Insurance\n\nWhat type of coverage interests you today?`,
  
  premiumQuote: (quote: any) => `💰 **Your Insurance Premium Quote**\n\n📋 **${quote.insuranceType.toUpperCase()} INSURANCE**\n💵 Annual Premium: **GH₵ ${quote.amount.toLocaleString()}**\n📅 Monthly: **GH₵ ${Math.round(quote.amount / 12).toLocaleString()}**\n\n✅ Valid for 30 days\n💳 Payment via MTN MoMo available\n\n*Ready to get protected? Reply with "YES" to continue!*`,
  
  error: () => `I apologize for the technical issue! 🤖\n\nPlease try again or call our support team:\n📞 +233-XXX-XXXX\n\nI'm here to help protect what matters most to you! 🛡️`,
  
  leadCapture: (leadScore: number) => `Thank you for your interest! 🎯\n\nOur insurance specialist will contact you within 24 hours to finalize your coverage.\n\n📞 We'll call the number you're messaging from\n📧 You can also email us: info@company.com\n\nStay protected! 🛡️`,
  
  premiumCalculation: (insuranceType: string) => {
    const templates = {
      auto: `🚗 **AUTO INSURANCE CALCULATOR**\n\nTo calculate your premium, I need:\n\n1️⃣ Vehicle value (e.g., GH₵ 50,000)\n2️⃣ Your age\n3️⃣ Your location (e.g., Accra)\n4️⃣ Coverage type (Comprehensive/Third Party)\n\nPlease provide these details, and I'll calculate your premium instantly! 💰`,
      
      health: `🏥 **HEALTH INSURANCE CALCULATOR**\n\nTo calculate your premium, I need:\n\n1️⃣ Your age\n2️⃣ Plan type (Basic/Standard/Premium)\n3️⃣ Family size (if family plan)\n4️⃣ Any pre-existing conditions\n\nShare these details for an instant quote! 💰`,
      
      life: `👨‍👩‍👧‍👦 **LIFE INSURANCE CALCULATOR**\n\nTo calculate your premium, I need:\n\n1️⃣ Your age\n2️⃣ Desired coverage amount (e.g., GH₵ 500,000)\n3️⃣ Smoking status (Yes/No)\n\nProvide these details for your quote! 💰`
    };
    
    return templates[insuranceType as keyof typeof templates] || 
           `💰 **PREMIUM CALCULATOR**\n\nPlease specify which insurance type you're interested in:\n• Auto 🚗\n• Health 🏥\n• Life 👨‍👩‍👧‍👦\n• Business 🏢`;
  }
};

// Initialize AI Service
const initializeAIService = async () => {
  if (!aiService) {
    console.log('🚀 Initializing AI Service for WhatsApp...');
    aiService = new AIService();
    await aiService.initialize();
    console.log('✅ AI Service ready for WhatsApp');
  }
  return aiService;
};

// Request validation schemas
const webhookVerificationSchema = Joi.object({
  'hub.mode': Joi.string().valid('subscribe').required(),
  'hub.challenge': Joi.string().required(),
  'hub.verify_token': Joi.string().valid(WHATSAPP_VERIFY_TOKEN).required()
});

const incomingMessageSchema = Joi.object({
  object: Joi.string().valid('whatsapp_business_account').required(),
  entry: Joi.array().items(
    Joi.object({
      id: Joi.string().required(),
      changes: Joi.array().items(
        Joi.object({
          value: Joi.object({
            messaging_product: Joi.string().valid('whatsapp').required(),
            metadata: Joi.object().required(),
            messages: Joi.array().items(
              Joi.object({
                from: Joi.string().required(),
                id: Joi.string().required(),
                timestamp: Joi.string().required(),
                text: Joi.object({
                  body: Joi.string().required()
                }).optional(),
                type: Joi.string().required()
              })
            ).optional()
          }).required(),
          field: Joi.string().valid('messages').required()
        })
      ).required()
    })
  ).required()
});

/**
 * GET /api/whatsapp/webhook - WhatsApp webhook verification
 */
router.get('/webhook', (req: Request, res: Response) => {
  try {
    console.log('📱 WhatsApp webhook verification request received');

    const { error, value } = webhookVerificationSchema.validate(req.query);
    
    if (error) {
      console.error('❌ WhatsApp webhook verification failed:', error.details[0].message);
      return res.status(403).json({
        success: false,
        error: 'Webhook verification failed',
        details: error.details[0].message
      });
    }

    const { 'hub.challenge': challenge } = value;
    
    console.log('✅ WhatsApp webhook verified successfully');
    res.status(200).send(challenge);

  } catch (error) {
    console.error('❌ WhatsApp webhook verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Webhook verification failed'
    });
  }
});

/**
 * POST /api/whatsapp/webhook - Handle incoming WhatsApp messages
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    console.log('📱 Incoming WhatsApp message received');

    // Validate incoming message format
    const { error, value } = incomingMessageSchema.validate(req.body);
    
    if (error) {
      console.warn('⚠️ Invalid WhatsApp message format:', error.details[0].message);
      return res.status(200).send('OK'); // Still return 200 to WhatsApp
    }

    const service = await initializeAIService();

    // Process each entry and message
    for (const entry of value.entry) {
      for (const change of entry.changes) {
        if (change.value.messages) {
          for (const message of change.value.messages) {
            await processWhatsAppMessage(message, change.value.metadata, service);
          }
        }
      }
    }

    // Always respond with 200 to WhatsApp
    res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Error processing WhatsApp message:', error);
    res.status(200).send('OK'); // Still return 200 to avoid webhook retries
  }
});

/**
 * POST /api/whatsapp/send - Send message via WhatsApp (for testing/admin)
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and message are required'
      });
    }

    console.log(`📱 Sending WhatsApp message to ${to}: "${message.substring(0, 50)}..."`);

    const result = await sendWhatsAppMessage(to, message);

    res.json({
      success: true,
      data: {
        messageId: result.messageId,
        to,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to send message',
      message: 'Unable to send WhatsApp message at this time.'
    });
  }
});

/**
 * GET /api/whatsapp/analytics - WhatsApp analytics
 */
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const service = await initializeAIService();
    const analytics = service.getPerformanceAnalytics();

    // Filter for WhatsApp-specific analytics
    const whatsappAnalytics = {
      ...analytics,
      whatsappSpecific: {
        // Add WhatsApp-specific metrics here
        totalWhatsAppConversations: 0, // Would track this
        averageResponseTime: 0,
        popularMessageTypes: [],
        premiumCalculationsViaWhatsApp: 0
      }
    };

    res.json({
      success: true,
      data: {
        ...whatsappAnalytics,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error retrieving WhatsApp analytics:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve analytics'
    });
  }
});

// ===== CORE WHATSAPP MESSAGE PROCESSING =====

/**
 * Process incoming WhatsApp message
 */
async function processWhatsAppMessage(
  message: any,
  metadata: any,
  service: AIService
): Promise<void> {
  try {
    const userId = message.from;
    const messageText = message.text?.body || '';
    const messageId = message.id;
    const timestamp = message.timestamp;

    console.log(`📱 Processing WhatsApp message from ${userId}: "${messageText.substring(0, 50)}..."`);

    // Skip empty messages
    if (!messageText.trim()) {
      console.log('⚠️ Skipping empty WhatsApp message');
      return;
    }

    // Build WhatsApp-specific context
    const context: QueryContext & {
      deviceType?: 'mobile' | 'desktop' | 'tablet';
      source?: string;
      sessionId?: string;
      whatsappMessageId?: string;
      whatsappTimestamp?: string;
      platform?: string;
    } = {
      leadSource: 'whatsapp',
      source: 'whatsapp',
      sessionId: `whatsapp_${userId}_${Date.now()}`,
      // WhatsApp is primarily mobile
      deviceType: 'mobile',
      // Add WhatsApp metadata
      whatsappMessageId: messageId,
      whatsappTimestamp: timestamp,
      platform: 'whatsapp'
    };

    // Check for quick commands
    const quickResponse = handleQuickCommands(messageText.toLowerCase());
    if (quickResponse) {
      await sendWhatsAppMessage(userId, quickResponse);
      return;
    }

    // Process with AI service
    const startTime = Date.now();
    const response = await service.processMessage(messageText, userId, context);
    const processingTime = Date.now() - startTime;

    console.log(`🤖 AI response generated in ${processingTime}ms for WhatsApp user ${userId}`);

    // Format response for WhatsApp
    const whatsappResponse = formatResponseForWhatsApp(response, messageText);

    // Send response
    await sendWhatsAppMessage(userId, whatsappResponse);

    // Handle special cases
    await handleSpecialCases(response, userId, messageText);

    console.log(`✅ WhatsApp message processed successfully for user ${userId}`);

  } catch (error) {
    console.error('❌ Error processing WhatsApp message:', error);
    
    // Send error message to user
    try {
      await sendWhatsAppMessage(message.from, WHATSAPP_TEMPLATES.error());
    } catch (sendError) {
      console.error('❌ Failed to send error message to WhatsApp user:', sendError);
    }
  }
}

/**
 * Handle quick commands (shortcuts)
 */
function handleQuickCommands(messageText: string): string | null {
  const quickCommands: { [key: string]: string } = {
    'hi': WHATSAPP_TEMPLATES.welcome(),
    'hello': WHATSAPP_TEMPLATES.welcome(),
    'start': WHATSAPP_TEMPLATES.welcome(),
    'help': WHATSAPP_TEMPLATES.welcome(),
    'menu': WHATSAPP_TEMPLATES.welcome(),
    
    'auto': WHATSAPP_TEMPLATES.premiumCalculation('auto'),
    'car': WHATSAPP_TEMPLATES.premiumCalculation('auto'),
    'vehicle': WHATSAPP_TEMPLATES.premiumCalculation('auto'),
    
    'health': WHATSAPP_TEMPLATES.premiumCalculation('health'),
    'medical': WHATSAPP_TEMPLATES.premiumCalculation('health'),
    
    'life': WHATSAPP_TEMPLATES.premiumCalculation('life'),
    
    'quote': WHATSAPP_TEMPLATES.premiumCalculation(''),
    'premium': WHATSAPP_TEMPLATES.premiumCalculation(''),
    'calculate': WHATSAPP_TEMPLATES.premiumCalculation(''),
    'price': WHATSAPP_TEMPLATES.premiumCalculation('')
  };

  return quickCommands[messageText] || null;
}

/**
 * Format AI response for WhatsApp
 */
function formatResponseForWhatsApp(response: AIResponse, originalMessage: string): string {
  let formattedMessage = response.message;

  // Handle premium quotes specially
  if (response.premiumQuote) {
    return WHATSAPP_TEMPLATES.premiumQuote({
      insuranceType: extractInsuranceType(originalMessage),
      amount: response.premiumQuote.amount
    });
  }

  // Add WhatsApp-specific formatting
  formattedMessage = formattedMessage
    .replace(/\*\*(.*?)\*\*/g, '*$1*') // Convert markdown bold to WhatsApp bold
    .replace(/### (.*?)$/gm, '*$1*') // Convert headers to bold
    .replace(/- /g, '• ') // Convert bullet points
    .replace(/^\d+\. /gm, '$&'); // Keep numbered lists

  // Add follow-up questions if available
  if (response.followUpQuestions && response.followUpQuestions.length > 0) {
    formattedMessage += '\n\n❓ ' + response.followUpQuestions[0];
  }

  // Add recommendations as quick options
  if (response.enhancedRecommendations?.nextBestActions && response.enhancedRecommendations.nextBestActions.length > 0) {
    const actions = response.enhancedRecommendations.nextBestActions.slice(0, 2);
    if (actions.includes('calculate_premium')) {
      formattedMessage += '\n\n💰 Type "quote" for instant premium calculation';
    }
    if (actions.includes('gather_more_customer_info')) {
      formattedMessage += '\n\n📋 I can help you find the perfect coverage!';
    }
  }

  // Ensure message isn't too long for WhatsApp (max 4096 characters)
  if (formattedMessage.length > 4000) {
    formattedMessage = formattedMessage.substring(0, 3900) + '...\n\n📞 Call us for complete details: +233-XXX-XXXX';
  }

  return formattedMessage;
}

/**
 * Handle special cases after response
 */
async function handleSpecialCases(
  response: AIResponse,
  userId: string,
  originalMessage: string
): Promise<void> {
  try {
    // Lead capture
    if (response.shouldCaptureLead && response.leadScore && response.leadScore > 7) {
      setTimeout(async () => {
        await sendWhatsAppMessage(userId, WHATSAPP_TEMPLATES.leadCapture(response.leadScore!));
      }, 2000); // Send after 2 seconds
    }

    // Premium calculation follow-up
    if (response.premiumQuote) {
      setTimeout(async () => {
        const followUpMessage = `🎯 *Next Steps:*\n\n1️⃣ Reply "YES" to proceed\n2️⃣ Ask questions about coverage\n3️⃣ Request different quote\n\n*Quick options:*\n• "coverage" - Learn about benefits\n• "payment" - Payment methods\n• "apply" - Start application`;
        
        await sendWhatsAppMessage(userId, followUpMessage);
      }, 5000); // Send after 5 seconds
    }

    // High urgency follow-up
    if (response.contextualFactors?.urgencyMatch && response.contextualFactors.urgencyMatch > 0.8) {
      setTimeout(async () => {
        const urgentMessage = `⚡ *Urgent Protection Needed?*\n\nI can fast-track your application:\n\n📞 Call now: +233-XXX-XXXX\n💬 Continue here for instant quotes\n\n*We're here 24/7 to protect you!* 🛡️`;
        
        await sendWhatsAppMessage(userId, urgentMessage);
      }, 10000); // Send after 10 seconds
    }

  } catch (error) {
    console.error('❌ Error handling special cases for WhatsApp:', error);
  }
}

/**
 * Send message via WhatsApp Business API
 */
async function sendWhatsAppMessage(to: string, message: string): Promise<{ messageId: string }> {
  try {
    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      throw new Error('WhatsApp configuration missing');
    }

    console.log(`📤 Sending WhatsApp message to ${to}: "${message.substring(0, 50)}..."`);

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: {
            body: message
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`WhatsApp API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json() as any;
    
    console.log(`✅ WhatsApp message sent successfully to ${to}: ${data.messages[0].id}`);
    
    return {
      messageId: data.messages[0].id
    };

  } catch (error) {
    console.error('❌ Failed to send WhatsApp message:', error);
    throw error;
  }
}

// ===== UTILITY FUNCTIONS =====

/**
 * Extract insurance type from message
 */
function extractInsuranceType(message: string): string {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('auto') || lowerMessage.includes('car') || lowerMessage.includes('vehicle')) {
    return 'auto';
  }
  if (lowerMessage.includes('health') || lowerMessage.includes('medical')) {
    return 'health';
  }
  if (lowerMessage.includes('life')) {
    return 'life';
  }
  if (lowerMessage.includes('business')) {
    return 'business';
  }
  
  return 'general';
}

/**
 * Clean phone number for WhatsApp
 */
function cleanPhoneNumber(phoneNumber: string): string {
  // Remove all non-digit characters
  let cleaned = phoneNumber.replace(/\D/g, '');
  
  // Add country code if missing (assuming Ghana +233)
  if (cleaned.length === 9 && cleaned.startsWith('0')) {
    cleaned = '233' + cleaned.substring(1);
  } else if (cleaned.length === 9) {
    cleaned = '233' + cleaned;
  } else if (cleaned.length === 10 && !cleaned.startsWith('233')) {
    cleaned = '233' + cleaned;
  }
  
  return cleaned;
}

/**
 * Validate WhatsApp phone number
 */
function isValidWhatsAppNumber(phoneNumber: string): boolean {
  const cleaned = cleanPhoneNumber(phoneNumber);
  return cleaned.length >= 10 && cleaned.length <= 15;
}

// Error handling middleware
router.use((err: any, req: Request, res: Response, next: any) => {
  console.error('WhatsApp route error:', err);
  
  // Always return 200 for WhatsApp webhooks to avoid retries
  if (req.path === '/webhook') {
    return res.status(200).send('OK');
  }
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: 'An unexpected error occurred with WhatsApp integration.',
    timestamp: new Date().toISOString()
  });
});

export default router;