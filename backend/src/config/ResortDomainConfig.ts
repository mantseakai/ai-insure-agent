// File: backend/src/config/ResortDomainConfig.ts

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

// BigBlue Resort logic and knowledge wrapped in a domain configuration
export const ResortDomainConfig: DomainConfig = {
  domain: 'resort',
  defaultStage: 'initial_contact',

  // System prompt to guide the AI's persona and knowledge base
  systemPrompt: `You are a friendly, welcoming, and knowledgeable guest relations agent for The BigBlue Resort & Spa in Ghana. 
  Your primary goal is to assist users with inquiries about our accommodation, activities, and packages. 
  Provide accurate information and help guests with booking and inquiries. Always be polite, enthusiastic, and conversational.
  You must only provide information related to The BigBlue Resort & Spa and its services.`,

  fallbackMessage: 'I apologize, but I need more details to understand your request. How can I help you enjoy your stay at The BigBlue Resort & Spa?',
  
  // Key entities or topics for the AI to identify in conversations
  entityTypes: ['accommodation', 'activities', 'packages', 'booking', 'contact'],
  
  // Defines the state machine for the conversation flow
  stageFlow: {
    'initial_contact': {
      'ACCOMMODATION_INQUIRY': 'accommodation_flow',
      'ACTIVITIES_INQUIRY': 'activities_flow',
      'PACKAGE_INQUIRY': 'packages_flow',
      'BOOKING_REQUEST': 'booking_flow',
    },
    'accommodation_flow': {
      'ROOM_DETAILS': 'booking_flow',
    },
    'activities_flow': {
      'ACTIVITY_BOOKING': 'booking_flow',
    },
    'packages_flow': {
      'PACKAGE_DETAILS': 'booking_flow',
    },
    'booking_flow': {
      'CONFIRMATION': 'closing',
      'MISSING_INFO': 'data_collection'
    },
  },
  
  // Instructions for how the AI should analyze user queries
  analysisInstructions: `Analyze the user's message to determine their intent. 
  Identify if they are asking about accommodation types, activities, specific packages, or trying to make a booking. 
  Extract key parameters like room type, number of guests, dates, or activity names.
  Classify the user's intent into one of the stage flow keys: ACCOMMODATION_INQUIRY, ACTIVITIES_INQUIRY, etc.`,

  // Instructions for how the AI should format and structure its responses
  responseInstructions: `Provide clear and engaging information. When discussing rooms or activities, use descriptive language to entice the user. 
  When asking for more information, be specific (e.g., "What dates are you interested in?"). 
  If a business logic handler is triggered, present the information (e.g., price, availability) clearly and professionally.`,
  
  // Keywords that will trigger specific business logic handlers
  businessLogicTriggers: ['price', 'cost', 'availability', 'book', 'reserve', 'rate', 'check-in', 'check-out'],
  
  // Handlers for specific business logic. This is where the core functionality resides.
  businessLogicHandlers: {
    // A mock handler for checking room availability and price
    'check_availability_and_price': async (customerInfo: any, queryParams: any) => {
      // Mock data for demonstration
      const roomRates: Record<string, number> = {
        'presidential villa': 4500,
        'garden suite': 2800,
        'sea view villa': 3500,
        'african village': 2500,
      };

      const roomType = (customerInfo.roomType || queryParams.roomType || '').toLowerCase();
      const nights = parseInt(customerInfo.nights || queryParams.nights) || 1;
      
      const baseRate = roomRates[roomType] || 0;

      if (!baseRate) {
        return {
          error: 'invalid_room_type',
          message: 'I am sorry, I do not recognize that room type. The available options are Presidential Villa, Garden Suite, Sea View Villa, and African Village.'
        };
      }

      const totalCost = baseRate * nights;
      
      return {
        roomType: roomType.charAt(0).toUpperCase() + roomType.slice(1),
        nights: nights,
        baseRate: baseRate,
        totalCost: totalCost,
        availability: 'Available', // Mock availability
        currency: 'GH₵',
      };
    },
  },
  
  // Weights for different lead-scoring criteria. Higher values mean more important.
  leadScoringWeights: {
    'booking_request': 10,
    'package_inquiry': 8,
    'accommodation_inquiry': 7,
    'activities_inquiry': 5,
    'general_question': 2,
  },
  
  // The threshold at which a user is considered a qualified lead
  leadCaptureThreshold: 15,
};