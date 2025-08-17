// Enhanced WhatsApp routes with AIService integration
// File: backend/src/routes/whatsapp.ts

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import AIService from '../services/AIService';
import LeadService from '../services/LeadService';


const router = Router();

// Initialize services
const aiService = new AIService();
const leadService = new LeadService();

// Initialize AI service
aiService.initialize().catch(console.error);

// WhatsApp webhook verification token (you'll set this)
const WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'your_verify_token_here';

/**
 * GET /api/whatsapp/webhook
 * Webhook verification endpoint for WhatsApp
 */
router.get('/webhook', (req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  
  console.log(`\n🔍 [${timestamp}] WhatsApp webhook verification request`);
  console.log('📋 Full request details:');
  console.log('   URL:', req.url);
  console.log('   Query params:', JSON.stringify(req.query, null, 2));
  
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  console.log('🎯 Verification comparison:');
  console.log(`   Expected token: "${expectedToken}"`);
  console.log(`   Received token: "${token}"`);
  console.log(`   Tokens match: ${token === expectedToken}`);

  // Handle browser visits (no verification params)
  if (!mode && !token && !challenge) {
    console.log('👤 Browser visit detected (no verification params)');
    return res.status(200).json({
      message: 'WhatsApp Webhook Endpoint Active',
      status: 'ready',
      configuration: {
        expectedVerifyToken: expectedToken || 'NOT_SET',
        webhookUrl: '/api/whatsapp/webhook'
      },
      aiService: 'integrated',
      timestamp
    });
  }

  // Webhook verification logic
  if (mode && token) {
    if (mode === 'subscribe') {
      if (token === expectedToken) {
        console.log('✅ VERIFICATION SUCCESS - Sending challenge back');
        res.status(200).send(challenge);
      } else {
        console.log('❌ VERIFICATION FAILED - Token mismatch');
        res.status(403).json({
          error: 'Verification token mismatch',
          expected: expectedToken,
          received: token
        });
      }
    } else {
      console.log('❌ VERIFICATION FAILED - Wrong mode');
      res.status(400).json({
        error: 'Invalid mode',
        expected: 'subscribe',
        received: mode
      });
    }
  } else {
    console.log('❌ VERIFICATION FAILED - Missing parameters');
    res.status(400).json({
      error: 'Missing required parameters',
      required: ['hub.mode', 'hub.verify_token', 'hub.challenge'],
      received: { mode, token, challenge }
    });
  }
  
  console.log(`🏁 [${timestamp}] Request completed\n`);
});

/**
 * POST /api/whatsapp/webhook
 * Webhook endpoint to receive WhatsApp messages
 */
router.post('/webhook', async (req: Request, res: Response) => {
  console.log('📨 WhatsApp webhook POST request received');
  console.log('Request body:', JSON.stringify(req.body, null, 2));

  try {
    // WhatsApp sends data in a specific format
    const body = req.body;

    // Check if this is a WhatsApp API event
    if (body.object === 'whatsapp_business_account') {
      // Parse the message
      const entries = body.entry || [];
      
      for (const entry of entries) {
        const changes = entry.changes || [];
        
        for (const change of changes) {
          if (change.field === 'messages') {
            const value = change.value;
            
            // Process messages
            if (value.messages) {
              for (const message of value.messages) {
                await handleWhatsAppMessage(message, value);
              }
            }
            
            // Process message status updates
            if (value.statuses) {
              for (const status of value.statuses) {
                handleMessageStatus(status);
              }
            }
          }
        }
      }
    }

    // Always respond with 200 OK to acknowledge receipt
    res.status(200).json({ status: 'received' });

  } catch (error) {
    console.error('❌ Error processing WhatsApp webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Handle incoming WhatsApp message
 */
async function handleWhatsAppMessage(message: any, value: any) {
  console.log('📱 Processing WhatsApp message:', {
    messageId: message.id,
    from: message.from,
    type: message.type,
    timestamp: message.timestamp
  });

  try {
    // Extract message details
    const fromNumber = message.from;
    const messageId = message.id;
    const messageType = message.type;
    
    let messageText = '';
    
    // Handle different message types
    switch (messageType) {
      case 'text':
        messageText = message.text?.body || '';
        break;
      case 'interactive':
        // Handle button clicks, list selections, etc.
        if (message.interactive?.type === 'button_reply') {
          messageText = message.interactive.button_reply.title;
        } else if (message.interactive?.type === 'list_reply') {
          messageText = message.interactive.list_reply.title;
        }
        break;
      default:
        messageText = `[${messageType} message received]`;
    }

    console.log(`💬 Message from ${fromNumber}: "${messageText}"`);

    // Process message with AI service
    await processMessageWithAI(fromNumber, messageText, messageId);

  } catch (error) {
    console.error('❌ Error handling WhatsApp message:', error);
  }
}

/**
 * Process message with AI service and handle lead capture
 */
async function processMessageWithAI(phoneNumber: string, message: string, messageId: string) {
  try {
    console.log(`🤖 Processing message with AI for ${phoneNumber}`);
    
    // Use phone number as userId for WhatsApp conversations
    const userId = `whatsapp_${phoneNumber}`;
    
    // Create context for WhatsApp conversations
    const context = {
      leadSource: 'whatsapp',
      platform: 'whatsapp',
      phoneNumber: phoneNumber,
      messageId: messageId
    };

    console.log('🔄 Calling AIService.processMessage...');
    
    // Process message with your AIService
    const aiResponse = await aiService.processMessage(message, userId, context);
    
    console.log('✅ AI Response received:', {
      messageLength: aiResponse.message.length,
      confidence: aiResponse.confidence,
      recommendationsCount: aiResponse.recommendations.length
    });

    // Send AI response back to WhatsApp
    await sendWhatsAppMessage(phoneNumber, aiResponse.message);

    // Handle lead capture if recommended by AI
    await handleLeadCapture(aiResponse, phoneNumber, message, context);

    console.log('🎯 WhatsApp AI processing completed successfully');

  } catch (error) {
    console.error('❌ Error processing message with AI:', error);
    
    // Send fallback message
    const fallbackMessage = "I apologize, but I'm experiencing a technical issue. Let me connect you with a human agent who can help you right away! 🤝";
    await sendWhatsAppMessage(phoneNumber, fallbackMessage);
  }
}

/**
 * Handle lead capture based on AI recommendations
 */
async function handleLeadCapture(aiResponse: any, phoneNumber: string, message: string, context: any) {
  try {
    console.log('🎯 Checking for lead capture recommendations...');
    
    // Find lead capture recommendation
    const leadCaptureRecommendation = aiResponse.recommendations.find(
      (rec: any) => rec.type === 'action' && rec.action === 'capture_lead'
    );

    if (leadCaptureRecommendation) {
      console.log('📋 Lead capture recommended by AI:', leadCaptureRecommendation.reason);
      
      // Extract contact info (for WhatsApp, we have the phone number)
      const contactInfo = {
        phone: phoneNumber,
        name: null, // Could be extracted from profile if available
        email: null // Would need to be collected in conversation
      };

      // Determine product interest from AI analysis
      const productInterest = aiResponse.usedKnowledge?.productTypes?.[0] || 
                            leadCaptureRecommendation.aiAnalysis?.primaryIntent || 
                            'general';

      // Calculate lead score from AI confidence and analysis
      const leadScore = calculateWhatsAppLeadScore(
        aiResponse.confidence,
        leadCaptureRecommendation.aiAnalysis,
        context
      );

      // Capture lead using your LeadService
      const leadData = {
        userId: `whatsapp_${phoneNumber}`,
        contactInfo: contactInfo,
        source: 'whatsapp',
        productInterest: productInterest,
        score: leadScore,
        conversationContext: {
          platform: 'whatsapp',
          messageId: context.messageId,
          aiAnalysis: leadCaptureRecommendation.aiAnalysis,
          aiReason: leadCaptureRecommendation.reason,
          confidence: aiResponse.confidence,
          lastMessage: message,
          capturedAt: new Date()
        }
      };

      console.log('💾 Capturing WhatsApp lead:', {
        phone: phoneNumber,
        score: leadScore,
        productInterest: productInterest,
        source: 'whatsapp'
      });

      const capturedLead = await leadService.captureLead(leadData);
      
      console.log('✅ WhatsApp lead captured successfully:', {
        leadId: capturedLead.id,
        score: capturedLead.score,
        urgencyLevel: capturedLead.urgencyLevel
      });

      // Optionally send a subtle follow-up message
      // (Be careful not to be too aggressive)
      
    } else {
      console.log('🔄 No lead capture recommended by AI');
    }

  } catch (error) {
    console.error('❌ Error handling lead capture:', error);
    // Don't fail the whole conversation if lead capture fails
  }
}

/**
 * Calculate lead score for WhatsApp conversations
 */
function calculateWhatsAppLeadScore(aiConfidence: number, aiAnalysis: any, context: any): number {
  let score = 0;

  // Base score from AI confidence
  score += aiConfidence * 30;

  // WhatsApp platform bonus (more engaged users)
  score += 15;

  // Urgency level scoring
  if (aiAnalysis?.urgencyLevel === 'high') score += 20;
  else if (aiAnalysis?.urgencyLevel === 'medium') score += 10;

  // Buying signals
  const buyingSignals = aiAnalysis?.buyingSignals || [];
  score += buyingSignals.length * 5;

  // Lead readiness
  switch (aiAnalysis?.leadReadiness) {
    case 'hot_lead': score += 25; break;
    case 'ready': score += 20; break;
    case 'considering': score += 15; break;
    case 'exploring': score += 10; break;
    default: score += 5;
  }

  // Ensure score is between 0-100
  return Math.min(100, Math.max(0, score));
}

/**
 * Send message to WhatsApp
 */
async function sendWhatsAppMessage(to: string, message: string) {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
  
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.error('❌ Missing WhatsApp credentials');
    return;
  }

  try {
    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
    
    const payload = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: {
        body: message
      }
    };

    console.log('📤 Sending WhatsApp message to:', to);
    console.log('📝 Message preview:', message.substring(0, 100) + '...');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ WhatsApp message sent successfully:');
    } else {
      const error = await response.text();
      console.error('❌ Failed to send WhatsApp message:', {
        status: response.status,
        error: error
      });
    }

  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error);
  }
}

/**
 * Handle message status updates
 */
function handleMessageStatus(status: any) {
  console.log('📊 Message status update:', {
    messageId: status.id,
    status: status.status,
    timestamp: status.timestamp
  });
  
  // You can track message delivery, read receipts, etc.
}

/**
 * Test endpoint to send a message
 */
router.post('/send-test', async (req: Request, res: Response) => {
  try {
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({ error: 'Missing "to" or "message" parameters' });
    }
    
    await sendWhatsAppMessage(to, message);
    
    res.json({ success: true, message: 'Test message sent' });
  } catch (error) {
    console.error('❌ Error sending test message:', error);
    res.status(500).json({ error: 'Failed to send test message' });
  }
});

/**
 * Debug endpoint to check WhatsApp API credentials
 */
router.get('/credentials-check', (req: Request, res: Response) => {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

  res.json({
    message: 'WhatsApp API Credentials Check',
    credentials: {
      accessToken: accessToken ? {
        present: true,
        length: accessToken.length,
        preview: accessToken.substring(0, 20) + '...' + accessToken.substring(accessToken.length - 10)
      } : { present: false },
      phoneNumberId: phoneNumberId || 'NOT_SET',
      businessAccountId: businessAccountId || 'NOT_SET'
    },
    services: {
      aiService: 'integrated',
      leadService: 'integrated'
    },
    apiEndpoint: phoneNumberId ? `https://graph.facebook.com/v18.0/${phoneNumberId}/messages` : 'Cannot construct - missing phone number ID',
    status: (accessToken && phoneNumberId) ? 'READY' : 'MISSING_CREDENTIALS',
    timestamp: new Date().toISOString()
  });
});

/**
 * Get WhatsApp conversation stats
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Get lead stats for WhatsApp source
    const leadStats = await leadService.getLeadStats();
    const whatsappLeads = await leadService.getLeads({ source: 'whatsapp' });

    res.json({
      success: true,
      data: {
        totalWhatsAppLeads: whatsappLeads.length,
        whatsAppLeadsByStatus: whatsappLeads.reduce((acc, lead) => {
          acc[lead.status] = (acc[lead.status] || 0) + 1;
          return acc;
        }, {} as { [key: string]: number }),
        averageWhatsAppLeadScore: whatsappLeads.reduce((sum, lead) => sum + lead.score, 0) / whatsappLeads.length || 0,
        highPriorityWhatsAppLeads: whatsappLeads.filter(l => l.urgencyLevel === 'high').length,
        overallStats: leadStats,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error getting WhatsApp stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve WhatsApp statistics'
    });
  }
});

// WhatsApp Opt-in Link Generator
// File: backend/src/routes/whatsapp.ts (add these routes)

/**
 * Generate WhatsApp opt-in link
 */
router.get('/optin-link', (req: Request, res: Response) => {
  try {
    const businessPhoneNumber = process.env.WHATSAPP_BUSINESS_PHONE_NUMBER || process.env.WHATSAPP_PHONE_NUMBER_ID;
    
    if (!businessPhoneNumber) {
      return res.status(500).json({
        error: 'WhatsApp business phone number not configured'
      });
    }

    // Pre-filled message options
    const welcomeMessages = {
      general: "Hello! I'm interested in learning about insurance options.",
      auto: "Hi! I need information about car insurance in Ghana.",
      health: "Hello! I'd like to know about health insurance plans.",
      life: "Hi! I'm interested in life insurance coverage.",
      business: "Hello! I need business insurance for my company.",
      quote: "Hi! I'd like to get an insurance quote."
    };

    const messageType = req.query.type as string || 'general';
    const customMessage = req.query.message as string;
    const source = req.query.source as string || 'qr_code';
    
    const message = customMessage || welcomeMessages[messageType as keyof typeof welcomeMessages] || welcomeMessages.general;
    
    // Create WhatsApp URL
    const whatsappUrl = `https://wa.me/${businessPhoneNumber}?text=${encodeURIComponent(message)}`;
    
    // Create click.to.chat URL (alternative)
    const clickToChatUrl = `https://api.whatsapp.com/send?phone=${businessPhoneNumber}&text=${encodeURIComponent(message)}`;
    
    // Create tracking URL through your system
    const trackingUrl = `${req.protocol}://${req.get('host')}/api/whatsapp/track-click?source=${source}&type=${messageType}&redirect=${encodeURIComponent(whatsappUrl)}`;

    res.json({
      success: true,
      data: {
        whatsappUrl,
        clickToChatUrl,
        trackingUrl,
        qrCodeData: whatsappUrl, // Use this for QR code generation
        message: message,
        businessNumber: businessPhoneNumber,
        messageType,
        source
      },
      instructions: {
        directLink: 'Use whatsappUrl for direct linking',
        qrCode: 'Use qrCodeData for QR code generation',
        tracking: 'Use trackingUrl to track clicks before redirect'
      }
    });

  } catch (error) {
    console.error('Error generating opt-in link:', error);
    res.status(500).json({
      error: 'Failed to generate opt-in link'
    });
  }
});

/**
 * Track link clicks and redirect to WhatsApp
 */
router.get('/track-click', async (req: Request, res: Response) => {
  try {
    const { source, type, redirect } = req.query;
    
    console.log('📊 WhatsApp opt-in click tracked:', {
      source,
      type,
      timestamp: new Date().toISOString(),
      userAgent: req.get('user-agent'),
      ip: req.ip
    });

    // Optional: Store click analytics in your database
    // await analyticsService.trackClick({ source, type, timestamp: new Date() });

    // Redirect to WhatsApp
    res.redirect(redirect as string);

  } catch (error) {
    console.error('Error tracking click:', error);
    res.status(500).json({ error: 'Tracking failed' });
  }
});

/**
 * Generate multiple opt-in links for different use cases
 */
router.get('/optin-links/bulk', (req: Request, res: Response) => {
  try {
    const businessPhoneNumber = process.env.WHATSAPP_BUSINESS_PHONE_NUMBER || process.env.WHATSAPP_PHONE_NUMBER_ID;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    if (!businessPhoneNumber) {
      return res.status(500).json({
        error: 'WhatsApp business phone number not configured'
      });
    }

    const optinLinks = {
      general: {
        message: "Hello! I'm interested in learning about insurance options.",
        directLink: `https://wa.me/${businessPhoneNumber}?text=${encodeURIComponent("Hello! I'm interested in learning about insurance options.")}`,
        trackingLink: `${baseUrl}/api/whatsapp/track-click?source=qr_general&type=general&redirect=${encodeURIComponent(`https://wa.me/${businessPhoneNumber}?text=${encodeURIComponent("Hello! I'm interested in learning about insurance options.")}`)}`,
        useCase: "General QR codes for brochures, business cards"
      },
      auto: {
        message: "Hi! I need information about car insurance in Ghana.",
        directLink: `https://wa.me/${businessPhoneNumber}?text=${encodeURIComponent("Hi! I need information about car insurance in Ghana.")}`,
        trackingLink: `${baseUrl}/api/whatsapp/track-click?source=qr_auto&type=auto&redirect=${encodeURIComponent(`https://wa.me/${businessPhoneNumber}?text=${encodeURIComponent("Hi! I need information about car insurance in Ghana.")}`)}`,
        useCase: "Car dealerships, mechanic shops, parking areas"
      },
      health: {
        message: "Hello! I'd like to know about health insurance plans.",
        directLink: `https://wa.me/${businessPhoneNumber}?text=${encodeURIComponent("Hello! I'd like to know about health insurance plans.")}`,
        trackingLink: `${baseUrl}/api/whatsapp/track-click?source=qr_health&type=health&redirect=${encodeURIComponent(`https://wa.me/${businessPhoneNumber}?text=${encodeURIComponent("Hello! I'd like to know about health insurance plans.")}`)}`,
        useCase: "Hospitals, pharmacies, health centers"
      },
      business: {
        message: "Hello! I need business insurance for my company.",
        directLink: `https://wa.me/${businessPhoneNumber}?text=${encodeURIComponent("Hello! I need business insurance for my company.")}`,
        trackingLink: `${baseUrl}/api/whatsapp/track-click?source=qr_business&type=business&redirect=${encodeURIComponent(`https://wa.me/${businessPhoneNumber}?text=${encodeURIComponent("Hello! I need business insurance for my company.")}`)}`,
        useCase: "Business districts, co-working spaces, trade shows"
      },
      urgent: {
        message: "Hi! I need insurance coverage urgently. Can you help me get a quick quote?",
        directLink: `https://wa.me/${businessPhoneNumber}?text=${encodeURIComponent("Hi! I need insurance coverage urgently. Can you help me get a quick quote?")}`,
        trackingLink: `${baseUrl}/api/whatsapp/track-click?source=qr_urgent&type=quote&redirect=${encodeURIComponent(`https://wa.me/${businessPhoneNumber}?text=${encodeURIComponent("Hi! I need insurance coverage urgently. Can you help me get a quick quote?")}`)}`,
        useCase: "Emergency situations, time-sensitive campaigns"
      }
    };

    res.json({
      success: true,
      businessNumber: businessPhoneNumber,
      optinLinks,
      qrCodeInstructions: {
        step1: "Copy any 'directLink' or 'trackingLink' from above",
        step2: "Use a QR code generator like qr-code-generator.com",
        step3: "Paste the link and generate QR code",
        step4: "Download and use in marketing materials"
      },
      trackingNote: "Use trackingLink to see which QR codes are most effective"
    });

  } catch (error) {
    console.error('Error generating bulk opt-in links:', error);
    res.status(500).json({
      error: 'Failed to generate bulk opt-in links'
    });
  }
});

/**
 * QR Code landing page (optional)
 */
router.get('/qr-landing', (req: Request, res: Response) => {
  const { type = 'general', source = 'qr' } = req.query;
  const businessPhoneNumber = process.env.WHATSAPP_BUSINESS_PHONE_NUMBER || process.env.WHATSAPP_PHONE_NUMBER_ID;
  
  const messages = {
    general: "Hello! I'm interested in learning about insurance options.",
    auto: "Hi! I need information about car insurance in Ghana.",
    health: "Hello! I'd like to know about health insurance plans.",
    business: "Hello! I need business insurance for my company."
  };
  
  const message = messages[type as keyof typeof messages] || messages.general;
  const whatsappUrl = `https://wa.me/${businessPhoneNumber}?text=${encodeURIComponent(message)}`;
  
  // Simple HTML landing page
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connect with Your AI Insurance Agent</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 2rem; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        .container { 
            max-width: 400px; 
            margin: 0 auto; 
            background: rgba(255,255,255,0.1);
            padding: 2rem;
            border-radius: 15px;
            backdrop-filter: blur(10px);
        }
        .whatsapp-btn { 
            background: #25D366; 
            color: white; 
            padding: 15px 30px; 
            border: none; 
            border-radius: 50px; 
            font-size: 18px; 
            cursor: pointer; 
            text-decoration: none;
            display: inline-block;
            margin: 20px 0;
            transition: transform 0.2s;
        }
        .whatsapp-btn:hover { 
            transform: scale(1.05); 
        }
        .feature { margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🛡️ Your AI Insurance Agent</h1>
        <p>Get instant answers about insurance options in Ghana!</p>
        
        <div class="feature">💬 Instant responses 24/7</div>
        <div class="feature">📋 Personalized quotes</div>
        <div class="feature">🇬🇭 Ghana-specific coverage</div>
        
        <a href="${whatsappUrl}" class="whatsapp-btn">
            💬 Start WhatsApp Chat
        </a>
        
        <p><small>Click above to start chatting with your AI insurance assistant</small></p>
    </div>
    
    <script>
        // Auto-redirect after 3 seconds if user doesn't click
        setTimeout(() => {
            window.location.href = "${whatsappUrl}";
        }, 5000);
    </script>
</body>
</html>`;

  res.send(html);
});

/**
 * Get opt-in analytics
 */
router.get('/optin-analytics', async (req: Request, res: Response) => {
  try {
    // This would connect to your analytics system
    // For now, return mock data
    
    res.json({
      success: true,
      data: {
        totalClicks: 0, // Would come from analytics
        clicksBySource: {
          qr_general: 0,
          qr_auto: 0,
          qr_health: 0,
          qr_business: 0
        },
        conversionRate: 0, // Clicks that resulted in conversations
        note: "Analytics tracking not yet implemented"
      }
    });

  } catch (error) {
    console.error('Error getting opt-in analytics:', error);
    res.status(500).json({
      error: 'Failed to get analytics'
    });
  }
});

// Clean QR Code Routes - Replace all your QR code routes with these
// Remove the duplicate /qr-code routes and use only these versions

/**
 * Generate QR code image for WhatsApp opt-in (Primary Route)
 */
router.get('/qr-code', async (req: Request, res: Response) => {
  console.log('🔍 QR Code generation request:', req.query);
  
  try {
    const { type = 'general', size = '300', source = 'qr' } = req.query;
    
    // Get the WhatsApp opt-in link
    const businessPhoneNumber = process.env.WHATSAPP_BUSINESS_PHONE_NUMBER || process.env.WHATSAPP_PHONE_NUMBER_ID;
    
    console.log('📱 Business phone number:', businessPhoneNumber);
    
    if (!businessPhoneNumber) {
      console.error('❌ No business phone number configured');
      return res.status(500).json({ 
        error: 'Business phone number not configured',
        hint: 'Add WHATSAPP_BUSINESS_PHONE_NUMBER to your .env file',
        available: {
          WHATSAPP_BUSINESS_PHONE_NUMBER: process.env.WHATSAPP_BUSINESS_PHONE_NUMBER || 'NOT_SET',
          WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || 'NOT_SET'
        }
      });
    }

    const messages = {
      general: "Hello! I'm interested in learning about insurance options.",
      auto: "Hi! I need information about car insurance in Ghana.",
      health: "Hello! I'd like to know about health insurance plans.",
      business: "Hello! I need business insurance for my company.",
      quote: "Hi! I'd like to get an insurance quote."
    };

    const message = messages[type as keyof typeof messages] || messages.general;
    const whatsappUrl = `https://wa.me/${businessPhoneNumber}?text=${encodeURIComponent(message)}`;
    
    console.log('🔗 Generated WhatsApp URL:', whatsappUrl);

    // Use Google Charts API for QR code generation (free)
    const qrApiUrl = `https://chart.googleapis.com/chart?chs=${size}x${size}&cht=qr&chl=${encodeURIComponent(whatsappUrl)}&choe=UTF-8`;
    
    console.log('📊 QR API URL:', qrApiUrl);

    try {
      // Fetch the QR code image using native fetch
      const qrResponse = await fetch(qrApiUrl);
      
      console.log('📨 QR API Response status:', qrResponse.status);
      
      if (!qrResponse.ok) {
        throw new Error(`QR API returned status ${qrResponse.status}`);
      }

      // Get the image as array buffer
      const qrImageBuffer = await qrResponse.arrayBuffer();
      
      console.log('✅ QR code generated successfully, size:', qrImageBuffer.byteLength);

      // Set headers for image response
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `inline; filename="whatsapp-qr-${type}.png"`);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      
      // Send the image
      res.send(Buffer.from(qrImageBuffer));

    } catch (fetchError) {
      console.error('❌ Fetch error:', fetchError);
      
      // Fallback: Return a redirect to online QR generator
      const fallbackUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(whatsappUrl)}`;
      
      console.log('🔄 Using fallback QR service:', fallbackUrl);
      
      res.redirect(fallbackUrl);
    }

  } catch (error) {
    console.error('❌ Error generating QR code:', error);
    
    // Return detailed error for debugging
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate QR code',
      details: error instanceof Error ? error.message : 'Unknown error',
      debug: {
        type: req.query.type,
        size: req.query.size,
        businessPhoneNumber: process.env.WHATSAPP_BUSINESS_PHONE_NUMBER ? 'SET' : 'NOT_SET',
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ? 'SET' : 'NOT_SET'
      }
    });
  }
});

/**
 * Generate HTML page with QR code
 */
// CSP-Compliant HTML QR Route
// Replace your /qr-code/html route with this version

/**
 * Generate HTML page with QR code (CSP-compliant)
 */
router.get('/qr-code/html', async (req: Request, res: Response) => {
  try {
    const { type = 'general', size = '300' } = req.query;
    
    const businessPhoneNumber = process.env.WHATSAPP_BUSINESS_PHONE_NUMBER || process.env.WHATSAPP_PHONE_NUMBER_ID;
    
    if (!businessPhoneNumber) {
      return res.status(500).json({ 
        error: 'Business phone number not configured'
      });
    }

    const messages = {
      general: "Hello! I'm interested in learning about insurance options.",
      auto: "Hi! I need information about car insurance in Ghana.",
      health: "Hello! I'd like to know about health insurance plans.",
      business: "Hello! I need business insurance for my company.",
      quote: "Hi! I'd like to get an insurance quote."
    };

    const message = messages[type as keyof typeof messages] || messages.general;
    const whatsappUrl = `https://wa.me/${businessPhoneNumber}?text=${encodeURIComponent(message)}`;

    // Generate both primary and fallback QR URLs
    const primaryQRUrl = `https://chart.googleapis.com/chart?chs=${size}x${size}&cht=qr&chl=${encodeURIComponent(whatsappUrl)}&choe=UTF-8`;
    const fallbackQRUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(whatsappUrl)}`;

    // HTML page with QR code (no inline event handlers)
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp QR Code - ${String(type).charAt(0).toUpperCase() + String(type).slice(1)} Insurance</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
            color: white;
        }
        .qr-container {
            background: white;
            color: #333;
            padding: 2rem;
            border-radius: 20px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.2);
            max-width: 400px;
        }
        .qr-code {
            margin: 1.5rem 0;
            border-radius: 15px;
            overflow: hidden;
            background: #f8f9fa;
            padding: 1rem;
        }
        .qr-code img {
            max-width: 100%;
            height: auto;
        }
        .header {
            margin-bottom: 1rem;
        }
        .whatsapp-icon {
            font-size: 3rem;
            margin-bottom: 0.5rem;
        }
        .instructions {
            background: #f8f9fa;
            padding: 1rem;
            border-radius: 10px;
            margin-top: 1rem;
            font-size: 14px;
            line-height: 1.5;
        }
        .step {
            margin: 0.5rem 0;
            display: flex;
            align-items: center;
            justify-content: flex-start;
        }
        .step-number {
            background: #25D366;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 0.5rem;
            font-weight: bold;
            font-size: 12px;
        }
        .features {
            margin: 1rem 0;
            font-size: 14px;
        }
        .feature {
            margin: 0.3rem 0;
        }
        .fallback-link {
            display: inline-block;
            background: #25D366;
            color: white;
            padding: 10px 20px;
            border-radius: 25px;
            text-decoration: none;
            margin: 0.5rem;
            font-size: 14px;
            transition: background 0.3s;
        }
        .fallback-link:hover {
            background: #128C7E;
        }
        .error-message {
            color: #dc3545;
            font-size: 12px;
            margin-top: 0.5rem;
            display: none;
        }
        @media print {
            body { 
                background: white; 
                color: black;
            }
            .qr-container { 
                box-shadow: none; 
                border: 2px solid #25D366;
            }
        }
    </style>
</head>
<body>
    <div class="qr-container">
        <div class="header">
            <div class="whatsapp-icon">💬</div>
            <h2>AI Insurance Agent</h2>
            <p><strong>${String(type).charAt(0).toUpperCase() + String(type).slice(1)} Insurance</strong></p>
            <p>Scan to start WhatsApp conversation</p>
        </div>
        
        <div class="qr-code">
            <img id="qr-image" 
                 src="${primaryQRUrl}" 
                 alt="WhatsApp QR Code" />
            <div id="error-message" class="error-message">
                QR code failed to load. <a href="${whatsappUrl}" class="fallback-link">Click here to chat directly</a>
            </div>
        </div>
        
        <div class="features">
            <div class="feature">⚡ Instant responses 24/7</div>
            <div class="feature">📋 Personalized quotes</div>
            <div class="feature">🇬🇭 Ghana-specific coverage</div>
        </div>
        
        <div class="instructions">
            <div class="step">
                <div class="step-number">1</div>
                <div>Open WhatsApp on your phone</div>
            </div>
            <div class="step">
                <div class="step-number">2</div>
                <div>Tap the camera/scan icon</div>
            </div>
            <div class="step">
                <div class="step-number">3</div>
                <div>Point camera at this QR code</div>
            </div>
            <div class="step">
                <div class="step-number">4</div>
                <div>Start chatting with your AI agent!</div>
            </div>
        </div>
        
        <div style="margin-top: 1rem;">
            <a href="${whatsappUrl}" class="fallback-link">💬 Or click here to chat directly</a>
        </div>
        
        <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #eee; font-size: 12px; color: #666;">
            <p>Available 24/7 • Instant Responses • Professional Service</p>
            <p><strong>Message:</strong> "${message}"</p>
        </div>
    </div>

    <script>
        // CSP-compliant error handling
        document.addEventListener('DOMContentLoaded', function() {
            const qrImage = document.getElementById('qr-image');
            const errorMessage = document.getElementById('error-message');
            
            qrImage.addEventListener('error', function() {
                console.log('Primary QR failed, trying fallback...');
                // Try fallback QR service
                this.src = '${fallbackQRUrl}';
                
                // If fallback also fails
                this.addEventListener('error', function() {
                    console.log('Fallback QR also failed');
                    this.style.display = 'none';
                    errorMessage.style.display = 'block';
                });
            });
        });
    </script>
</body>
</html>`;

    res.send(html);

  } catch (error) {
    console.error('Error generating HTML QR code:', error);
    res.status(500).json({ error: 'Failed to generate HTML QR code' });
  }
});


/**
 * Generate branded QR code page with embedded base64 QR code
 */
router.get('/qr-code/branded', async (req: Request, res: Response) => {
  try {
    const { type = 'general', source = 'branded_qr' } = req.query;
    
    const businessPhoneNumber = process.env.WHATSAPP_BUSINESS_PHONE_NUMBER || process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!businessPhoneNumber) {
      return res.status(500).json({ error: 'Business phone number not configured' });
    }

    const messages = {
      general: "Hello! I'm interested in learning about insurance options.",
      auto: "Hi! I need information about car insurance in Ghana.",
      health: "Hello! I'd like to know about health insurance plans.",
      business: "Hello! I need business insurance for my company."
    };

    const message = messages[type as keyof typeof messages] || messages.general;
    const whatsappUrl = `https://wa.me/${businessPhoneNumber}?text=${encodeURIComponent(message)}`;

    console.log('🔗 Generating branded QR for:', whatsappUrl);

    // Fetch QR code from server and convert to base64 data URL
    let qrCodeDataUrl = '';
    try {
      const qrApiUrl = `https://chart.googleapis.com/chart?chs=250x250&cht=qr&chl=${encodeURIComponent(whatsappUrl)}&choe=UTF-8`;
      console.log('📊 Fetching QR from Google Charts:', qrApiUrl);
      
      const qrResponse = await fetch(qrApiUrl);
      if (qrResponse.ok) {
        const qrBuffer = await qrResponse.arrayBuffer();
        const base64QR = Buffer.from(qrBuffer).toString('base64');
        qrCodeDataUrl = `data:image/png;base64,${base64QR}`;
        console.log('✅ QR code converted to base64 data URL, length:', base64QR.length);
      } else {
        throw new Error(`Google Charts API returned ${qrResponse.status}`);
      }
    } catch (error) {
      console.error('❌ Google Charts failed, trying fallback:', error);
      // Fallback: Use QR Server API
      try {
        const fallbackApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(whatsappUrl)}`;
        console.log('🔄 Trying fallback QR service:', fallbackApiUrl);
        
        const fallbackResponse = await fetch(fallbackApiUrl);
        if (fallbackResponse.ok) {
          const qrBuffer = await fallbackResponse.arrayBuffer();
          const base64QR = Buffer.from(qrBuffer).toString('base64');
          qrCodeDataUrl = `data:image/png;base64,${base64QR}`;
          console.log('✅ Fallback QR code generated successfully');
        } else {
          throw new Error(`Fallback API returned ${fallbackResponse.status}`);
        }
      } catch (fallbackError) {
        console.error('❌ Both QR services failed:', fallbackError);
        // Create a simple SVG placeholder
        const svgPlaceholder = `
          <svg width="250" height="250" xmlns="http://www.w3.org/2000/svg">
            <rect width="250" height="250" fill="#f8f9fa" stroke="#dee2e6" stroke-width="2"/>
            <text x="125" y="120" text-anchor="middle" font-family="Arial" font-size="14" fill="#6c757d">QR Code</text>
            <text x="125" y="140" text-anchor="middle" font-family="Arial" font-size="14" fill="#6c757d">Unavailable</text>
          </svg>
        `;
        qrCodeDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgPlaceholder).toString('base64')}`;
      }
    }

    // Return HTML page with embedded QR code as base64 data URL
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp QR Code - AI Insurance Agent</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 1rem;
        }
        .qr-container {
            background: white;
            padding: 2rem;
            border-radius: 20px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.15);
            max-width: 400px;
            width: 100%;
        }
        .qr-code {
            margin: 1.5rem 0;
            border-radius: 15px;
            overflow: hidden;
            background: #f8f9fa;
            padding: 1rem;
            border: 2px solid #e9ecef;
        }
        .qr-code img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
        }
        .header {
            color: #333;
            margin-bottom: 1rem;
        }
        .whatsapp-icon {
            color: #25D366;
            font-size: 3rem;
            margin-bottom: 0.5rem;
        }
        .title {
            font-size: 1.5rem;
            font-weight: bold;
            margin: 0.5rem 0;
            color: #2c3e50;
        }
        .subtitle {
            color: #6c757d;
            margin-bottom: 1rem;
            font-size: 1rem;
        }
        .insurance-type {
            background: linear-gradient(135deg, #25D366, #128C7E);
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 20px;
            font-weight: bold;
            display: inline-block;
            margin-bottom: 1rem;
        }
        .instructions {
            color: #495057;
            font-size: 14px;
            margin-top: 1.5rem;
            line-height: 1.6;
            text-align: left;
        }
        .step {
            margin: 0.8rem 0;
            display: flex;
            align-items: center;
            padding: 0.5rem;
            background: #f8f9fa;
            border-radius: 8px;
        }
        .step-number {
            background: #25D366;
            color: white;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 0.75rem;
            font-weight: bold;
            font-size: 14px;
            flex-shrink: 0;
        }
        .step-text {
            flex: 1;
        }
        .features {
            margin: 1.5rem 0;
            padding: 1rem;
            background: linear-gradient(135deg, #e3f2fd, #f3e5f5);
            border-radius: 10px;
        }
        .feature {
            margin: 0.5rem 0;
            color: #37474f;
            font-weight: 500;
        }
        .fallback-link {
            display: inline-block;
            background: linear-gradient(135deg, #25D366, #128C7E);
            color: white;
            padding: 12px 24px;
            border-radius: 25px;
            text-decoration: none;
            margin: 1rem 0;
            font-size: 16px;
            font-weight: bold;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .fallback-link:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(37, 211, 102, 0.3);
        }
        .footer {
            margin-top: 1.5rem;
            padding-top: 1rem;
            border-top: 2px solid #e9ecef;
            font-size: 12px;
            color: #6c757d;
        }
        .message-preview {
            background: #f8f9fa;
            border-left: 4px solid #25D366;
            padding: 0.75rem;
            margin: 1rem 0;
            border-radius: 0 8px 8px 0;
            font-style: italic;
            color: #495057;
        }
        @media print {
            body { 
                background: white !important;
                color: black !important;
                padding: 0;
            }
            .qr-container { 
                box-shadow: none !important;
                border: 2px solid #25D366;
            }
            .fallback-link {
                display: none;
            }
        }
        @media (max-width: 480px) {
            .qr-container {
                padding: 1.5rem;
                margin: 0.5rem;
            }
            .title {
                font-size: 1.25rem;
            }
        }
    </style>
</head>
<body>
    <div class="qr-container">
        <div class="header">
            <div class="whatsapp-icon">💬</div>
            <h1 class="title">AI Insurance Agent</h1>
            <div class="insurance-type">${String(type).charAt(0).toUpperCase() + String(type).slice(1)} Insurance</div>
            <p class="subtitle">Scan to start WhatsApp conversation</p>
        </div>
        
        <div class="qr-code">
            <img src="${qrCodeDataUrl}" alt="WhatsApp QR Code" />
        </div>
        
        <div class="features">
            <div class="feature">⚡ Instant responses 24/7</div>
            <div class="feature">📋 Personalized quotes</div>
            <div class="feature">🇬🇭 Ghana-specific coverage</div>
            <div class="feature">🤖 AI-powered assistance</div>
        </div>
        
        <div class="instructions">
            <div class="step">
                <div class="step-number">1</div>
                <div class="step-text">Open WhatsApp on your phone</div>
            </div>
            <div class="step">
                <div class="step-number">2</div>
                <div class="step-text">Tap the camera or scan icon</div>
            </div>
            <div class="step">
                <div class="step-number">3</div>
                <div class="step-text">Point camera at this QR code</div>
            </div>
            <div class="step">
                <div class="step-number">4</div>
                <div class="step-text">Start chatting with your AI agent!</div>
            </div>
        </div>
        
        <a href="${whatsappUrl}" class="fallback-link">
            💬 Or click here to chat directly
        </a>
        
        <div class="message-preview">
            <strong>Your message will be:</strong><br>
            "${message}"
        </div>
        
        <div class="footer">
            <p><strong>Available 24/7 • Instant Responses • Professional Service</strong></p>
            <p>Powered by AI • Ghana-focused Insurance Solutions</p>
        </div>
    </div>
</body>
</html>`;

    console.log('✅ Branded QR page generated successfully');
    res.send(html);

  } catch (error) {
    console.error('❌ Error generating branded QR code:', error);
    res.status(500).json({ 
      error: 'Failed to generate branded QR code',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Debug endpoint for QR code troubleshooting
 */
router.get('/qr-debug', (req: Request, res: Response) => {
  const businessPhoneNumber = process.env.WHATSAPP_BUSINESS_PHONE_NUMBER || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const message = "Hello! I'm interested in learning about insurance options.";
  const whatsappUrl = `https://wa.me/${businessPhoneNumber}?text=${encodeURIComponent(message)}`;
  
  res.json({
    success: true,
    debug: {
      businessPhoneNumber: businessPhoneNumber || 'NOT_SET',
      sampleWhatsAppUrl: whatsappUrl,
      googleChartsQR: `https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=${encodeURIComponent(whatsappUrl)}`,
      qrServerQR: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(whatsappUrl)}`,
      environment: {
        WHATSAPP_BUSINESS_PHONE_NUMBER: process.env.WHATSAPP_BUSINESS_PHONE_NUMBER || 'NOT_SET',
        WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || 'NOT_SET'
      }
    },
    testUrls: {
      htmlQR: `/api/whatsapp/qr-code/html?type=auto`,
      imageQR: `/api/whatsapp/qr-code?type=auto&size=300`,
      brandedQR: `/api/whatsapp/qr-code/branded?type=auto`,
      optinLink: `/api/whatsapp/optin-link?type=auto`
    }
  });
});


export default router;