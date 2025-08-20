// File: backend/src/config/PensionDomainConfig.ts

export interface DomainConfig {
  domain: string;
  defaultStage: string;
  systemPrompt: string;
  fallbackMessage: string;
  entityTypes: string[];
  stageFlow: Record<string, Record<string, string>>;
  analysisInstructions: string;
  responseInstructions: string;
  businessLogicTriggers: string[];
  businessLogicHandlers: Record<string, (params: any, queryParams: any, dbAdapter?: any) => Promise<any>>;
  leadScoringWeights: Record<string, number>;
  leadCaptureThreshold: number;
}

// SSNIT Pension logic and knowledge wrapped in a domain configuration
export const PensionDomainConfig: DomainConfig = {
  domain: 'pension',
  defaultStage: 'initial_inquiry',

  // System prompt to guide the AI's persona and knowledge base
  systemPrompt: `You are a helpful, professional, and knowledgeable pension agent for SSNIT (Social Security and National Insurance Trust) in Ghana. 
  Your primary goal is to assist users with their pension inquiries, provide accurate information about SSNIT schemes, and guide them on processes like
  contributions, benefits, and claims. Always be respectful, use clear language, and build a sense of trust with the user.
  
  You must only provide information related to SSNIT pension schemes and services in Ghana. Do not discuss private financial advice or schemes outside of SSNIT.`,

  fallbackMessage: 'I apologize, but I need more details to understand your request. How can I help you with your SSNIT pension today?',
  
  // Key entities or topics for the AI to identify in conversations
  entityTypes: ['SSNIT_scheme', 'pension_contributions', 'retirement_benefit', 'survivor_benefit', 'invalidity_benefit', 'tier_2', 'statement_of_account'],
  
  // Defines the state machine for the conversation flow
  stageFlow: {
    'initial_inquiry': {
      'BENEFIT_CALCULATION': 'benefit_calculation_flow',
      'CONTRIBUTION_HISTORY': 'contributions_flow',
      'GENERAL_INFORMATION': 'info_flow',
      'CLAIM_PROCESS': 'claims_flow'
    },
    'benefit_calculation_flow': {
      'REQUIREMENTS_MET': 'closing_calculation',
      'MISSING_INFO': 'data_collection'
    },
    'contributions_flow': {
      'ACCOUNT_NUMBER_PROVIDED': 'info_retrieval'
    },
    'info_flow': {
      'FURTHER_QUESTIONS': 'initial_inquiry'
    },
    'claims_flow': {
      'PROCESS_GUIDANCE': 'documentation_assistance'
    }
  },
  
  // Instructions for how the AI should analyze user queries
  analysisInstructions: `Analyze the user's message to determine their intent and the relevant SSNIT topic. 
  Identify if they are asking about benefits, contributions, account status, or general information. 
  Extract key parameters like age, years of contribution, or SSNIT number if provided, to trigger business logic.
  Classify the user's intent into one of the stage flow keys: BENEFIT_CALCULATION, CONTRIBUTION_HISTORY, etc.`,

  // Instructions for how the AI should format and structure its responses
  responseInstructions: `Provide concise and accurate information based on the SSNIT rules and your knowledge base. 
  If triggering a business logic handler, format the result clearly and explain what the numbers mean. 
  When asking for more information, be specific (e.g., "Please provide your age and number of years of contribution"). 
  Maintain a calm, professional, and helpful tone at all times.`,
  
  // Keywords that will trigger specific business logic handlers
  businessLogicTriggers: ['calculate', 'benefit', 'check balance', 'statement', 'how much', 'contribution record'],
  
  // Handlers for specific business logic. This is where the core functionality resides.
  businessLogicHandlers: {
    // A simplified handler for a mock pension benefit calculation
    'calculate_benefit': async (customerInfo: any, queryParams: any) => {
      // Parameters for the calculation
      const yearsOfContribution = parseInt(customerInfo.yearsOfContribution || queryParams.yearsOfContribution);
      const averageSalary = parseFloat(customerInfo.averageSalary || queryParams.averageSalary);
      const age = parseInt(customerInfo.age || queryParams.age);

      // Simple validation for necessary parameters
      if (isNaN(yearsOfContribution) || isNaN(averageSalary) || isNaN(age)) {
        return {
          error: 'missing_parameters',
          message: 'I need your years of contribution, age, and average monthly salary to provide a pension estimate.',
        };
      }

      // SSNIT-like simplified calculation logic
      // This is a simplified example for demonstration purposes and does not reflect actual SSNIT formulas.
      const multiplier = yearsOfContribution >= 20 ? 0.6 : (0.5 * yearsOfContribution / 15);
      const basePension = averageSalary * multiplier;
      
      const ageAdjustment = age >= 60 ? 1 : 0.9; // Simple mock for early vs. regular retirement
      const estimatedBenefit = basePension * ageAdjustment;

      return {
        estimatedMonthlyBenefit: estimatedBenefit.toFixed(2),
        calculationBreakdown: {
          yearsOfContribution,
          averageSalary: averageSalary.toFixed(2),
          age,
          multiplier: multiplier.toFixed(2),
          ageAdjustment: ageAdjustment.toFixed(2)
        },
        currency: 'GH₵',
        validity: 'This is an estimate. The final amount is subject to official SSNIT calculations and records.'
      };
    },
  },
  
  // Weights for different lead-scoring criteria. Higher values mean more important.
  leadScoringWeights: {
    'benefit_calculation': 10,
    'claim_process': 8,
    'account_info_request': 7,
    'general_question': 2,
    'document_inquiry': 5
  },
  
  // The threshold at which a user is considered a qualified lead
  leadCaptureThreshold: 15,
};
