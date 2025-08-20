// Domain Configuration Types and Examples
// File: backend/src/types/domain.ts

export interface DomainConfig {
  domain: string;
  defaultStage: string;
  systemPrompt: string;
  fallbackMessage: string;
  
  // Entity types available in this domain
  entityTypes: string[];
  
  // Conversation flow configuration
  stageFlow: Record<string, Record<string, string>>;
  
  // Analysis instructions for domain-specific message interpretation
  analysisInstructions: string;
  
  // Response generation instructions
  responseInstructions: string;
  
  // Business logic configuration
  businessLogicTriggers: string[];
  businessLogicHandlers: Record<string, (params: any, queryParams: any, dbAdapter: any) => Promise<any>>;
  
  // Lead scoring configuration
  leadScoringWeights: Record<string, number>;
  leadCaptureThreshold: number;
  
  // Database configuration
  databaseConfig: {
    tables: Record<string, DatabaseTableConfig>;
    relationships: Record<string, string[]>;
  };
  
  // RAG configuration
  ragConfig: {
    knowledgeCategories: string[];
    embeddingStrategy: string;
    contextBuilding: string;
  };
}

export interface DatabaseTableConfig {
  primaryKey: string;
  fields: Record<string, string>;
  searchableFields: string[];
  filterableFields: string[];
}

// Example configurations for different domains

export const InsuranceDomainConfig: DomainConfig = {
  domain: 'insurance',
  defaultStage: 'greeting',
  systemPrompt: 'You are a knowledgeable, friendly insurance agent. Always use accurate company information and provide genuine value.',
  fallbackMessage: 'I apologize, but I need a moment to process that. How can I help you with insurance today?',
  
  entityTypes: ['auto', 'health', 'life', 'business', 'home'],
  
  stageFlow: {
    'greeting': {
      'INFORMATION': 'discovery',
      'QUOTE_REQUEST': 'premium_calculation'
    },
    'discovery': {
      'QUOTE_REQUEST': 'premium_calculation',
      'OBJECTION': 'objection_handling'
    },
    'premium_calculation': {
      'ACCEPT': 'closing',
      'NEGOTIATE': 'objection_handling'
    }
  },
  
  analysisInstructions: `
Focus on:
- Insurance type interest (auto, health, life, business)
- Coverage amount needs
- Budget sensitivity
- Risk factors mentioned
- Quote readiness signals
- Objection types (price, coverage, trust)
`,
  
  responseInstructions: `
- Reference Ghana-specific context (mobile money, local risks)
- Include relevant pricing when appropriate
- Address objections with empathy and evidence
- Use "Akwaaba!" for greetings, "Ayeekoo" for achievements
- Create urgency without being pushy
`,
  
  businessLogicTriggers: ['quote', 'premium', 'price', 'cost', 'calculate'],
  businessLogicHandlers: {
    'premium_calculation': async (customerInfo: any, queryParams: any, dbAdapter: any) => {
      // Implementation for premium calculation
      return {
        premium: 1200,
        breakdown: { base: 1000, fees: 200 },
        validity: '30 days'
      };
    }
  },
  
  leadScoringWeights: {
    'urgent_need': 15,
    'budget_discussed': 10,
    'specific_coverage': 10,
    'contact_info_shared': 20
  },
  leadCaptureThreshold: 70,
  
  databaseConfig: {
    tables: {
      'policies': {
        primaryKey: 'id',
        fields: {
          'id': 'string',
          'type': 'string',
          'premium': 'number',
          'coverage_amount': 'number',
          'risk_factors': 'array'
        },
        searchableFields: ['type', 'risk_factors'],
        filterableFields: ['type', 'premium', 'coverage_amount']
      },
      'claims': {
        primaryKey: 'id',
        fields: {
          'id': 'string',
          'policy_type': 'string',
          'claim_amount': 'number',
          'status': 'string'
        },
        searchableFields: ['policy_type', 'status'],
        filterableFields: ['policy_type', 'claim_amount', 'status']
      }
    },
    relationships: {
      'policies': ['claims']
    }
  },
  
  ragConfig: {
    knowledgeCategories: ['product_info', 'pricing', 'objection_handling', 'risk_factors'],
    embeddingStrategy: 'contextual',
    contextBuilding: 'prioritize_product_info'
  }
};

export const ElectronicsDomainConfig: DomainConfig = {
  domain: 'electronics',
  defaultStage: 'greeting',
  systemPrompt: 'You are a tech-savvy electronics sales assistant. Help customers find the perfect electronic products for their needs.',
  fallbackMessage: 'Let me help you find the perfect electronic device for your needs!',
  
  entityTypes: ['smartphones', 'laptops', 'tablets', 'accessories', 'gaming', 'audio'],
  
  stageFlow: {
    'greeting': {
      'PRODUCT_INQUIRY': 'discovery',
      'TECHNICAL_QUESTION': 'technical_support'
    },
    'discovery': {
      'COMPARISON_REQUEST': 'product_comparison',
      'PRICE_INQUIRY': 'pricing_discussion'
    },
    'product_comparison': {
      'PURCHASE_INTENT': 'closing',
      'MORE_INFO': 'detailed_presentation'
    }
  },
  
  analysisInstructions: `
Focus on:
- Device type interest (phone, laptop, tablet, etc.)
- Use case requirements (gaming, work, casual)
- Budget range indicators
- Technical specifications mentioned
- Brand preferences
- Urgency of purchase
`,
  
  responseInstructions: `
- Provide technical specifications when relevant
- Compare products objectively
- Mention current promotions and deals
- Suggest compatible accessories
- Reference warranty and support options
- Use tech-friendly language but explain complex terms
`,
  
  businessLogicTriggers: ['compare', 'recommend', 'specs', 'compatible', 'price'],
  businessLogicHandlers: {
    'product_recommendation': async (customerInfo: any, queryParams: any, dbAdapter: any) => {
      // Get products based on requirements
      const products = await dbAdapter.query('products', {
        category: queryParams.category,
        price_range: queryParams.budget,
        features: queryParams.required_features
      });
      return {
        recommendations: products.slice(0, 3),
        reasoning: 'Based on your requirements and budget'
      };
    },
    'compatibility_check': async (customerInfo: any, queryParams: any, dbAdapter: any) => {
      // Check product compatibility
      return {
        compatible: true,
        accessories: ['case', 'charger', 'screen_protector']
      };
    }
  },
  
  leadScoringWeights: {
    'specific_model_interest': 20,
    'budget_mentioned': 15,
    'immediate_need': 25,
    'technical_questions': 10
  },
  leadCaptureThreshold: 60,
  
  databaseConfig: {
    tables: {
      'products': {
        primaryKey: 'id',
        fields: {
          'id': 'string',
          'name': 'string',
          'category': 'string',
          'price': 'number',
          'specifications': 'object',
          'stock_level': 'number',
          'rating': 'number'
        },
        searchableFields: ['name', 'category', 'specifications'],
        filterableFields: ['category', 'price', 'rating', 'stock_level']
      },
      'reviews': {
        primaryKey: 'id',
        fields: {
          'id': 'string',
          'product_id': 'string',
          'rating': 'number',
          'comment': 'string',
          'verified_purchase': 'boolean'
        },
        searchableFields: ['comment'],
        filterableFields: ['rating', 'verified_purchase']
      }
    },
    relationships: {
      'products': ['reviews']
    }
  },
  
  ragConfig: {
    knowledgeCategories: ['product_specs', 'comparisons', 'troubleshooting', 'compatibility'],
    embeddingStrategy: 'technical',
    contextBuilding: 'prioritize_specifications'
  }
};

export const ClothingDomainConfig: DomainConfig = {
  domain: 'fashion',
  defaultStage: 'greeting',
  systemPrompt: 'You are a fashion-forward style consultant. Help customers discover clothing that matches their style and needs.',
  fallbackMessage: 'Let me help you find the perfect outfit that matches your style!',
  
  entityTypes: ['dresses', 'tops', 'bottoms', 'shoes', 'accessories', 'outerwear'],
  
  stageFlow: {
    'greeting': {
      'STYLE_QUESTION': 'style_discovery',
      'PRODUCT_INQUIRY': 'product_search'
    },
    'style_discovery': {
      'SIZE_QUESTION': 'sizing_help',
      'OCCASION_SPECIFIC': 'occasion_styling'
    },
    'product_search': {
      'STYLE_ADVICE': 'styling_consultation',
      'SIZE_HELP': 'sizing_help'
    }
  },
  
  analysisInstructions: `
Focus on:
- Clothing category interest
- Style preferences (casual, formal, trendy)
- Size and fit concerns
- Occasion or purpose
- Color and pattern preferences
- Budget sensitivity
- Brand preferences
`,
  
  responseInstructions: `
- Provide styling advice and outfit suggestions
- Address sizing and fit concerns
- Mention current fashion trends
- Suggest complementary items
- Reference care instructions when relevant
- Use fashion-forward but accessible language
`,
  
  businessLogicTriggers: ['style', 'outfit', 'match', 'size', 'fit'],
  businessLogicHandlers: {
    'style_recommendation': async (customerInfo: any, queryParams: any, dbAdapter: any) => {
      // Generate outfit recommendations
      return {
        outfits: [
          { top: 'Blue Blouse', bottom: 'Black Trousers', accessories: ['Silver Watch'] },
          { dress: 'Red Midi Dress', accessories: ['Black Heels', 'Clutch'] }
        ],
        reasoning: 'Perfect for your professional yet stylish look'
      };
    },
    'size_consultation': async (customerInfo: any, queryParams: any, dbAdapter: any) => {
      // Provide sizing guidance
      return {
        recommended_size: 'M',
        fit_notes: 'Runs slightly small, consider sizing up',
        size_chart: { S: '32-34', M: '36-38', L: '40-42' }
      };
    }
  },
  
  leadScoringWeights: {
    'specific_item_interest': 15,
    'size_shared': 20,
    'occasion_mentioned': 10,
    'style_consultation': 15
  },
  leadCaptureThreshold: 50,
  
  databaseConfig: {
    tables: {
      'products': {
        primaryKey: 'id',
        fields: {
          'id': 'string',
          'name': 'string',
          'category': 'string',
          'price': 'number',
          'sizes': 'array',
          'colors': 'array',
          'style_tags': 'array'
        },
        searchableFields: ['name', 'category', 'style_tags'],
        filterableFields: ['category', 'price', 'sizes', 'colors']
      },
      'style_profiles': {
        primaryKey: 'id',
        fields: {
          'id': 'string',
          'style_type': 'string',
          'recommended_categories': 'array',
          'color_palette': 'array'
        },
        searchableFields: ['style_type'],
        filterableFields: ['style_type']
      }
    },
    relationships: {
      'products': ['style_profiles']
    }
  },
  
  ragConfig: {
    knowledgeCategories: ['style_guides', 'sizing_info', 'care_instructions', 'trend_updates'],
    embeddingStrategy: 'style_aware',
    contextBuilding: 'prioritize_style_context'
  }
};

// Factory function to get domain configuration
export function getDomainConfig(domain: string): DomainConfig {
  const configs: Record<string, DomainConfig> = {
    'insurance': InsuranceDomainConfig,
    'electronics': ElectronicsDomainConfig,
    'fashion': ClothingDomainConfig
  };
  
  const config = configs[domain];
  if (!config) {
    throw new Error(`Domain configuration not found for: ${domain}`);
  }
  
  return config;
}