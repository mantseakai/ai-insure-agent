// Unified RAG Types with Premium Calculation Support
// File: backend/src/types/unified-rag.ts

// ===== PREMIUM CALCULATION TYPES (Preserved from existing system) =====

export interface PremiumCalculationRule {
  factor: string;
  multiplier: number;
  condition: string;
  description: string;
}

export interface RiskFactor {
  name: string;
  weight: number;
  values: { [key: string]: number };
  description: string;
}

// Enhanced RAG Document with premium calculation support
export interface EnhancedRAGDocument {
  id: string;
  content: string;
  metadata: {
    type: 'product' | 'premium_calculation' | 'risk_factors' | 'objection' | 'process' | 'market_context' | 'regulatory' | 'claims' | 'pricing' | 'legal';
    category: string;
    subcategory?: string;
    priority: 'high' | 'medium' | 'low' | 'critical';
    
    // Premium calculation specific fields (preserved)
    calculationRules?: PremiumCalculationRule[];
    riskFactors?: RiskFactor[];
    
    // Enhanced RAG fields (new)
    productTypes?: string[];
    customerSegments?: string[];
    seasonalRelevance?: string[];
    locationRelevance?: string[];
    urgencyLevel?: string[];
    conversationStage?: string[];
    lastUpdated: Date;
    effectiveness?: number; // 0-1 based on historical performance
    tags?: string[];
    
    // Backward compatibility
    companyId: string;
    version: string;
  };
  embedding?: number[];
}

// ===== CUSTOMER PROFILE TYPES =====

export interface CustomerProfile {
  age?: number;
  location: string;
  riskTolerance: 'low' | 'medium' | 'high';
  previousClaims: boolean;
  familySize?: number;
  occupation?: string;
  incomeRange?: 'low' | 'medium' | 'high' | 'premium';
  vehicleType?: 'sedan' | 'suv' | 'truck' | 'motorcycle' | 'commercial';
  healthStatus?: 'excellent' | 'good' | 'fair' | 'poor';
  lifestyle?: 'conservative' | 'moderate' | 'active' | 'high_risk';
  
  // Additional profile fields for premium calculation
  drivingHistory?: 'clean' | 'one_claim' | 'multiple_claims';
  smokingStatus?: 'smoker' | 'non_smoker' | 'former_smoker';
  preExistingConditions?: string[];
  securityFeatures?: string[];
  vehicleValue?: number;
  vehicleAge?: number;
}

// ===== CONVERSATION CONTEXT TYPES =====

export interface ConversationContext {
  stage: 'greeting' | 'discovery' | 'presentation' | 'objection_handling' | 'closing' | 'premium_calculation';
  messageCount: number;
  averageResponseTime?: number; // seconds
  lastInteractionTime: Date;
  totalSessionTime?: number; // minutes
  topicsDiscussed?: string[];
  objections?: string[];
  questionsAsked?: number;
  informationProvided?: string[];
  lastCalculatedPremium?: {
    amount: number;
    breakdown: any;
    insuranceType: string;
    parameters: any;
    timestamp: Date;
    coverage: 'comprehensive' | 'third_party';
  };
  // Product context
  productType?: 'auto' | 'health' | 'life' | 'business' | 'travel' | 'property';
  
  // Customer information
  customerInfo: {
    name?: string;
    age?: number;
    location?: string;
    budget?: string;
    urgency?: 'high' | 'medium' | 'low';
    [key: string]: any; // For premium calculation parameters
  };
  
  // Premium calculation state (preserved from existing)
  premiumCalculationState?: {
    isActive: boolean;
    insuranceType?: string;
    collectedParams: { [key: string]: any };
    missingParams: string[];
    canCalculate: boolean;
  };
  
  // Lead management
  leadQualified: boolean;
  sentiment: 'positive' | 'neutral' | 'negative';
}

// ===== MARKET CONTEXT TYPES =====

export interface MarketContext {
  season: 'harmattan' | 'rainy' | 'dry' | 'christmas';
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: 'weekday' | 'weekend';
  marketConditions: {
    economicClimate: 'stable' | 'uncertain' | 'growth' | 'recession';
    competitorActivity: 'low' | 'medium' | 'high';
    regulatoryChanges: boolean;
  };
  localFactors: {
    recentIncidents: string[]; // Local accidents, floods, etc.
    areaRiskLevel: 'low' | 'medium' | 'high';
    popularPaymentMethods: ('mtn_momo' | 'vodafone_cash' | 'bank_transfer')[];
  };
}

// ===== PRODUCT CONTEXT TYPES =====

export interface ProductContext {
  primaryFocus: 'auto' | 'health' | 'life' | 'business' | 'travel' | 'property';
  secondaryInterests: string[];
  urgencyLevel: 'low' | 'medium' | 'high' | 'urgent';
  budgetRange?: {
    min?: number;
    max?: number;
    currency: 'GHS' | 'USD';
  };
  coveragePreferences: {
    comprehensive: boolean;
    thirdParty: boolean;
    personal: boolean;
    family: boolean;
  };
}

// ===== ENHANCED QUERY CONTEXT =====

export interface EnhancedQueryContext {
  customer: CustomerProfile;
  conversation: ConversationContext;
  market: MarketContext;
  product: ProductContext;
  metadata: {
    source: 'web_chat' | 'whatsapp' | 'social_media' | 'qr_code' | 'referral';
    deviceType: 'mobile' | 'desktop' | 'tablet';
    userAgent?: string;
    ipLocation?: string;
    sessionId: string;
    userId: string;
  };
}

// ===== BACKWARD COMPATIBILITY TYPES =====

// Legacy Document interface for backward compatibility
export interface Document {
  id: string;
  content: string;
  metadata: Record<string, any>;
}

// Legacy QueryContext for backward compatibility
export interface QueryContext {
  productType?: string;
  leadSource?: string;
  stage?: string;
  budget?: string;
  personalityType?: string;
  
  // Enhanced fields
  customerInfo?: { [key: string]: any };
  conversationHistory?: any[];
}

// Legacy AIAnalysis for backward compatibility
export interface AIAnalysis {
  primaryIntent: string;
  insuranceType?: string;
  urgencyLevel: 'high' | 'medium' | 'low';
  budgetSignals: string[];
  personalityIndicators: string[];
  objectionType?: string;
  buyingSignals: string[];
  emotionalState: string;
  informationNeeds: string[];
  nextBestAction: string;
  confidence: number;
  leadReadiness?: string;
  conversationStage?: string;
  leadQualificationNotes?: string;
  
  // Enhanced fields
  productInterest?: string[];
  customerProfile?: Partial<CustomerProfile>;
}

// ===== QUERY RESULTS =====

export interface ContextualQueryResult {
  documents: EnhancedRAGDocument[];
  context: string;
  confidence: number;
  relevanceScore: number;
  metadata: {
    hasProductInfo: boolean;
    hasObjectionHandling: boolean;
    hasMarketContext: boolean;
    hasPremiumCalculation: boolean;
    hasRiskFactors: boolean;
    hasClaimsInfo: boolean;
    hasLocalRelevance: boolean;
    calculationCapability?: boolean;
    seasonalRelevance: boolean;
  };
  contextualFactors: {
    customerMatch: number; // 0-1 how well docs match customer profile
    situationalRelevance: number; // 0-1 relevance to current situation
    marketAlignment: number; // 0-1 alignment with market conditions
    urgencyMatch: number; // 0-1 match with customer urgency
  };
  recommendations: {
    nextBestActions: string[];
    followUpQuestions: string[];
    additionalInfo: string[];
  };
  
  // Premium calculation support
  premiumCalculation?: {
    canCalculate: boolean;
    requiredFields: string[];
    estimatedRange?: { min: number; max: number };
  };
}

// Legacy EnhancedRAGQueryResult for backward compatibility
export interface EnhancedRAGQueryResult extends ContextualQueryResult {}

// ===== QUERY ENHANCEMENT =====

export interface QueryEnhancement {
  originalQuery: string;
  enhancedQuery: string;
  contextualTerms: string[];
  semanticExpansions: string[];
  filters: {
    productType?: string[];
    customerSegment?: string[];
    urgencyLevel?: string[];
    seasonalContext?: string[];
  };
  boostFactors: {
    recency: number;
    relevance: number;
    customerMatch: number;
    situational: number;
  };
}

// ===== PERFORMANCE METRICS =====

export interface RAGPerformanceMetrics {
  queryId: string;
  timestamp: Date;
  originalQuery: string;
  enhancedQuery: string;
  documentsRetrieved: number;
  averageRelevanceScore: number;
  responseTime: number; // milliseconds
  contextFactorsUsed: string[];
  userSatisfaction?: number; // 1-5 rating if available
  conversationOutcome?: 'continued' | 'lead_captured' | 'ended' | 'converted';
}

// ===== AI SERVICE RESPONSE TYPES =====

export interface AIResponse {
  message: string;
  confidence: number;
  recommendations: any[];
  usedKnowledge: any;
  nextState?: string;
  
  // Enhanced RAG fields
  relevanceScore?: number;
  knowledgeSources?: string[];
  contextualFactors?: {
    customerMatch: number;
    situationalRelevance: number;
    marketAlignment: number;
    urgencyMatch: number;
  };
  enhancedRecommendations?: {
    nextBestActions: string[];
    followUpQuestions: string[];
    additionalInfo: string[];
  };
  ragMetadata?: {
    queryEnhanced: boolean;
    documentsUsed: number;
    processingTime: number;
    fallbackUsed: boolean;
    contextBuilt: boolean;
  };
  
  // Legacy fields for backward compatibility
  leadScore?: number;
  shouldCaptureLead?: boolean;
  nextAction?: string;
  context?: ConversationContext;
  premiumQuote?: {
    amount: number;
    breakdown: any;
    validity: string;
  };
  followUpQuestions?: string[];
}

// ===== ENHANCED RAG RESPONSE =====

export interface EnhancedRAGResponse {
  message: string;
  confidence: number;
  relevanceScore: number;
  knowledgeSources: string[];
  contextualFactors: {
    customerMatch: number;
    situationalRelevance: number;
    marketAlignment: number;
    urgencyMatch: number;
  };
  recommendations: {
    nextBestActions: string[];
    followUpQuestions: string[];
    additionalInfo: string[];
  };
  metadata: {
    queryEnhanced: boolean;
    documentsUsed: number;
    processingTime: number;
    fallbackUsed: boolean;
    contextBuilt: boolean;
  };
}

// ===== LEAD ANALYSIS =====

export interface LeadAnalysisResult {
  shouldCapture: boolean;
  confidence: number;
  score: number;
  reason: string;
  riskFactors: string[];
  positiveSignals: string[];
}

// ===== CONVERSATION MESSAGE =====

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: any;
}

// ===== SEASONAL CONTEXT MAPPINGS =====

export const SEASONAL_CONTEXTS = {
  harmattan: {
    months: [11, 12, 1, 2, 3], // Nov-Mar
    risks: ['dust_damage', 'respiratory_issues', 'poor_visibility'],
    products: ['health', 'auto_windshield', 'respiratory_coverage'],
    messaging: ['dust_protection', 'health_during_harmattan']
  },
  rainy: {
    months: [4, 5, 6, 7, 8, 9, 10], // Apr-Oct
    risks: ['flooding', 'road_accidents', 'property_damage'],
    products: ['flood_insurance', 'comprehensive_auto', 'property'],
    messaging: ['flood_protection', 'rainy_season_safety']
  },
  christmas: {
    months: [12], // December
    risks: ['travel_accidents', 'theft', 'family_gatherings'],
    products: ['travel_insurance', 'family_coverage', 'security'],
    messaging: ['family_protection', 'holiday_travel_safety']
  }
} as const;

// ===== LOCATION-BASED RISK MAPPINGS =====

export const LOCATION_RISKS = {
  accra: ['traffic_accidents', 'theft', 'flooding_in_low_areas'],
  kumasi: ['traffic_accidents', 'dust', 'market_fires'],
  tamale: ['flooding', 'extreme_weather', 'livestock_risks'],
  coastal: ['flooding', 'storms', 'saltwater_damage'],
  rural: ['limited_medical_access', 'agricultural_risks', 'distance_to_services']
} as const;

// ===== CUSTOMER SEGMENT DEFINITIONS =====

export const CUSTOMER_SEGMENTS = {
  young_professional: {
    ageRange: [22, 35],
    characteristics: ['tech_savvy', 'budget_conscious', 'mobile_first'],
    preferences: ['digital_payments', 'quick_quotes', 'online_management']
  },
  family_oriented: {
    ageRange: [25, 50],
    characteristics: ['comprehensive_coverage', 'long_term_planning', 'family_protection'],
    preferences: ['family_discounts', 'multiple_products', 'trusted_advisors']
  },
  business_owner: {
    ageRange: [30, 65],
    characteristics: ['commercial_needs', 'liability_focused', 'tax_benefits'],
    preferences: ['business_packages', 'professional_service', 'risk_management']
  },
  senior: {
    ageRange: [55, 100],
    characteristics: ['health_focused', 'traditional_values', 'established_relationships'],
    preferences: ['personal_service', 'health_coverage', 'stable_providers']
  }
} as const;

// ===== PREMIUM CALCULATION SERVICE (Preserved from existing system) =====

export class PremiumCalculationService {
  
  /**
   * Calculate auto insurance premium based on multiple factors
   */
  static calculateAutoPremium(params: {
    vehicleValue: number;
    vehicleAge: number;
    driverAge: number;
    location: string;
    coverageType: 'comprehensive' | 'third_party';
    drivingHistory: 'clean' | 'one_claim' | 'multiple_claims';
    securityFeatures: string[];
  }): { premium: number; breakdown: any } {
    
    let basePremium = 0;
    
    // Base premium calculation
    if (params.coverageType === 'comprehensive') {
      basePremium = params.vehicleValue * 0.04; // 4% of vehicle value
    } else {
      basePremium = 360; // Fixed third party rate
    }
    
    // Age adjustments
    const ageMultiplier = this.getAgeMultiplier(params.driverAge);
    const locationMultiplier = this.getLocationMultiplier(params.location);
    const historyMultiplier = this.getHistoryMultiplier(params.drivingHistory);
    
    // Vehicle age discount
    const vehicleAgeDiscount = params.vehicleAge > 5 ? 0.9 : 1.0;
    
    // Security features discount
    const securityDiscount = this.calculateSecurityDiscount(params.securityFeatures);
    
    const finalPremium = basePremium * ageMultiplier * locationMultiplier * 
                        historyMultiplier * vehicleAgeDiscount * securityDiscount;
    
    return {
      premium: Math.round(finalPremium),
      breakdown: {
        basePremium: Math.round(basePremium),
        ageMultiplier,
        locationMultiplier,
        historyMultiplier,
        vehicleAgeDiscount,
        securityDiscount,
        finalPremium: Math.round(finalPremium)
      }
    };
  }
  
  /**
   * Calculate health insurance premium
   */
  static calculateHealthPremium(params: {
    age: number;
    planType: 'basic' | 'standard' | 'premium';
    familySize: number;
    preExistingConditions: string[];
    smokingStatus: 'smoker' | 'non_smoker' | 'former_smoker';
    occupation: string;
  }): { premium: number; breakdown: any } {
    
    // Base premiums by plan type
    const basePremiums = {
      basic: 225,    // Average of 150-300
      standard: 600, // Average of 400-800  
      premium: 1150  // Average of 800-1500
    };
    
    let basePremium = basePremiums[params.planType];
    
    // Age multiplier
    const ageMultiplier = this.getHealthAgeMultiplier(params.age);
    
    // Family discount (20% per additional member)
    const familyDiscount = Math.max(0.6, 1 - (params.familySize - 1) * 0.2);
    
    // Smoking multiplier
    const smokingMultipliers = {
      smoker: 1.25,
      non_smoker: 0.9,
      former_smoker: 1.1
    };
    
    const smokingMultiplier = smokingMultipliers[params.smokingStatus];
    
    // Pre-existing conditions impact
    const conditionsMultiplier = this.getConditionsMultiplier(params.preExistingConditions);
    
    const finalPremium = basePremium * ageMultiplier * familyDiscount * 
                        smokingMultiplier * conditionsMultiplier;
    
    return {
      premium: Math.round(finalPremium),
      breakdown: {
        basePremium,
        ageMultiplier,
        familyDiscount,
        smokingMultiplier,
        conditionsMultiplier,
        finalPremium: Math.round(finalPremium)
      }
    };
  }
  
  // Helper methods for multiplier calculations
  private static getAgeMultiplier(age: number): number {
    if (age < 25) return 1.4;
    if (age <= 35) return 1.0;
    if (age <= 55) return 0.9;
    return 0.95;
  }
  
  private static getLocationMultiplier(location: string): number {
    const locationMap: { [key: string]: number } = {
      'accra': 1.2,
      'kumasi': 1.2,
      'regional': 1.1,
      'rural': 1.0
    };
    return locationMap[location.toLowerCase()] || 1.0;
  }
  
  private static getHistoryMultiplier(history: string): number {
    const historyMap: { [key: string]: number } = {
      'clean': 0.85,
      'one_claim': 1.25,
      'multiple_claims': 1.5
    };
    return historyMap[history] || 1.0;
  }
  
  private static calculateSecurityDiscount(features: string[]): number {
    let discount = 1.0;
    if (features.includes('car_alarm')) discount *= 0.95;
    if (features.includes('gps_tracking')) discount *= 0.9;
    if (features.includes('garage_parking')) discount *= 0.95;
    return discount;
  }
  
  private static getHealthAgeMultiplier(age: number): number {
    if (age <= 18) return 0.6;
    if (age <= 30) return 1.0;
    if (age <= 45) return 1.2;
    if (age <= 60) return 1.5;
    return 2.0;
  }
  
  private static getConditionsMultiplier(conditions: string[]): number {
    let multiplier = 1.0;
    conditions.forEach(condition => {
      switch (condition.toLowerCase()) {
        case 'diabetes': multiplier *= 1.3; break;
        case 'hypertension': multiplier *= 1.2; break;
        case 'heart_condition': multiplier *= 1.5; break;
        default: multiplier *= 1.1; break;
      }
    });
    return multiplier;
  }
}

// ===== CONTEXT BUILDER INTERFACE =====

export interface ContextBuilder {
  buildCustomerProfile(data: any): CustomerProfile;
  buildConversationContext(history: ConversationMessage[]): ConversationContext;
  buildMarketContext(): MarketContext;
  buildProductContext(interests: string[], budget?: any): ProductContext;
  buildMetadata(request: any): EnhancedQueryContext['metadata'];
}

// ===== CONFIGURATION TYPES =====

export interface RAGIntegrationConfig {
  enableContextBuilding: boolean;
  enableEnhancedRetrieval: boolean;
  fallbackToSimpleRAG: boolean;
  cacheContexts: boolean;
  trackPerformance: boolean;
  maxRetries: number;
  timeoutMs: number;
}

// ===== TYPE GUARDS AND UTILITIES =====

export function isEnhancedRAGDocument(doc: any): doc is EnhancedRAGDocument {
  return doc && typeof doc.id === 'string' && typeof doc.content === 'string' && doc.metadata;
}

export function isLegacyDocument(doc: any): doc is Document {
  return doc && typeof doc.id === 'string' && typeof doc.content === 'string' && doc.metadata;
}

export function convertLegacyToEnhanced(legacyDoc: Document): EnhancedRAGDocument {
  return {
    id: legacyDoc.id,
    content: legacyDoc.content,
    metadata: {
      type: legacyDoc.metadata.type || 'product',
      category: legacyDoc.metadata.category || 'general',
      priority: legacyDoc.metadata.priority || 'medium',
      companyId: legacyDoc.metadata.companyId || 'default',
      lastUpdated: new Date(),
      version: '2.0',
      ...legacyDoc.metadata
    }
  };
}

export function convertEnhancedToLegacy(enhancedDoc: EnhancedRAGDocument): Document {
  return {
    id: enhancedDoc.id,
    content: enhancedDoc.content,
    metadata: enhancedDoc.metadata
  };
}