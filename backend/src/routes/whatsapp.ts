// Generic WhatsApp Integration for Multi-Domain Support
// File: backend/src/routes/whatsapp.ts

import { Router, Request, Response } from 'express';
import GenericAIServiceWrapper from '../services/GenericAIServiceWrapper';
import Joi from 'joi';
import { InsuranceDomainConfig } from '../config/InsuranceDomainConfig';
import { WineRetailDomainConfig } from '../config/WineRetailDomainConfig';
import { PensionDomainConfig } from '../config/PensionDomainConfig';
import { getDomainConfig } from '../types/domain'; // If you implement other domains

const router = Router();

// Initialize AI services for different domains
const aiServices: Map<string, GenericAIServiceWrapper> = new Map();

// WhatsApp API Configuration
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'mytoken123';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

const initializeAIService = async (domain: string) => {
  if (!aiServices.has(domain)) {
    try {
      const domainConfig = getDomainConfig(domain); // Or use InsuranceDomainConfig directly
      const service = new GenericAIServiceWrapper(PensionDomainConfig, 'default');
      await service.initialize();
      aiServices.set(domain, service);
      console.log(`✅ ${domain} WhatsApp service initialized`);
    } catch (error) {
      console.error(`❌ Failed to initialize ${domain} WhatsApp service:`, error);
      throw error;
    }
  }
  return aiServices.get(domain)!;
};

// Request validation schemas
const webhookVerificationSchema = Joi.object({
  'hub.mode': Joi.string().valid('subscribe').required(),
  'hub.challenge': Joi.string().required(),
  'hub.verify_token': Joi.string().valid(WHATSAPP_VERIFY_TOKEN).required()
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

// WhatsApp webhook message handler
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      body.entry?.forEach(async (entry: any) => {
        entry.changes?.forEach(async (change: any) => {
          if (change.field === 'messages') {
            const messages = change.value.messages;
            
            if (messages) {
              for (const message of messages) {
                await handleWhatsAppMessage(message, change.value);
              }
            }
          }
        });
      });
    }

    res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    console.error('❌ WhatsApp webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Handle individual WhatsApp messages
async function handleWhatsAppMessage(message: any, value: any) {
  try {
    const phoneNumber = message.from;
    const messageText = message.text?.body;
    const messageType = message.type;

    if (messageType === 'text' && messageText) {
      console.log(`📱 WhatsApp message from ${phoneNumber}: ${messageText}`);

      // Determine domain based on message content or user context
      const domain = determineDomain(messageText, phoneNumber);
      
      // Initialize appropriate AI service
      const aiService = await initializeAIService(domain);

      // Process message with domain-specific context
      const response = await aiService.processMessage(messageText, phoneNumber, {
       // platform: 'whatsapp',
        //phoneNumber: phoneNumber,
       // domain: domain,
        leadSource: 'whatsapp'
      });

      // Send response back to WhatsApp
      await sendWhatsAppMessage(phoneNumber, response.message);

      // Handle lead capture
      if (response.shouldCaptureLead) {
        console.log(`🎯 WhatsApp lead captured for ${phoneNumber} in ${domain} domain`);
        await captureWhatsAppLead({
          phoneNumber,
          domain,
          message: messageText,
          response: response.message,
          leadScore: response.leadScore,
          businessResult: response.businessResult,
          platform: 'whatsapp'
        });
      }

      // Handle business logic results (quotes, calculations, etc.)
      if (response.businessResult) {
        console.log(`💼 WhatsApp business result for ${phoneNumber}:`, response.businessResult);
        
        // You could send formatted business results
        if (domain === 'insurance' && response.businessResult.premium) {
          const premiumMessage = formatInsurancePremium(response.businessResult);
          await sendWhatsAppMessage(phoneNumber, premiumMessage);
        }
      }

    } else {
      console.log(`📱 Non-text WhatsApp message from ${phoneNumber}: ${messageType}`);
      await sendWhatsAppMessage(phoneNumber, "I can help you with text messages. Please send me a text describing what you need!");
    }

  } catch (error) {
    console.error('❌ Error handling WhatsApp message:', error);
    
    // Send error message to user
    try {
      await sendWhatsAppMessage(message.from, "I'm experiencing some technical difficulties. Please try again in a moment.");
    } catch (sendError) {
      console.error('❌ Failed to send error message:', sendError);
    }
  }
}

// Determine domain based on message content
function determineDomain(messageText: string, phoneNumber: string): string {
  const lowerText = messageText.toLowerCase();
  
  // Domain detection logic
  if (lowerText.includes('insurance') || lowerText.includes('policy') || lowerText.includes('coverage') || lowerText.includes('premium')) {
    return 'insurance';
  }
  
  if (lowerText.includes('laptop') || lowerText.includes('phone') || lowerText.includes('electronics') || lowerText.includes('gadget')) {
    return 'electronics';
  }
  
  if (lowerText.includes('fashion') || lowerText.includes('clothes') || lowerText.includes('dress') || lowerText.includes('style')) {
    return 'fashion';
  }
  
  // Default to insurance for now
  return 'insurance';
}

// Send message to WhatsApp
async function sendWhatsAppMessage(phoneNumber: string, message: string) {
  try {
    const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    const response = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${whatsappToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        text: {
          body: message
        }
      })
    });

    if (!response.ok) {
      throw new Error(`WhatsApp API error: ${response.status}`);
    }

    console.log(`✅ WhatsApp message sent to ${phoneNumber}`);
  } catch (error) {
    console.error('❌ Failed to send WhatsApp message:', error);
    throw error;
  }
}

// Capture WhatsApp lead
async function captureWhatsAppLead(leadData: any) {
  try {
    // You can integrate with your existing lead capture system
    console.log('📋 Capturing WhatsApp lead:', leadData);
    
    // Example: Call your leads API
    // await leadsAPI.createLead({
    //   source: 'whatsapp',
    //   phoneNumber: leadData.phoneNumber,
    //   domain: leadData.domain,
    //   message: leadData.message,
    //   leadScore: leadData.leadScore,
    //   businessResult: leadData.businessResult,
    //   platform: 'whatsapp'
    // });
    
  } catch (error) {
    console.error('❌ Failed to capture WhatsApp lead:', error);
  }
}

// Format insurance premium for WhatsApp
function formatInsurancePremium(businessResult: any): string {
  return `🛡️ *Insurance Quote Ready!*

💰 *Premium:* GH₵${businessResult.premium}
📅 *Validity:* ${businessResult.validity}

*Breakdown:*
• Base Premium: GH₵${businessResult.breakdown?.base || 0}
• Fees: GH₵${businessResult.breakdown?.fees || 0}
• Tax: GH₵${businessResult.breakdown?.tax || 0}

Would you like to proceed with this coverage? Reply with *YES* to continue or ask me any questions! 

WhatsApp me anytime: wa.me/${process.env.WHATSAPP_PHONE_NUMBER}`;
}

// Enhanced domain detection with learning
function enhancedDomainDetection(messageText: string, phoneNumber: string): string {
  const lowerText = messageText.toLowerCase();
  
  // Insurance keywords
  const insuranceKeywords = ['insurance', 'policy', 'coverage', 'premium', 'claim', 'auto', 'health', 'life', 'protect', 'risk'];
  
  // Electronics keywords  
  const electronicsKeywords = ['laptop', 'phone', 'computer', 'gadget', 'tech', 'smartphone', 'tablet', 'gaming', 'specs'];
  
  // Fashion keywords
  const fashionKeywords = ['fashion', 'clothes', 'dress', 'style', 'outfit', 'wear', 'size', 'color', 'trend'];
  
  // Count keyword matches
  const insuranceScore = insuranceKeywords.filter(keyword => lowerText.includes(keyword)).length;
  const electronicsScore = electronicsKeywords.filter(keyword => lowerText.includes(keyword)).length;
  const fashionScore = fashionKeywords.filter(keyword => lowerText.includes(keyword)).length;
  
  // Determine domain by highest score
  if (insuranceScore >= electronicsScore && insuranceScore >= fashionScore) return 'insurance';
  if (electronicsScore >= fashionScore) return 'electronics';
  if (fashionScore > 0) return 'fashion';
  
  // Default fallback
  return 'insurance';
}

// WhatsApp message templates for different domains
const messageTemplates = {
  insurance: {
    welcome: "🛡️ Welcome to our AI Insurance Assistant! I can help you with auto, health, life, and business insurance. What coverage are you looking for?",
    quote: "💰 I can calculate a personalized quote for you! What type of insurance and coverage amount do you need?",
    error: "I'm here to help with all your insurance needs. Try asking about auto, health, or life insurance!"
  },
  electronics: {
    welcome: "💻 Hi! I'm your tech expert assistant. I can help you find laptops, phones, tablets, and more. What device are you looking for?",
    quote: "🔍 I can recommend the perfect device for your needs! What's your budget and primary use case?",
    error: "I specialize in electronics and gadgets. Ask me about phones, laptops, or any tech products!"
  },
  fashion: {
    welcome: "👗 Welcome to your personal style assistant! I can help with outfits, sizing, and fashion advice. What occasion are you styling for?",
    quote: "✨ Let me help you create the perfect look! What type of clothing and occasion are you shopping for?",
    error: "I'm your fashion expert! Ask me about outfits, styles, sizes, or any clothing needs."
  }
};

// Domain-specific message handling
async function handleDomainSpecificMessage(message: any, domain: string, aiResponse: any) {
  const phoneNumber = message.from;
  const templates = messageTemplates[domain as keyof typeof messageTemplates];
  
  // Send domain-specific follow-up if needed
  if (aiResponse.followUpQuestions && aiResponse.followUpQuestions.length > 0) {
    const followUpText = `\n\n❓ *Quick questions to help you better:*\n${aiResponse.followUpQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}`;
    await sendWhatsAppMessage(phoneNumber, followUpText);
  }
  
  // Send domain-specific CTAs based on conversation stage
  if (aiResponse.nextAction === 'provide_pricing' || aiResponse.nextAction === 'calculate_premium') {
    setTimeout(async () => {
      await sendWhatsAppMessage(phoneNumber, templates.quote);
    }, 2000);
  }
}

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



// Fixed Branded QR Route with Server-Side QR Generation
// Replace your /qr-code/branded route with this version

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
 * Generate HTML page with QR code (CSP-compliant)
 */
router.get('/qr-code/wine', async (req: Request, res: Response) => {
  try {
    const { type = 'general', size = '300' } = req.query;
    
    const businessPhoneNumber = process.env.WHATSAPP_BUSINESS_PHONE_NUMBER || process.env.WHATSAPP_PHONE_NUMBER_ID;
    
    if (!businessPhoneNumber) {
      return res.status(500).json({ 
        error: 'Business phone number not configured'
      });
    }

    const messages = {
      general: "Hello! I wouldd like to learn more about your wines and spirits.",
      red_wine: "Hello! I need a recommendation for a red wine.",
      white_wine: "Hello! I am looking for a nice white wine.",
      spirits: "Hello! I would like to know more about your spirits collection.",
      delivery: "Hello! I have a question about delivery."
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
    <title>WhatsApp QR Code -  Say Cheers Drinks</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #A04000 0%, #D4AC00 100%);
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
        .wine-icon {
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
            text-align: left;
        }
        .step {
            margin: 0.5rem 0;
            display: flex;
            align-items: center;
            justify-content: flex-start;
        }
        .step-number {
            background: #D4AC00;
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
            background: #A04000;
            color: white;
            padding: 10px 20px;
            border-radius: 25px;
            text-decoration: none;
            margin: 0.5rem;
            font-size: 14px;
            transition: background 0.3s;
        }
        .fallback-link:hover {
            background: #D4AC00;
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
                border: 2px solid #D4AC00;
            }
        }
    </style>
</head>
<body>
    <div class="qr-container">
        <div class="header">
            <div class="wine-icon">🍷</div>
            <h2>Say Cheers AI Agent</h2>
            <p><strong>All about wines</strong></p>
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
            <div class="feature">🥂 Expert recommendations</div>
            <div class="feature">🚚 Quick delivery in Ghana</div>
            <div class="feature">🎁 Find the perfect gift</div>
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
 * Generate HTML page with QR code (CSP-compliant) for the Pension/SSNIT domain
 */
router.get('/qr-code/pension', async (req: Request, res: Response) => {
  try {
    const { type = 'general', size = '300' } = req.query;
    
    const businessPhoneNumber = process.env.WHATSAPP_BUSINESS_PHONE_NUMBER || process.env.WHATSAPP_PHONE_NUMBER_ID;
    
    if (!businessPhoneNumber) {
      return res.status(500).json({ 
        error: 'Business phone number not configured'
      });
    }

    const messages = {
      general: "Hello! I have a question about my SSNIT pension.",
      statement: "Hi! I'd like to request my SSNIT statement of account.",
      benefit: "Hello! Can you help me calculate my estimated pension benefit?",
      contribution: "Hi! I need to know about my contribution history.",
      claim: "Hello! I need assistance with the pension claims process."
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
    <title>WhatsApp QR Code - SSNIT Pension Assistant</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #004481 0%, #002240 100%);
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
        .pension-icon {
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
            text-align: left;
        }
        .step {
            margin: 0.5rem 0;
            display: flex;
            align-items: center;
            justify-content: flex-start;
        }
        .step-number {
            background: #004481;
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
            background: #004481;
            color: white;
            padding: 10px 20px;
            border-radius: 25px;
            text-decoration: none;
            margin: 0.5rem;
            font-size: 14px;
            transition: background 0.3s;
        }
        .fallback-link:hover {
            background: #002240;
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
                border: 2px solid #004481;
            }
        }
    </style>
</head>
<body>
    <div class="qr-container">
        <div class="header">
            <div class="pension-icon">💼</div>
            <h2>SSNIT Pension AI Assistant</h2>
            <p><strong>Your Guide to SSNIT Services</strong></p>
            <p>Scan to start a WhatsApp chat</p>
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
            <div class="feature">📊 Check your account statement</div>
            <div class="feature">💰 Calculate estimated pension benefits</div>
            <div class="feature">📝 Get help with claims process</div>
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
                <div>Start chatting with your assistant!</div>
            </div>
        </div>
        
        <div style="margin-top: 1rem;">
            <a href="${whatsappUrl}" class="fallback-link">💬 Or click here to chat directly</a>
        </div>
        
        <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #eee; font-size: 12px; color: #666;">
            <p>Available 24/7 • Secure & Confidential • Accurate Information</p>
            <p><strong>Message:</strong> "${message}"</p>
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const qrImage = document.getElementById('qr-image');
            const errorMessage = document.getElementById('error-message');
            
            qrImage.addEventListener('error', function() {
                console.log('Primary QR failed, trying fallback...');
                this.src = '${fallbackQRUrl}';
                
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
    console.error('Error generating HTML QR code for Pension:', error);
    res.status(500).json({ error: 'Failed to generate HTML QR code' });
  }
});


//Resort
/**
 * Generate HTML page with QR code (CSP-compliant) for the Resort domain
 */
router.get('/qr-code/resort', async (req: Request, res: Response) => {
  try {
    const { type = 'general', size = '300' } = req.query;
    
    const businessPhoneNumber = process.env.WHATSAPP_BUSINESS_PHONE_NUMBER || process.env.WHATSAPP_PHONE_NUMBER_ID;
    
    if (!businessPhoneNumber) {
      return res.status(500).json({ 
        error: 'Business phone number not configured'
      });
    }

    const messages = {
      general: "Hello! I have a question about The BigBlue Resort & Spa.",
      accommodation: "Hi! Can you tell me more about your accommodations?",
      activities: "Hello! I'd like to learn about the activities at the resort.",
      booking: "Hi! I want to inquire about booking a room.",
      packages: "Hello! What kind of packages do you offer?"
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
    <title>WhatsApp QR Code - BigBlue Resort</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #007bff 0%, #002c6b 100%);
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
        .resort-icon {
            font-size: 3rem;
            margin-bottom: 0.5rem;
            color: #007bff;
        }
        .instructions {
            background: #f8f9fa;
            padding: 1rem;
            border-radius: 10px;
            margin-top: 1rem;
            font-size: 14px;
            line-height: 1.5;
            text-align: left;
        }
        .step {
            margin: 0.5rem 0;
            display: flex;
            align-items: center;
            justify-content: flex-start;
        }
        .step-number {
            background: #007bff;
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
            background: #007bff;
            color: white;
            padding: 10px 20px;
            border-radius: 25px;
            text-decoration: none;
            margin: 0.5rem;
            font-size: 14px;
            transition: background 0.3s;
        }
        .fallback-link:hover {
            background: #0056b3;
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
                border: 2px solid #007bff;
            }
        }
    </style>
</head>
<body>
    <div class="qr-container">
        <div class="header">
            <div class="resort-icon">🏨</div>
            <h2>BigBlue Resort & Spa</h2>
            <p><strong>Your Gateway to a relaxing stay</strong></p>
            <p>Scan to start a WhatsApp chat</p>
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
            <div class="feature">🛏️ Get details on our villas and suites</div>
            <div class="feature">🏖️ Discover exciting activities</div>
            <div class="feature">📞 Inquire about conference packages</div>
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
                <div>Start chatting with your assistant!</div>
            </div>
        </div>
        
        <div style="margin-top: 1rem;">
            <a href="${whatsappUrl}" class="fallback-link">💬 Or click here to chat directly</a>
        </div>
        
        <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #eee; font-size: 12px; color: #666;">
            <p>Available 24/7 • Secure & Confidential • Accurate Information</p>
            <p><strong>Message:</strong> "${message}"</p>
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const qrImage = document.getElementById('qr-image');
            const errorMessage = document.getElementById('error-message');
            
            qrImage.addEventListener('error', function() {
                console.log('Primary QR failed, trying fallback...');
                this.src = '${fallbackQRUrl}';
                
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
    console.error('Error generating HTML QR code for Resort:', error);
    res.status(500).json({ error: 'Failed to generate HTML QR code' });
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