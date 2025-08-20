// File: backend/src/routes/resortChat.ts

import { Router, Request, Response } from 'express';
import GenericAIServiceWrapper from '../services/GenericAIServiceWrapper';
import { ResortDomainConfig } from '../config/ResortDomainConfig';
import { validateChatMessage } from '../middleware/validation';

const router = Router();
let genericResortService: GenericAIServiceWrapper;

// Initialize the generic resort service
const initializeService = async () => {
  if (!genericResortService) {
    try {
      genericResortService = new GenericAIServiceWrapper(ResortDomainConfig, 'default');
      await genericResortService.initialize();
      console.log('✅ Generic Resort Agent initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Generic Resort Agent:', error);
      throw error;
    }
  }
};

// Middleware to ensure service is initialized
router.use(async (req, res, next) => {
  try {
    await initializeService();
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Service initialization failed',
      message: 'Our resort agent is temporarily unavailable. Please try again in a moment.'
    });
  }
});

// Generic Resort Chat endpoint
router.post('/message', validateChatMessage, async (req: Request, res: Response) => {
  try {
    const { message, userId, context = {} } = req.body;

    console.log(`🌴 Processing RESORT message from user ${userId}: ${message}`);

    const response = await genericResortService.processMessage(message, userId, {
      ...context,
      domain: 'resort' // Ensure domain is set
    });

    res.json({
      success: true,
      agent: 'resort',
      data: {
        response: response.message,
        confidence: response.confidence,
        leadScore: response.leadScore,
        shouldCaptureLead: response.shouldCaptureLead,
        businessResult: response.businessResult,
        recommendations: response.recommendations,
        metadata: {
          usedKnowledge: response.usedKnowledge,
          nextState: response.nextState,
          timestamp: new Date().toISOString(),
          domain: 'resort',
          agent_type: 'generic'
        }
      }
    });

  } catch (error) {
    console.error('Generic Resort chat endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process message',
      message: 'I apologize, but I\'m experiencing technical difficulties. Please try again in a moment.'
    });
  }
});

// Get conversation context for generic resort agent
router.get('/context/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const context = genericResortService.getConversationContext(userId);

    res.json({
      success: true,
      agent: 'resort',
      data: {
        userId,
        context,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Generic Resort context endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve conversation context'
    });
  }
});

// Compare with original agent endpoint (for testing)
router.post('/compare', validateChatMessage, async (req: Request, res: Response) => {
  try {
    const { message, userId, context = {} } = req.body;
    
    // Process with generic agent
    const genericResponse = await genericResortService.processMessage(message, userId, context);
    
    res.json({
      success: true,
      comparison: {
        generic: {
          message: genericResponse.message,
          confidence: genericResponse.confidence,
          leadScore: genericResponse.leadScore,
          hasBusinessResult: !!genericResponse.businessResult
        },
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Compare endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process comparison'
    });
  }
});

// Health check for generic resort service
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'generic_resort_chat',
    status: 'operational',
    domain: 'resort',
    agent_type: 'generic',
    timestamp: new Date().toISOString()
  });
});

/**
 * Generate HTML page with QR code (CSP-compliant) for the Resort domain
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

export default router;
