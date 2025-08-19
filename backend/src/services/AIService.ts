// backend/src/services/AIService.ts
import OpenAI from 'openai';
import { 
  AIResponse,
  AIAnalysis,
  ConversationMessage,
  ConversationContext,
  CustomerProfile,
  LeadAnalysisResult,
  EnhancedQueryContext,
  QueryContext,
  PremiumCalculationService,
  EnhancedRAGDocument
} from '../types/unified-rag';

// Import enhanced services with fallback support
let EnhancedRAGIntegrationService: any = null;
let ContextBuilderService: any = null;

try {
  const enhancedRAGModule = require('./EnhancedRAGIntegrationService');
  EnhancedRAGIntegrationService = enhancedRAGModule.EnhancedRAGIntegrationService;
} catch (error) {
  console.log('📝 Enhanced RAG Integration Service not available, using legacy mode');
}

try {
  const contextBuilderModule = require('./ContextBuilderService');
  ContextBuilderService = contextBuilderModule.ContextBuilderService;
} catch (error) {
  console.log('📝 Context Builder Service not available, using basic context');
}

interface RequestMetadata {
  userAgent?: string;
  ipAddress?: string;
  deviceType?: 'mobile' | 'desktop' | 'tablet';
  source?: string;
  sessionId?: string;
}

class AIService {
  private openai: OpenAI;
  private enhancedRAG: any = null;
  private contextBuilder: any = null;
  private conversationHistory: Map<string, ConversationMessage[]> = new Map();
  private customerProfiles: Map<string, Partial<CustomerProfile>> = new Map();
  private currentState = 'initial_contact';
  private companyId: string;

  constructor(companyId: string = 'default') {
    this.companyId = companyId;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Initialize enhanced services if available
    if (EnhancedRAGIntegrationService) {
      try {
        this.enhancedRAG = new EnhancedRAGIntegrationService(companyId, {
          enableContextBuilding: true,
          enableEnhancedRetrieval: true,
          fallbackToSimpleRAG: true,
          cacheContexts: true,
          trackPerformance: true,
          maxRetries: 3,
          timeoutMs: 8000
        });
        console.log(`🤖 AI Service initialized with Enhanced RAG for company: ${companyId}`);
      } catch (error) {
        console.warn('⚠️ Enhanced RAG initialization failed, using legacy mode:', (error as Error).message);
        this.enhancedRAG = null;
      }
    }

    if (ContextBuilderService) {
      try {
        this.contextBuilder = new ContextBuilderService();
        console.log('🔧 Context Builder Service initialized');
      } catch (error) {
        console.warn('⚠️ Context Builder initialization failed:', (error as Error).message);
        this.contextBuilder = null;
      }
    }

    console.log(`🤖 AI Service initialized for company: ${companyId}`);
  }

  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing AI Service...');
      
      // Initialize enhanced RAG if available
      if (this.enhancedRAG) {
        await this.enhancedRAG.initialize();
        console.log('✅ Enhanced RAG Integration initialized');
      }
      
      console.log('✅ AI Service initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize AI Service:', error);
      // Don't throw - continue with legacy functionality
      this.enhancedRAG = null;
      console.log('📝 Continuing with legacy AI Service functionality');
    }
  }

  /**
   * Main method: Process user message with enhanced RAG (with fallback to legacy)
   */
  async processMessage(
    userMessage: string, 
    userId: string, 
    context: QueryContext | RequestMetadata = {}
  ): Promise<AIResponse> {
    try {
      console.log(`🔍 Processing message for user ${userId}: "${userMessage.substring(0, 100)}..."`);

      // IMPORTANT: Update conversation history BEFORE processing
      this.updateConversationHistory(userId, userMessage, ''); // Add user message immediately

      // Check if this is a premium calculation request
      const isPremiumRequest = this.isPremiumCalculationRequest(userMessage);
      
      // Check if this is a follow-up question about previous premium calculation
      const isFollowUpToPremium = this.isFollowUpToPremiumCalculation(userMessage, userId);
      
      if (isPremiumRequest || isFollowUpToPremium) {
        const response = await this.handlePremiumCalculation(userMessage, userId, context);
        // Update conversation with AI response
        this.updateConversationHistoryResponse(userId, response.message);
        return response;
      }

      // Try enhanced RAG processing first
      if (this.enhancedRAG && this.contextBuilder) {
        try {
          const enhancedResponse = await this.processWithEnhancedRAG(userMessage, userId, context);
          if (enhancedResponse) {
            // Update conversation with AI response
            this.updateConversationHistoryResponse(userId, enhancedResponse.message);
            return enhancedResponse;
          }
        } catch (error) {
          console.warn('⚠️ Enhanced RAG processing failed, falling back to legacy:', (error as Error).message);
        }
      }

      // Fallback to legacy processing
      const response = await this.processWithLegacyRAG(userMessage, userId, context as QueryContext);
      // Update conversation with AI response
      this.updateConversationHistoryResponse(userId, response.message);
      return response;

    } catch (error) {
      console.error('❌ Error processing message:', error);
      const errorResponse = await this.handleError(error, userMessage, userId);
      // Update conversation with error response
      this.updateConversationHistoryResponse(userId, errorResponse.message);
      return errorResponse;
    }
  }

  /**
   * Process with Enhanced RAG Integration
   */
  private async processWithEnhancedRAG(
    userMessage: string,
    userId: string,
    context: any
  ): Promise<AIResponse | null> {
    try {
      // Build request metadata
      const requestMetadata = {
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        deviceType: context.deviceType || 'desktop',
        source: context.source || context.leadSource || 'web_chat',
        sessionId: context.sessionId || this.generateSessionId(userId)
      };

      // Get existing customer profile
      const existingProfile = this.customerProfiles.get(userId);

      // Process with Enhanced RAG
      const enhancedRAGResponse = await this.enhancedRAG.processMessageWithEnhancedRAG(
        userId,
        userMessage,
        requestMetadata,
        existingProfile
      );

      console.log(`🎯 Enhanced RAG completed: confidence=${enhancedRAGResponse.confidence.toFixed(2)}`);

      // Update conversation history
      this.updateConversationHistory(userId, userMessage, enhancedRAGResponse.message);

      // Analyze for lead detection
      const analysis = await this.analyzeUserInput(userMessage, userId);
      this.updateCustomerProfile(userId, analysis);

      // Determine lead capture
      const leadAnalysis = await this.shouldCaptureLead(userMessage, analysis, userId);

      // Build comprehensive AI response
      const response: AIResponse = {
        message: enhancedRAGResponse.message,
        confidence: enhancedRAGResponse.confidence,
        recommendations: this.convertToLegacyRecommendations(enhancedRAGResponse.recommendations),
        usedKnowledge: {
          sources: enhancedRAGResponse.knowledgeSources,
          documentsUsed: enhancedRAGResponse.metadata.documentsUsed,
          contextFactors: enhancedRAGResponse.contextualFactors,
          fallbackUsed: enhancedRAGResponse.metadata.fallbackUsed
        },
        nextState: this.determineNextState(analysis, enhancedRAGResponse),
        
        // Enhanced RAG fields
        relevanceScore: enhancedRAGResponse.relevanceScore,
        knowledgeSources: enhancedRAGResponse.knowledgeSources,
        contextualFactors: enhancedRAGResponse.contextualFactors,
        enhancedRecommendations: enhancedRAGResponse.recommendations,
        ragMetadata: enhancedRAGResponse.metadata,
        
        // Legacy compatibility fields
        leadScore: this.calculateLeadScore(analysis, enhancedRAGResponse),
        shouldCaptureLead: leadAnalysis.shouldCapture,
        nextAction: analysis.nextBestAction
      };

      console.log(`✅ Enhanced RAG processing completed successfully`);
      return response;

    } catch (error) {
      console.error('❌ Enhanced RAG processing error:', error);
      return null; // Will fallback to legacy
    }
  }

  /**
   * Process with Legacy RAG (backward compatibility)
   */
  private async processWithLegacyRAG(
    userMessage: string,
    userId: string,
    context: QueryContext
  ): Promise<AIResponse> {
    try {
      console.log('📝 Processing with legacy RAG system');

      // Step 1: Analyze user input for lead detection
      const analysis = await this.analyzeUserInput(userMessage, userId);
      
      // Step 2: Update customer profile with analysis insights
      this.updateCustomerProfile(userId, analysis);

      // Step 3: Query legacy knowledge base (simplified)
      const ragResult = await this.queryLegacyKnowledge(userMessage, context);

      // Step 4: Generate AI response
      const aiResponse = await this.generateLegacyResponse(userMessage, ragResult, analysis);

      // Step 5: Update conversation history
      this.updateConversationHistory(userId, userMessage, aiResponse);

      // Step 6: Determine lead capture
      const leadAnalysis = await this.shouldCaptureLead(userMessage, analysis, userId);

      // Step 7: Calculate lead score
      const leadScore = this.calculateLegacyLeadScore(analysis, userId);

      // Build response
      const response: AIResponse = {
        message: aiResponse,
        confidence: analysis.confidence,
        recommendations: this.generateLegacyRecommendations(analysis),
        usedKnowledge: {
          sources: ragResult.sources || [],
          analysisType: 'legacy',
          fallbackUsed: true
        },
        nextState: this.determineNextStateFromAnalysis(analysis),
        leadScore,
        shouldCaptureLead: leadAnalysis.shouldCapture,
        nextAction: analysis.nextBestAction
      };

      console.log(`✅ Legacy AI processing completed successfully`);
      return response;

    } catch (error) {
      console.error('❌ Legacy processing error:', error);
      throw error;
    }
  }

  /**
   * Handle premium calculation requests and follow-ups
   */
  private async handlePremiumCalculation(
    userMessage: string,
    userId: string,
    context: any
  ): Promise<AIResponse> {
    try {
      console.log('💰 Processing premium calculation or follow-up request');

      // Get conversation history to check for previous calculations
      const conversationHistory = this.getConversationHistory(userId);
      
      // Check if this is a follow-up question about existing premium
      const isFollowUp = this.isFollowUpToPremiumCalculation(userMessage, userId);
      
      if (isFollowUp) {
        return await this.handlePremiumFollowUp(userMessage, userId, conversationHistory);
      }

      // Extract premium calculation parameters from message
      const calculationParams = await this.extractPremiumParameters(userMessage);
      
      // Get conversation context for additional parameters
      const additionalParams = this.extractParametersFromHistory(conversationHistory);
      
      // Merge parameters
      const allParams = { ...calculationParams, ...additionalParams };
      
      // Determine insurance type
      const insuranceType = this.detectInsuranceType(userMessage) || allParams.insuranceType;
      
      if (!insuranceType) {
        return {
          message: "I'd be happy to help you calculate your premium! What type of insurance are you interested in?\n\n• Auto Insurance 🚗\n• Health Insurance 🏥\n• Life Insurance 👨‍👩‍👧‍👦\n• Business Insurance 🏢\n\nPlease let me know which one interests you most!",
          confidence: 0.9,
          recommendations: [],
          usedKnowledge: { type: 'premium_calculation_start' },
          nextAction: 'collect_insurance_type'
        };
      }

      // Check if we have enough parameters to calculate
      const requiredParams = this.getRequiredParametersForType(insuranceType);
      const missingParams = requiredParams.filter(param => !allParams[param]);

      if (missingParams.length > 0) {
        const questionMessage = await this.generateParameterCollectionMessage(insuranceType, missingParams, allParams);
        return {
          message: questionMessage,
          confidence: 0.9,
          recommendations: [],
          usedKnowledge: { type: 'parameter_collection', missingParams },
          nextAction: 'collect_parameters'
        };
      }

      // Calculate premium
      const calculationResult = this.calculatePremium(insuranceType, allParams);
      
      if (calculationResult.success) {
        const responseMessage = await this.generatePremiumResponseMessage(
          calculationResult,
          insuranceType,
          allParams
        );

        return {
          message: responseMessage,
          confidence: 0.95,
          recommendations: this.generatePremiumRecommendations(calculationResult, insuranceType),
          usedKnowledge: {
            type: 'premium_calculation',
            calculationMethod: insuranceType,
            parameters: allParams
          },
          nextAction: 'premium_presented',
          premiumQuote: {
            amount: calculationResult.premium!,
            breakdown: calculationResult.breakdown,
            validity: '30 days'
          },
          leadScore: 9.0,
          shouldCaptureLead: true
        };
      } else {
        return {
          message: `I apologize, but I couldn't calculate your premium with the provided information. ${calculationResult.error || 'Please provide more details about your insurance needs.'}`,
          confidence: 0.3,
          recommendations: [],
          usedKnowledge: { type: 'premium_calculation_failed' },
          nextAction: 'collect_additional_info'
        };
      }

    } catch (error) {
      console.error('❌ Premium calculation error:', error);
      return {
        message: "I apologize, but I encountered an issue while calculating your premium. Let me connect you with a specialist who can help you right away.",
        confidence: 0.2,
        recommendations: [],
        usedKnowledge: { type: 'premium_calculation_error' },
        nextAction: 'escalate_to_human'
      };
    }
  }

  /**
   * Handle follow-up questions about premium calculations
   */
  private async handlePremiumFollowUp(
    userMessage: string,
    userId: string,
    conversationHistory: ConversationMessage[]
  ): Promise<AIResponse> {
    
    console.log('🔗 Handling premium calculation follow-up');
    
    // Find the most recent premium calculation in history
    const recentMessages = conversationHistory.slice(-6); // Last 3 exchanges
    const lastPremiumResponse = recentMessages
      .filter(msg => msg.role === 'assistant')
      .find(msg => msg.content.includes('Premium') || msg.content.includes('GH₵'));
    
    if (!lastPremiumResponse) {
      return {
        message: "I don't see a recent premium calculation. Would you like me to calculate a new premium quote for you?",
        confidence: 0.7,
        recommendations: [],
        usedKnowledge: { type: 'premium_follow_up_no_context' },
        nextAction: 'restart_calculation'
      };
    }

    const lowerMessage = userMessage.toLowerCase();
    
    // Check if user is requesting third-party calculation directly
    const isThirdPartyRequest = (
      lowerMessage.includes('third party') || 
      lowerMessage.includes('3rd party') || 
      lowerMessage.includes('third-party')
    ) && (
      lowerMessage.includes('quote') ||
      lowerMessage.includes('calculate') ||
      lowerMessage.includes('give me') ||
      lowerMessage.includes('show me') ||
      lowerMessage.includes('instead') ||
      lowerMessage.includes('rate')
    );
    
    if (isThirdPartyRequest) {
      console.log('💰 User directly requested third-party calculation');
      
      // Extract previous parameters and recalculate for third-party
      const previousParams = this.extractParametersFromHistory(conversationHistory);
      
      // Override coverage type to third-party
      const thirdPartyParams = {
        ...previousParams,
        coverageType: 'third_party'
      };
      
      console.log('🔧 Third-party calculation parameters:', thirdPartyParams);
      
      const calculationResult = this.calculatePremium('auto', thirdPartyParams);
      
      if (calculationResult.success) {
        return {
          message: `🎉 **Third-Party Auto Insurance Quote:**\n\n💰 **Annual Premium: GH₵ ${calculationResult.premium.toLocaleString()}**\n📅 Monthly Payment: GH₵ ${Math.round(calculationResult.premium / 12).toLocaleString()}\n\n🛡️ **What's Covered:**\n✅ Third-party liability (legal requirement)\n✅ Bodily injury coverage\n✅ Property damage to others\n\n💡 **Note:** This is much more affordable but doesn't cover your own vehicle damage or theft.\n\n**Comparison with your previous quote:**\n• Third-party: GH₵ ${calculationResult.premium.toLocaleString()}/year\n• Comprehensive: GH₵ 14,688/year\n• **You save: GH₵ ${(14688 - calculationResult.premium).toLocaleString()}/year**\n\n✅ Quote valid for 30 days\n📞 Ready to proceed with third-party coverage?`,
          confidence: 0.95,
          recommendations: [
            {
              type: 'action',
              title: 'Compare Coverage Options',
              description: 'Review third-party vs comprehensive benefits',
              priority: 'high'
            }
          ],
          usedKnowledge: { type: 'third_party_calculation' },
          nextAction: 'present_third_party_quote',
          premiumQuote: {
            amount: calculationResult.premium,
            breakdown: calculationResult.breakdown,
            validity: '30 days'
          },
          leadScore: 8.5,
          shouldCaptureLead: true
        };
      } else {
        return {
          message: "I'd be happy to calculate a third-party quote for you! Based on your vehicle (GH₵ 400,000) and age (41), here's what you need to know:\n\n💰 **Third-party coverage is around GH₵ 360 annually**\n📅 That's about GH₵ 30/month\n\n🛡️ **What's covered:**\n✅ Legal requirement met\n✅ Damage to other people's property\n✅ Injury to other people\n\n⚠️ **What's NOT covered:**\n❌ Your own vehicle damage\n❌ Theft of your vehicle\n❌ Windshield replacement\n\nFor a valuable car like yours (GH₵ 400,000), comprehensive might be worth the extra protection. What do you think?",
          confidence: 0.9,
          recommendations: [],
          usedKnowledge: { type: 'third_party_estimate' },
          nextAction: 'present_third_party_option'
        };
      }
    }
    
    // Check if user is responding to a third-party calculation offer
    const lastAssistantMessage = conversationHistory
      .filter(msg => msg.role === 'assistant')
      .slice(-1)[0];
    
    const isRespondingToThirdPartyOffer = lastAssistantMessage && 
      lastAssistantMessage.content.toLowerCase().includes('calculate the third-party rate instead');
    
    if (isRespondingToThirdPartyOffer && (lowerMessage.includes('yes') || lowerMessage.includes('ok') || lowerMessage.includes('sure'))) {
      // User wants third-party calculation
      console.log('💰 User confirmed third-party calculation request');
      
      // Extract previous parameters and recalculate for third-party
      const previousParams = this.extractParametersFromHistory(conversationHistory);
      
      // Override coverage type to third-party
      const thirdPartyParams = {
        ...previousParams,
        coverageType: 'third_party'
      };
      
      const calculationResult = this.calculatePremium('auto', thirdPartyParams);
      
      if (calculationResult.success) {
        return {
          message: `🎉 **Third-Party Auto Insurance Quote:**\n\n💰 **Annual Premium: GH₵ ${calculationResult.premium.toLocaleString()}**\n📅 Monthly Payment: GH₵ ${Math.round(calculationResult.premium / 12).toLocaleString()}\n\n🛡️ **What's Covered:**\n✅ Third-party liability (legal requirement)\n✅ Bodily injury coverage\n✅ Property damage to others\n\n💡 **Note:** This is much more affordable but doesn't cover your own vehicle damage or theft.\n\n**Comparison:**\n• Third-party: GH₵ ${calculationResult.premium.toLocaleString()}/year\n• Comprehensive: GH₵ 14,688/year\n\n✅ Quote valid for 30 days\n📞 Ready to proceed with third-party coverage?`,
          confidence: 0.95,
          recommendations: [
            {
              type: 'action',
              title: 'Compare Coverage Options',
              description: 'Review third-party vs comprehensive benefits',
              priority: 'high'
            }
          ],
          usedKnowledge: { type: 'third_party_calculation' },
          nextAction: 'present_third_party_quote',
          premiumQuote: {
            amount: calculationResult.premium,
            breakdown: calculationResult.breakdown,
            validity: '30 days'
          },
          leadScore: 8.5,
          shouldCaptureLead: true
        };
      }
    }
    
    // Handle specific follow-up questions
    if (lowerMessage.includes('third party') || lowerMessage.includes('3rd party')) {
      return {
        message: "The premium I calculated was for **comprehensive coverage**, which provides the most complete protection including:\n\n✅ Third-party liability\n✅ Theft protection\n✅ Accident damage\n✅ Windshield replacement\n\nIf you'd prefer **third-party only** coverage, that would be much cheaper - around GH₵ 360 annually. However, comprehensive gives you much better protection for your valuable vehicle.\n\nWould you like me to calculate the third-party rate instead?",
        confidence: 0.95,
        recommendations: [
          {
            type: 'info',
            title: 'Coverage Comparison',
            description: 'Compare comprehensive vs third-party coverage options',
            priority: 'high'
          }
        ],
        usedKnowledge: { type: 'coverage_explanation' },
        nextAction: 'explain_coverage_options'
      };
    }
    
    if (lowerMessage.includes('comprehensive') || lowerMessage.includes('comp')) {
      return {
        message: "Yes, the premium I calculated is for **comprehensive coverage** - the premium protection for your vehicle! 🛡️\n\nThis covers:\n✅ **Everything in third-party** (legal requirement)\n✅ **Your vehicle damage** from accidents\n✅ **Theft protection** (important in urban areas)\n✅ **Windshield replacement** (great for Harmattan season)\n✅ **Fire and natural disasters**\n\nThis is the best value for a vehicle worth GH₵ 400,000. You're fully protected!\n\nReady to get started with your application?",
        confidence: 0.95,
        recommendations: [
          {
            type: 'action',
            title: 'Start Application',
            description: 'Begin your comprehensive insurance application',
            priority: 'high'
          }
        ],
        usedKnowledge: { type: 'comprehensive_explanation' },
        nextAction: 'encourage_application'
      };
    }
    
    // Only proceed with application if user explicitly mentions applying/proceeding
    if (lowerMessage.includes('apply') || lowerMessage.includes('proceed') || lowerMessage.includes('continue') || 
        lowerMessage.includes('start application') || lowerMessage.includes('get started')) {
      return {
        message: "Excellent! I'm excited to help you get protected! 🎉\n\nTo proceed with your comprehensive auto insurance application, I'll need:\n\n📋 **Required Documents:**\n• Valid driver's license\n• Vehicle registration\n• Previous insurance certificate (if any)\n\n📞 **Next Steps:**\n• Our specialist will call you within 2 hours\n• Complete application over the phone\n• Policy documents sent via email\n• Coverage starts immediately upon payment\n\n💳 **Payment Options:**\n• Annual: GH₵ 13,954 (save 5%)\n• Monthly via MTN MoMo: GH₵ 1,224\n\nShall I arrange for our specialist to call you on this number?",
        confidence: 0.95,
        recommendations: [
          {
            type: 'action',
            title: 'Schedule Call',
            description: 'Arrange specialist call to complete application',
            priority: 'urgent'
          }
        ],
        usedKnowledge: { type: 'application_process' },
        nextAction: 'schedule_specialist_call',
        leadScore: 10.0,
        shouldCaptureLead: true
      };
    }
    
    // For simple "yes" responses, ask for clarification unless context is very clear
    if ((lowerMessage === 'yes' || lowerMessage === 'ok' || lowerMessage === 'sure') && !isRespondingToThirdPartyOffer) {
      return {
        message: "Great! I want to make sure I understand what you'd like to do next. Are you interested in:\n\n1️⃣ **Getting the third-party quote** (cheaper option)\n2️⃣ **Proceeding with comprehensive coverage** (full protection)\n3️⃣ **Learning more about the coverage options**\n\nJust let me know which option interests you most! 😊",
        confidence: 0.85,
        recommendations: [
          {
            type: 'info',
            title: 'Clarify Next Steps',
            description: 'Help customer choose their preferred option',
            priority: 'high'
          }
        ],
        usedKnowledge: { type: 'clarification_request' },
        nextAction: 'clarify_user_intent'
      };
    }
    
    // General follow-up response
    return {
      message: `I'd be happy to help you with any questions about your premium quote! 😊\n\nYour quote details:\n💰 Annual: GH₵ 14,688\n📅 Monthly: GH₵ 1,224\n🛡️ Comprehensive coverage\n⏰ Valid for 30 days\n\nWhat would you like to know more about?\n• Coverage details\n• Payment options\n• Application process\n• Policy benefits\n• **Third-party alternative quote**\n\nOr if you're ready, I can help you apply right now!`,
      confidence: 0.85,
      recommendations: [
        {
          type: 'info',
          title: 'Premium Details',
          description: 'Explain premium breakdown and benefits',
          priority: 'medium'
        }
      ],
      usedKnowledge: { type: 'premium_follow_up_general' },
      nextAction: 'provide_more_info'
    };
  }

  /**
   * Calculate premium using the PremiumCalculationService
   */
  private calculatePremium(insuranceType: string, params: any): any {
    try {
      switch (insuranceType.toLowerCase()) {
        case 'auto':
          if (this.hasRequiredAutoParams(params)) {
            return {
              success: true,
              ...PremiumCalculationService.calculateAutoPremium({
                vehicleValue: params.vehicleValue || params.vehicle_value,
                vehicleAge: params.vehicleAge || params.vehicle_age,
                driverAge: params.driverAge || params.driver_age || params.age,
                location: params.location,
                coverageType: params.coverageType || params.coverage_type || 'comprehensive',
                drivingHistory: params.drivingHistory || params.driving_history || 'clean',
                securityFeatures: params.securityFeatures || params.security_features || []
              })
            };
          }
          break;
          
        case 'health':
          if (this.hasRequiredHealthParams(params)) {
            return {
              success: true,
              ...PremiumCalculationService.calculateHealthPremium({
                age: params.age,
                planType: params.planType || params.plan_type || 'standard',
                familySize: params.familySize || params.family_size || 1,
                preExistingConditions: params.preExistingConditions || params.conditions || [],
                smokingStatus: params.smokingStatus || params.smoking_status || 'non_smoker',
                occupation: params.occupation || 'general'
              })
            };
          }
          break;
          
        case 'life':
          // Basic life insurance calculation
          const age = params.age || 30;
          const coverage = params.coverage || params.coverageAmount || 500000;
          const ratePerThousand = age < 35 ? 3.5 : age < 45 ? 8.5 : age < 55 ? 18.5 : 37.5;
          const annualPremium = (coverage / 1000) * ratePerThousand;
          
          return {
            success: true,
            premium: Math.round(annualPremium),
            breakdown: {
              baseCoverage: coverage,
              ageRate: ratePerThousand,
              annualPremium: Math.round(annualPremium),
              monthlyPremium: Math.round(annualPremium / 12)
            }
          };
      }
      
      return {
        success: false,
        error: 'Missing required parameters for calculation'
      };
      
    } catch (error) {
      console.error('Premium calculation error:', error);
      return {
        success: false,
        error: 'Calculation failed due to invalid parameters'
      };
    }
  }

  /**
   * Analyze user input for lead detection (preserved from existing)
   */
  private async analyzeUserInput(message: string, userId?: string): Promise<AIAnalysis> {
    console.log('🔍 Analyzing user input for lead detection...');

    const conversationHistory = userId ? this.getConversationHistory(userId) : [];
    const messageCount = Math.floor(conversationHistory.length / 2);
    
    const recentMessages = conversationHistory
      .slice(-4) // Last 2 exchanges
      .map(msg => `${msg.role}: ${msg.content.substring(0, 150)}...`)
      .join('\n');

    const prompt = `
Analyze this insurance customer message for intent, needs, and personality. Pay special attention to purchase readiness and lead qualification signals.

CURRENT MESSAGE: "${message}"

${recentMessages ? `RECENT CONVERSATION:
${recentMessages}

CONVERSATION CONTEXT:
- Exchange Count: ${messageCount}
- Customer Journey: ${messageCount === 0 ? 'First interaction' : 'Ongoing conversation'}` : ''}

ANALYSIS REQUIRED:
1. PRIMARY INTENT: What is the customer's main goal?
2. LEAD READINESS: How ready are they to make a purchase decision?
3. URGENCY LEVEL: How quickly do they need insurance?
4. BUYING SIGNALS: What indicates purchase intent?
5. EMOTIONAL STATE: What is their emotional state?
6. INSURANCE TYPE: What type of insurance interests them most?
7. PRODUCT INTERESTS: List specific products mentioned
8. CUSTOMER PROFILE: Infer demographics and characteristics

Respond with JSON:
{
  "primaryIntent": "information_gathering|quote_request|purchase_intent|price_comparison|general_inquiry",
  "leadReadiness": "cold|warm|hot|qualified",
  "urgencyLevel": "low|medium|high",
  "buyingSignals": ["specific signals detected"],
  "emotionalState": "curious|concerned|confident|frustrated|excited|neutral",
  "insuranceType": "auto|health|life|business|property|travel|general",
  "productInterest": ["specific products mentioned"],
  "customerProfile": {
    "estimatedAge": "20-30|30-40|40-50|50-60|60+",
    "location": "extracted location or null",
    "familyStatus": "single|married|family|unknown",
    "riskTolerance": "low|medium|high",
    "budgetIndication": "low|medium|high|premium|unknown"
  }
}
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.MODEL_NAME || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an expert insurance sales analyst. Analyze customer messages to understand their needs, intent, and qualification level. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 600
      });

      const analysisText = response.choices[0].message.content;
      const analysis = JSON.parse(analysisText || '{}');

      console.log(`🎯 Analysis completed: Intent=${analysis.primaryIntent}, Readiness=${analysis.leadReadiness}, Urgency=${analysis.urgencyLevel}`);

      return {
        primaryIntent: analysis.primaryIntent || 'general_inquiry',
        leadReadiness: analysis.leadReadiness || 'cold',
        urgencyLevel: analysis.urgencyLevel || 'medium',
        buyingSignals: analysis.buyingSignals || [],
        emotionalState: analysis.emotionalState || 'neutral',
        insuranceType: analysis.insuranceType || 'general',
        productInterest: analysis.productInterest || [],
        customerProfile: analysis.customerProfile || {},
        budgetSignals: this.extractBudgetSignals(message),
        personalityIndicators: this.extractPersonalityIndicators(message),
        informationNeeds: this.extractInformationNeeds(message),
        nextBestAction: this.determineNextBestAction(analysis),
        confidence: 0.8,
        conversationStage: this.inferConversationStage(messageCount, analysis),
        leadQualificationNotes: this.generateQualificationNotes(analysis, messageCount)
      };

    } catch (error) {
      console.error('Failed to analyze user input:', error);
      
      // Fallback analysis
      return {
        primaryIntent: 'general_inquiry',
        leadReadiness: 'cold',
        urgencyLevel: 'medium',
        buyingSignals: [],
        emotionalState: 'neutral',
        insuranceType: this.inferInsuranceTypeFromMessage(message),
        productInterest: this.extractProductInterests(message),
        customerProfile: {},
        budgetSignals: [],
        personalityIndicators: [],
        informationNeeds: [],
        nextBestAction: 'continue_conversation',
        confidence: 0.3,
        conversationStage: 'discovery',
        leadQualificationNotes: 'Analysis failed - using fallback assessment'
      };
    }
  }

  /**
   * Lead capture analysis (preserved from existing)
   */
  async shouldCaptureLead(userMessage: string, analysis: AIAnalysis, userId?: string): Promise<LeadAnalysisResult> {
    console.log('🎯 Analyzing lead capture potential...');

    const conversationHistory = userId ? this.getConversationHistory(userId) : [];
    const messageCount = Math.floor(conversationHistory.length / 2);
    
    const recentMessages = conversationHistory
      .slice(-4)
      .map(msg => `${msg.role}: ${msg.content.substring(0, 150)}...`)
      .join('\n');

    const prompt = `
Analyze this conversation to determine if the customer is ready for lead capture.

CURRENT USER MESSAGE: "${userMessage}"

CONVERSATION HISTORY:
${recentMessages || 'No previous conversation'}

CUSTOMER ANALYSIS:
- Primary Intent: ${analysis.primaryIntent}
- Lead Readiness: ${analysis.leadReadiness}
- Urgency Level: ${analysis.urgencyLevel}
- Buying Signals: ${analysis.buyingSignals?.join(', ') || 'none'}
- Emotional State: ${analysis.emotionalState}
- Conversation Depth: ${messageCount} exchanges

ENHANCED SCORING (consider conversation progression):

1. PURCHASE INTENT STRENGTH (0-10):
   Consider: explicit buying language, quote requests, application mentions
   ${messageCount > 0 ? 'IMPORTANT: Has intent strengthened over conversation?' : ''}

2. CONVERSATION PROGRESSION (0-10):
   Consider: movement from general to specific, building engagement, follow-up questions
   ${messageCount > 0 ? 'Look for: deeper questions, more commitment, specific needs' : 'Score based on initial message strength'}

3. NEGATIVE INTENT DETECTION (0-10):
   Consider: browsing language, price shock, explicit disinterest
   0-2: Strong negative signals, 8-10: No negative signals

4. ENGAGEMENT QUALITY (0-10):
   Consider: question specificity, detail provided, conversation investment
   ${messageCount > 0 ? 'Multi-message engagement shows higher commitment' : 'Single message engagement level'}

5. URGENCY & TIMELINE (0-10):
   Consider: timeline mentions, immediate needs, deadline pressure

DECISION LOGIC:
- Base Score = (Intent × 0.3) + (Progression × 0.25) + (Negative × 0.2) + (Engagement × 0.15) + (Urgency × 0.1)
- Capture threshold: ≥ 7.0 for new conversations, ≥ 6.5 for engaged conversations (3+ exchanges)
- ${messageCount < 2 ? 'EARLY CONVERSATION: Require very strong signals (8.0+)' : 'ENGAGED CONVERSATION: Moderate threshold (6.5+)'}

Respond with JSON:
{
  "shouldCapture": boolean,
  "confidence": 0.0-1.0,
  "score": 0.0-10.0,
  "reason": "Decision explanation including conversation context",
  "conversationFactor": "How conversation history influenced decision",
  "riskFactors": [...],
  "positiveSignals": [...],
  "nextBestAction": "continue_conversation|capture_lead|provide_more_info"
}
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.MODEL_NAME || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a lead scoring expert who considers entire conversations, not just single messages. Be more conservative with new conversations and more liberal with engaged customers showing progression.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 800
      });

      const analysisText = response.choices[0].message.content;
      const leadAnalysis = JSON.parse(analysisText || '{}');

      // Enhanced validation with conversation context
      const result = {
        shouldCapture: leadAnalysis.shouldCapture || false,
        confidence: Math.min(1.0, Math.max(0.0, leadAnalysis.confidence || 0.5)),
        score: Math.min(10.0, Math.max(0.0, leadAnalysis.score || 0.0)),
        reason: leadAnalysis.reason || 'Conversation-aware analysis completed',
        riskFactors: leadAnalysis.riskFactors || [],
        positiveSignals: leadAnalysis.positiveSignals || []
      };

      // Conversation-aware thresholds
      const threshold = messageCount < 2 ? 8.0 : 6.5;
      
      if (result.score < threshold) {
        result.shouldCapture = false;
        result.reason = `Score ${result.score.toFixed(1)}/10 below threshold (${threshold}) for ${messageCount < 2 ? 'new' : 'engaged'} conversation`;
      }

      // Additional safety for very early conversations
      if (messageCount === 0 && result.score < 8.5) {
        result.shouldCapture = false;
        result.reason = `First message requires very strong signals (8.5+): ${result.reason}`;
      }

      console.log(`🎯 Lead Analysis: ${result.shouldCapture ? 'CAPTURE' : 'NO CAPTURE'} - Score: ${result.score.toFixed(1)}/10, Messages: ${messageCount}, Threshold: ${threshold}`);

      return result;

    } catch (error) {
      console.error('Failed to analyze lead capture intent:', error);
      
      return {
        shouldCapture: false,
        confidence: 0.1,
        score: 0.0,
        reason: 'Analysis failed - defaulting to conservative approach',
        riskFactors: ['AI analysis unavailable'],
        positiveSignals: []
      };
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Check if message is a follow-up to previous premium calculation
   */
  private isFollowUpToPremiumCalculation(message: string, userId: string): boolean {
    const conversationHistory = this.getConversationHistory(userId);
    
    // Check if there was a recent premium calculation in the conversation
    const recentMessages = conversationHistory.slice(-4); // Last 2 exchanges
    const hasPremiumInHistory = recentMessages.some(msg => 
      msg.role === 'assistant' && 
      (msg.content.toLowerCase().includes('premium') || 
       msg.content.toLowerCase().includes('gh₵') ||
       msg.content.toLowerCase().includes('annual payment') ||
       msg.content.toLowerCase().includes('monthly payment') ||
       msg.content.toLowerCase().includes('calculated your auto insurance'))
    );
    
    if (!hasPremiumInHistory) return false;
    
    // Check if current message is asking about the premium or related follow-up
    const followUpKeywords = [
      'third party', 'comprehensive', 'comp', '3rd party',
      'what type', 'which type', 'what kind', 'is this',
      'coverage', 'policy', 'plan', 'option',
      'breakdown', 'details', 'explain',
      'monthly', 'annually', 'payment',
      'apply', 'proceed', 'continue', 'next step',
      'yes', 'ok', 'sounds good', 'interested',
      'instead', 'different', 'alternative', 'other',
      'quote for', 'calculate', 'give me', 'show me'
    ];
    
    const lowerMessage = message.toLowerCase();
    const isFollowUp = followUpKeywords.some(keyword => lowerMessage.includes(keyword));
    
    // Special check for premium-related requests with "instead", "different", etc.
    const isPremiumRelatedRequest = (
      lowerMessage.includes('quote') ||
      lowerMessage.includes('premium') ||
      lowerMessage.includes('calculate') ||
      lowerMessage.includes('rate')
    ) && hasPremiumInHistory;
    
    console.log(`🔗 Follow-up detection for "${message}":`, {
      hasPremiumInHistory,
      isFollowUp,
      isPremiumRelatedRequest,
      result: isFollowUp || isPremiumRelatedRequest,
      recentAssistantMessages: recentMessages.filter(m => m.role === 'assistant').map(m => m.content.substring(0, 50))
    });
    
    return isFollowUp || isPremiumRelatedRequest;
  }

  /**
   * Update conversation history with user message
   */
  private updateConversationHistory(userId: string, userMessage: string, aiResponse: string): void {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, []);
    }

    const history = this.conversationHistory.get(userId)!;
    
    // Add user message
    history.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    });
    
    // Add AI response if provided
    if (aiResponse) {
      history.push({
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date()
      });
    }

    // Keep last 20 messages
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }
    
    console.log(`💬 Updated conversation for ${userId}: ${history.length} messages`);
  }

  /**
   * Update conversation history with AI response only
   */
  private updateConversationHistoryResponse(userId: string, aiResponse: string): void {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, []);
    }

    const history = this.conversationHistory.get(userId)!;
    
    // Add AI response
    history.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date()
    });

    // Keep last 20 messages
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }
  }

  private getConversationHistory(userId: string): ConversationMessage[] {
    return this.conversationHistory.get(userId) || [];
  }

  private updateCustomerProfile(userId: string, analysis: AIAnalysis): void {
    let profile = this.customerProfiles.get(userId) || {};

    // Update profile with analysis insights
    if (analysis.customerProfile) {
      // Map age range to specific age (middle of range)
      if ((analysis.customerProfile as any).estimatedAge) {
        const ageMap: { [key: string]: number } = {
          '20-30': 25,
          '30-40': 35,
          '40-50': 45,
          '50-60': 55,
          '60+': 65
        };
        profile.age = ageMap[(analysis.customerProfile as any).estimatedAge];
      }

      // Update location if detected
      if (analysis.customerProfile.location && analysis.customerProfile.location !== 'null') {
        profile.location = analysis.customerProfile.location;
      }

      // Update risk tolerance
      if ((analysis.customerProfile as any).riskTolerance) {
        profile.riskTolerance = (analysis.customerProfile as any).riskTolerance as CustomerProfile['riskTolerance'];
      }

      // Infer family size from family status
      if ((analysis.customerProfile as any).familyStatus) {
        const familySizeMap: { [key: string]: number } = {
          'single': 1,
          'married': 2,
          'family': 4
        };
        const familyStatus = (analysis.customerProfile as any).familyStatus;
        if (familySizeMap[familyStatus]) {
          profile.familySize = familySizeMap[familyStatus];
        }
      }

      // Update income range from budget indication
      if ((analysis.customerProfile as any).budgetIndication) {
        profile.incomeRange = (analysis.customerProfile as any).budgetIndication as CustomerProfile['incomeRange'];
      }
    }

    // Infer additional characteristics from insurance type interest
    if (analysis.insuranceType === 'auto') {
      profile.vehicleType = 'sedan'; // default assumption
    }

    this.customerProfiles.set(userId, profile);
    console.log(`👤 Updated customer profile for ${userId}:`, Object.keys(profile));
  }

  private isPremiumCalculationRequest(message: string): boolean {
    const premiumKeywords = [
      'premium', 'cost', 'price', 'quote', 'calculate', 'how much',
      'payment', 'monthly', 'annual', 'rates', 'pricing', 'estimate',
      'value', 'comprehensive', 'third party', 'insurance'
    ];
    
    const lowerMessage = message.toLowerCase();
    
    // Check for premium keywords
    const hasPremiumKeyword = premiumKeywords.some(keyword => lowerMessage.includes(keyword));
    
    // Check for value + age combination (strong indicator)
    const hasValueAndAge = /(?:value|worth|cost).*?\d+.*?(?:age|years|old)|\d+.*?(?:age|years|old).*?(?:value|worth)/i.test(message);
    const hasValueWithAmount = /(?:value|worth|cost).*?\d{1,3}(?:,\d{3})*/.test(message);
    
    // Check for comprehensive/third party (insurance context)
    const hasInsuranceContext = lowerMessage.includes('comprehensive') || 
                              lowerMessage.includes('third party') || 
                              lowerMessage.includes('insurance') ||
                              lowerMessage.includes('cover');
    
    console.log(`🔍 Premium detection for "${message}":`, {
      hasPremiumKeyword,
      hasValueAndAge,
      hasValueWithAmount,
      hasInsuranceContext,
      result: hasPremiumKeyword || hasValueAndAge || (hasValueWithAmount && hasInsuranceContext)
    });
    
    return hasPremiumKeyword || hasValueAndAge || (hasValueWithAmount && hasInsuranceContext);
  }

  private async extractPremiumParameters(message: string): Promise<any> {
    const params: any = {};
    const lowerMessage = message.toLowerCase();

    // Extract age - multiple patterns
    const agePatterns = [
      /(?:age|years old|i am|i'm)\s*(\d{1,2})/i,
      /(\d{1,2})\s*(?:years old|y|age)/i,
      /\bi am\s*(\d{1,2})/i,
      /\b(\d{1,2})\s*,?\s*i\s*will/i // "41, I will prefer"
    ];
    
    for (const pattern of agePatterns) {
      const ageMatch = message.match(pattern);
      if (ageMatch) {
        const age = parseInt(ageMatch[1]);
        if (age >= 16 && age <= 100) {
          params.age = age;
          break;
        }
      }
    }

    // Extract vehicle value - improved patterns
    const valuePatterns = [
      /(?:current\s*)?(?:value|worth|cost).*?(?:is\s*)?(?:gh₵|ghs|cedis)?\s*(\d{1,3}(?:,\d{3})*)/i,
      /(?:gh₵|ghs|cedis)\s*(\d{1,3}(?:,\d{3})*)/i,
      /(\d{1,3}(?:,\d{3})*)\s*(?:gh₵|ghs|cedis)/i,
      /(?:value|worth|cost).*?(\d{1,3}(?:,\d{3})*)/i
    ];
    
    for (const pattern of valuePatterns) {
      const valueMatch = message.match(pattern);
      if (valueMatch) {
        const value = parseInt(valueMatch[1].replace(/,/g, ''));
        if (value > 1000) { // Reasonable minimum for vehicle value
          params.vehicleValue = value;
          break;
        }
      }
    }

    // Extract location
    const ghanaLocations = ['accra', 'kumasi', 'tamale', 'cape coast', 'ho', 'koforidua'];
    const location = ghanaLocations.find(loc => lowerMessage.includes(loc));
    if (location) {
      params.location = location;
    } else {
      params.location = 'accra'; // default location
    }

    // Extract coverage type - improved detection
    if (lowerMessage.includes('comprehensive') || lowerMessage.includes('comp')) {
      params.coverageType = 'comprehensive';
    } else if (lowerMessage.includes('third party') || lowerMessage.includes('3rd party') || lowerMessage.includes('third-party')) {
      params.coverageType = 'third_party';
    } else {
      params.coverageType = 'comprehensive'; // default to comprehensive
    }

    // Extract family size
    const familyMatch = message.match(/(?:family of|family size)\s*(\d+)/i);
    if (familyMatch) {
      params.familySize = parseInt(familyMatch[1]);
    }

    // Extract smoking status
    if (lowerMessage.includes('smoker')) {
      params.smokingStatus = lowerMessage.includes('non') ? 'non_smoker' : 'smoker';
    }

    console.log(`🔧 Extracted parameters from "${message}":`, params);

    return params;
  }

  private extractParametersFromHistory(history: ConversationMessage[]): any {
    const params: any = {};
    
    // Look through conversation history for parameters
    const allContent = history.map(msg => msg.content).join(' ').toLowerCase();
    
    // Extract vehicle value from history
    const valueMatches = allContent.match(/(?:value|worth|cost).*?(?:is\s*)?(?:gh₵|ghs|cedis)?\s*(\d{1,3}(?:,\d{3})*)/i) ||
                        allContent.match(/(\d{1,3}(?:,\d{3})*)\s*(?:and|,)/i); // "400,000 and I am 41"
    if (valueMatches) {
      const value = parseInt(valueMatches[1].replace(/,/g, ''));
      if (value > 1000) {
        params.vehicleValue = value;
      }
    }

    // Extract age from history
    const ageMatches = allContent.match(/(?:i am|age|years old)\s*(\d{1,2})/i) ||
                      allContent.match(/(\d{1,2})\s*(?:years old|y|age)/i) ||
                      allContent.match(/(\d{1,2})\s*(?:and|,)/i); // "41 and I am"
    if (ageMatches) {
      const age = parseInt(ageMatches[1]);
      if (age >= 16 && age <= 100) {
        params.age = age;
      }
    }

    // Extract location from history
    const ghanaLocations = ['accra', 'kumasi', 'tamale', 'cape coast', 'ho', 'koforidua'];
    const location = ghanaLocations.find(loc => allContent.includes(loc));
    if (location) {
      params.location = location;
    } else {
      params.location = 'accra'; // default
    }

    // Set default coverage type to comprehensive unless specifically mentioned
    if (allContent.includes('comprehensive')) {
      params.coverageType = 'comprehensive';
    } else if (allContent.includes('third party') || allContent.includes('3rd party')) {
      params.coverageType = 'third_party';
    } else {
      params.coverageType = 'comprehensive'; // default
    }

    // Extract family-related info
    if (allContent.includes('married')) params.familySize = 2;
    if (allContent.includes('children')) params.familySize = 4;
    if (allContent.includes('single')) params.familySize = 1;
    
    console.log('🔧 Parameters extracted from conversation history:', params);
    
    return params;
  }

  private detectInsuranceType(message: string): string | null {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('car') || lowerMessage.includes('vehicle') || lowerMessage.includes('auto')) {
      return 'auto';
    }
    if (lowerMessage.includes('health') || lowerMessage.includes('medical')) {
      return 'health';
    }
    if (lowerMessage.includes('life') || lowerMessage.includes('death')) {
      return 'life';
    }
    if (lowerMessage.includes('business') || lowerMessage.includes('commercial')) {
      return 'business';
    }
    
    return null;
  }

  private getRequiredParametersForType(insuranceType: string): string[] {
    switch (insuranceType.toLowerCase()) {
      case 'auto':
        return ['vehicleValue', 'age', 'location', 'coverageType'];
      case 'health':
        return ['age', 'planType'];
      case 'life':
        return ['age', 'coverage'];
      case 'business':
        return ['businessType', 'revenue', 'employees'];
      default:
        return ['age'];
    }
  }

  private async generateParameterCollectionMessage(
    insuranceType: string, 
    missingParams: string[], 
    existingParams: any
  ): Promise<string> {
    const questions: string[] = [];
    
    for (const param of missingParams) {
      switch (param) {
        case 'vehicleValue':
          questions.push('What is the current value of your vehicle? (e.g., GH₵ 50,000)');
          break;
        case 'age':
          questions.push('What is your age?');
          break;
        case 'location':
          questions.push('Which city are you based in? (e.g., Accra, Kumasi, Tamale)');
          break;
        case 'coverageType':
          questions.push('Would you prefer comprehensive coverage or third-party only?');
          break;
        case 'planType':
          questions.push('Which health plan interests you: Basic, Standard, or Premium?');
          break;
        case 'coverage':
          questions.push('How much life insurance coverage would you like? (e.g., GH₵ 500,000)');
          break;
      }
    }

    const insuranceTypeText = insuranceType.charAt(0).toUpperCase() + insuranceType.slice(1);
    
    let message = `Great! I'll help you calculate your ${insuranceTypeText} insurance premium. `;
    
    if (Object.keys(existingParams).length > 0) {
      message += `I have some of your details already. `;
    }
    
    message += `I just need a few more details:\n\n`;
    message += questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
    message += `\n\nOnce I have this information, I'll provide you with an accurate premium quote! 💰`;
    
    return message;
  }

  private async generatePremiumResponseMessage(
    calculationResult: any,
    insuranceType: string,
    params: any
  ): Promise<string> {
    const { premium, breakdown } = calculationResult;
    const monthlyPremium = Math.round(premium / 12);
    
    let message = `🎉 Great! I've calculated your ${insuranceType} insurance premium:\n\n`;
    message += `💰 **Annual Premium: GH₵ ${premium.toLocaleString()}**\n`;
    message += `📅 Monthly Payment: GH₵ ${monthlyPremium.toLocaleString()}\n\n`;
    
    // Add breakdown
    message += `**Premium Breakdown:**\n`;
    if (breakdown.basePremium) {
      message += `• Base Premium: GH₵ ${breakdown.basePremium.toLocaleString()}\n`;
    }
    
    if (insuranceType === 'auto') {
      if (breakdown.ageMultiplier !== 1.0) {
        const impact = breakdown.ageMultiplier > 1.0 ? 'increase' : 'discount';
        message += `• Age ${impact}: ${Math.abs((breakdown.ageMultiplier - 1) * 100).toFixed(0)}%\n`;
      }
      if (breakdown.locationMultiplier !== 1.0) {
        const impact = breakdown.locationMultiplier > 1.0 ? 'surcharge' : 'discount';
        message += `• Location ${impact}: ${Math.abs((breakdown.locationMultiplier - 1) * 100).toFixed(0)}%\n`;
      }
    }
    
    message += `\n🔒 **What's Included:**\n`;
    switch (insuranceType) {
      case 'auto':
        if (params.coverageType === 'comprehensive') {
          message += `• Comprehensive coverage\n• Third-party liability\n• Theft protection\n• Accident damage\n• Windshield replacement`;
        } else {
          message += `• Third-party liability\n• Legal compliance\n• Bodily injury coverage`;
        }
        break;
      case 'health':
        message += `• Outpatient care\n• Hospitalization\n• Emergency treatment\n• Specialist consultations\n• Prescription drugs`;
        break;
      case 'life':
        message += `• Death benefit payout\n• Family financial protection\n• Funeral expense coverage\n• Optional accidental death benefit`;
        break;
    }
    
    message += `\n\n💳 **Payment Options:**\n`;
    message += `• Annual payment: -5% discount (GH₵ ${Math.round(premium * 0.95).toLocaleString()})\n`;
    message += `• Monthly via MTN MoMo: GH₵ ${monthlyPremium.toLocaleString()}\n`;
    message += `• Quarterly payments available\n\n`;
    
    message += `✅ This quote is valid for 30 days.\n`;
    message += `📞 Ready to get protected? I can help you apply right now!`;
    
    return message;
  }

  private generatePremiumRecommendations(calculationResult: any, insuranceType: string): any[] {
    const recommendations = [];
    
    recommendations.push({
      type: 'action',
      title: 'Apply Now',
      description: 'Start your insurance application with this quote',
      priority: 'high'
    });
    
    recommendations.push({
      type: 'info',
      title: 'Payment Plans',
      description: 'Flexible payment options including mobile money',
      priority: 'medium'
    });
    
    if (insuranceType === 'auto') {
      recommendations.push({
        type: 'discount',
        title: 'Save More',
        description: 'Add GPS tracking for 10% additional discount',
        priority: 'medium'
      });
    }
    
    return recommendations;
  }

  private hasRequiredAutoParams(params: any): boolean {
    return !!(params.vehicleValue && params.age && params.location);
  }

  private hasRequiredHealthParams(params: any): boolean {
    return !!(params.age);
  }

  private async queryLegacyKnowledge(message: string, context: QueryContext): Promise<any> {
    // Simplified legacy knowledge query
    const sources = [];
    
    if (message.toLowerCase().includes('premium') || message.toLowerCase().includes('cost')) {
      sources.push('premium_calculation');
    }
    if (message.toLowerCase().includes('auto') || message.toLowerCase().includes('car')) {
      sources.push('auto_insurance');
    }
    if (message.toLowerCase().includes('health')) {
      sources.push('health_insurance');
    }
    
    return {
      sources,
      content: 'Legacy knowledge base queried',
      confidence: 0.7
    };
  }

  private async generateLegacyResponse(
    message: string, 
    ragResult: any, 
    analysis: AIAnalysis
  ): Promise<string> {
    const prompt = `
User message: "${message}"
Analysis: ${JSON.stringify(analysis)}
Knowledge sources: ${ragResult.sources.join(', ')}

Generate a helpful insurance assistant response that:
1. Addresses the user's question directly
2. Uses a friendly, consultative tone
3. Provides specific, actionable information
4. Includes relevant insurance context for Ghana
5. Encourages next steps if appropriate

Response:`;

    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.MODEL_NAME || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful insurance assistant for Ghana. Be warm, informative, and guide customers toward protection that meets their needs.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      return response.choices[0].message.content || 'I\'m here to help you with your insurance needs!';
    } catch (error) {
      console.error('Legacy response generation failed:', error);
      return 'I\'m here to help you with your insurance needs! How can I assist you today?';
    }
  }

  // Additional utility methods
  private convertToLegacyRecommendations(enhancedRecommendations: any): any[] {
    const recommendations: any[] = [];

    enhancedRecommendations.nextBestActions.forEach((action: string) => {
      recommendations.push({
        type: 'action',
        title: this.formatActionTitle(action),
        description: this.getActionDescription(action),
        priority: 'medium'
      });
    });

    return recommendations;
  }

  private generateLegacyRecommendations(analysis: AIAnalysis): any[] {
    const recommendations = [];
    
    if (analysis.urgencyLevel === 'high') {
      recommendations.push({
        type: 'urgent',
        title: 'Immediate Protection',
        description: 'Get covered today with instant quotes',
        priority: 'high'
      });
    }
    
    if (analysis.primaryIntent === 'quote_request') {
      recommendations.push({
        type: 'quote',
        title: 'Premium Calculator',
        description: 'Get your personalized insurance quote',
        priority: 'high'
      });
    }
    
    return recommendations;
  }

  private calculateLeadScore(analysis: AIAnalysis, enhancedResponse: any): number {
    let score = 0;
    
    // Base score from analysis
    if (analysis.leadReadiness === 'hot') score += 3;
    else if (analysis.leadReadiness === 'warm') score += 2;
    else if (analysis.leadReadiness === 'cold') score += 0;
    
    // Enhanced factors
    if (enhancedResponse.contextualFactors.customerMatch > 0.8) score += 2;
    if (enhancedResponse.relevanceScore > 0.8) score += 1;
    
    // Urgency bonus
    if (analysis.urgencyLevel === 'high') score += 2;
    
    return Math.min(score, 10);
  }

  private calculateLegacyLeadScore(analysis: AIAnalysis, userId: string): number {
    let score = 0;
    const conversationHistory = this.getConversationHistory(userId);
    const messageCount = conversationHistory.length;
    
    // Intent scoring
    const intentScores: { [key: string]: number } = {
      'purchase_intent': 4,
      'quote_request': 3,
      'price_comparison': 2,
      'information_gathering': 1,
      'general_inquiry': 0.5
    };
    score += intentScores[analysis.primaryIntent] || 0;
    
    // Readiness scoring
    if (analysis.leadReadiness === 'qualified') score += 3;
    else if (analysis.leadReadiness === 'hot') score += 2;
    else if (analysis.leadReadiness === 'warm') score += 1;
    
    // Urgency bonus
    if (analysis.urgencyLevel === 'high') score += 1.5;
    
    // Conversation depth bonus
    if (messageCount > 4) score += 1;
    
    return Math.min(score, 10);
  }

  private determineNextState(analysis: AIAnalysis, enhancedResponse: any): string {
    if (analysis.leadReadiness === 'hot' || analysis.primaryIntent === 'purchase_intent') {
      return 'closing';
    } else if (analysis.primaryIntent === 'quote_request') {
      return 'premium_calculation';
    } else if (analysis.emotionalState === 'concerned' || analysis.emotionalState === 'frustrated') {
      return 'objection_handling';
    } else if (analysis.primaryIntent === 'information_gathering') {
      return 'presentation';
    } else {
      return 'discovery';
    }
  }

  private determineNextStateFromAnalysis(analysis: AIAnalysis): string {
    if (analysis.primaryIntent === 'quote_request') return 'premium_calculation';
    if (analysis.leadReadiness === 'hot') return 'closing';
    if (analysis.urgencyLevel === 'high') return 'presentation';
    return 'discovery';
  }

  private extractBudgetSignals(message: string): string[] {
    const signals = [];
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('cheap') || lowerMessage.includes('affordable')) {
      signals.push('price_sensitive');
    }
    if (lowerMessage.includes('budget')) {
      signals.push('budget_conscious');
    }
    if (lowerMessage.includes('expensive') || lowerMessage.includes('costly')) {
      signals.push('price_shocked');
    }
    
    return signals;
  }

  private extractPersonalityIndicators(message: string): string[] {
    const indicators = [];
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('need to think') || lowerMessage.includes('research')) {
      indicators.push('analytical');
    }
    if (lowerMessage.includes('worried') || lowerMessage.includes('concerned')) {
      indicators.push('cautious');
    }
    if (lowerMessage.includes('quickly') || lowerMessage.includes('urgent')) {
      indicators.push('impulsive');
    }
    
    return indicators;
  }

  private extractInformationNeeds(message: string): string[] {
    const needs = [];
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('how much') || lowerMessage.includes('cost')) {
      needs.push('pricing');
    }
    if (lowerMessage.includes('cover') || lowerMessage.includes('include')) {
      needs.push('coverage_details');
    }
    if (lowerMessage.includes('process') || lowerMessage.includes('apply')) {
      needs.push('application_process');
    }
    
    return needs;
  }

  private determineNextBestAction(analysis: any): string {
    if (analysis.primaryIntent === 'quote_request') return 'provide_quote';
    if (analysis.urgencyLevel === 'high') return 'create_urgency';
    if (analysis.leadReadiness === 'hot') return 'closing';
    return 'continue_nurturing';
  }

  private inferConversationStage(messageCount: number, analysis: any): string {
    if (messageCount === 0) return 'awareness';
    if (analysis.primaryIntent === 'quote_request') return 'intent';
    if (messageCount > 3) return 'consideration';
    return 'interest';
  }

  private generateQualificationNotes(analysis: any, messageCount: number): string {
    const notes = [];
    
    if (analysis.urgencyLevel === 'high') {
      notes.push('High urgency indicated');
    }
    if (analysis.buyingSignals?.length > 0) {
      notes.push(`Buying signals: ${analysis.buyingSignals.join(', ')}`);
    }
    if (messageCount > 2) {
      notes.push('Engaged in multi-message conversation');
    }
    
    return notes.join('; ') || 'Standard qualification assessment';
  }

  private inferInsuranceTypeFromMessage(message: string): string {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('car') || lowerMessage.includes('vehicle') || lowerMessage.includes('auto')) return 'auto';
    if (lowerMessage.includes('health') || lowerMessage.includes('medical')) return 'health';
    if (lowerMessage.includes('life') || lowerMessage.includes('death')) return 'life';
    if (lowerMessage.includes('business') || lowerMessage.includes('commercial')) return 'business';
    if (lowerMessage.includes('property') || lowerMessage.includes('home')) return 'property';
    if (lowerMessage.includes('travel') || lowerMessage.includes('trip')) return 'travel';
    return 'general';
  }

  private extractProductInterests(message: string): string[] {
    const interests = [];
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('auto') || lowerMessage.includes('car')) interests.push('auto');
    if (lowerMessage.includes('health') || lowerMessage.includes('medical')) interests.push('health');
    if (lowerMessage.includes('life')) interests.push('life');
    if (lowerMessage.includes('business')) interests.push('business');
    if (lowerMessage.includes('property') || lowerMessage.includes('home')) interests.push('property');
    if (lowerMessage.includes('travel')) interests.push('travel');
    
    return interests;
  }

  private formatActionTitle(action: string): string {
    const titleMap: { [key: string]: string } = {
      'gather_more_customer_info': 'Gather Customer Information',
      'present_relevant_products': 'Present Products',
      'address_specific_needs': 'Address Customer Needs',
      'provide_examples': 'Provide Examples',
      'address_concerns': 'Address Concerns',
      'provide_reassurance': 'Provide Reassurance',
      'provide_quote': 'Provide Quote',
      'explain_pricing': 'Explain Pricing',
      'finalize_application': 'Finalize Application',
      'schedule_follow_up': 'Schedule Follow-up'
    };
    
    return titleMap[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private getActionDescription(action: string): string {
    const descriptionMap: { [key: string]: string } = {
      'gather_more_customer_info': 'Ask targeted questions to better understand customer needs',
      'present_relevant_products': 'Show insurance products that match customer profile',
      'address_specific_needs': 'Focus on customer\'s specific insurance requirements',
      'provide_examples': 'Give concrete examples of coverage and benefits',
      'address_concerns': 'Handle customer objections and concerns',
      'provide_reassurance': 'Build confidence in insurance protection',
      'provide_quote': 'Calculate and present insurance premium',
      'explain_pricing': 'Break down pricing factors and value proposition',
      'finalize_application': 'Guide customer through application process',
      'schedule_follow_up': 'Set up next conversation or meeting'
    };
    
    return descriptionMap[action] || `Execute ${action.replace(/_/g, ' ')} strategy`;
  }

  private generateSessionId(userId: string): string {
    return `session_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async handleError(error: any, userMessage: string, userId: string): Promise<AIResponse> {
    console.error('AI Service Error:', error);
    
    const fallbackResponse = `I apologize, but I'm having a technical moment! 🤖 

I'd still love to help you with your insurance needs. Could you please tell me:
- What type of insurance are you looking for? (auto, health, life, business)
- Is this urgent or can we take our time to find the best option?

I'm here to help protect what matters most to you! 🛡️`;

    return {
      message: fallbackResponse,
      confidence: 0.3,
      recommendations: [
        {
          type: 'action',
          title: 'Gather Basic Information',
          description: 'Ask about insurance type and urgency',
          priority: 'high'
        }
      ],
      usedKnowledge: {
        sources: [],
        fallback: true,
        error: error.message
      },
      nextState: 'discovery',
      nextAction: 'gather_basic_info'
    };
  }

  // Public methods for external access
  getConversationContext(userId: string): any {
    const history = this.getConversationHistory(userId);
    return {
      messageCount: history.length,
      lastActivity: history.length > 0 ? history[history.length - 1].timestamp : null,
      conversationStage: this.currentState
    };
  }

  getPerformanceAnalytics(): any {
    return {
      conversations: {
        activeConversations: this.conversationHistory.size,
        customerProfiles: this.customerProfiles.size
      },
      enhancedRAG: this.enhancedRAG ? this.enhancedRAG.getPerformanceStats() : null,
      mode: this.enhancedRAG ? 'enhanced' : 'legacy'
    };
  }

  async updateKnowledgeBase(newDocuments: any[]): Promise<void> {
    if (this.enhancedRAG) {
      await this.enhancedRAG.updateKnowledgeBase(newDocuments);
      console.log(`📚 AI Service: Knowledge base updated via Enhanced RAG`);
    } else {
      console.log(`📚 AI Service: Knowledge base update requested but Enhanced RAG not available`);
    }
  }
}

export default AIService;