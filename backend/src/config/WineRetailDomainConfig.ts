// Step 1: Create Wine Retail Domain Configuration
// File: backend/src/config/WineRetailDomainConfig.ts

import { DomainConfig } from './InsuranceDomainConfig'; // Assuming DomainConfig interface is in a shared file or can be copied.

export const WineRetailDomainConfig: DomainConfig = {
  domain: 'wine_retail',
  defaultStage: 'initial_contact',
  systemPrompt: `You are a knowledgeable, friendly, and refreshingly down-to-earth wine and spirits expert named Say Cheers, based in Ghana. Your mission is to elevate life’s special shared moments by providing outstanding service and expert advice. You have been established since 2001 and are led by a female founder.

  Your goal is to assist customers with their inquiries, guide them to the perfect selection, and facilitate a delightful shopping experience. Always maintain a warm, conversational, and professional tone.
  
  Provide accurate information based on the following company details:
  - **About Us**: Say Cheers is committed to quality and exceptional service. We are passionate and knowledgeable.
  - **Delivery**: We use in-house and other reputable couriers. Delivery is on the day whenever possible. The fee depends on the location. Customers are notified with an ETA and a tracking number. We deliver in Ghana and have special arrangements for Ghanaian-made drinks to the U.K. and parts of the USA. We also deliver to friends and family in Ghana.
  - **Returns**: Due to safety and tampering laws, we do not accept returns once goods have been delivered or left our premises.
  - **Payment**: We accept all major credit/debit cards (Visa, Mastercard, PayPal) and International Remit and MoMo. We only accept payment in Ghana Cedis.
  - **Corporate Social Responsibility**: We have annual programs to help the less fortunate and constantly look for ways to give back.
  - **Store Locations**:
    - Accra Mall: +233263019230
    - East Legon: +233 506840579
    - Labone: +233263019234
    - Airport: +233263019234
    - Spintex: +233263019210
    - Dzorwulu: +233263019234
    - Kumasi: +233263019212`,

  fallbackMessage: `I apologize, but I need a moment to process that. Could you please rephrase? I'm here to help you with all your wine and spirits questions!`,
  
  entityTypes: ['wine', 'spirits', 'delivery', 'payment', 'returns', 'store_locator'],
  
  stageFlow: {
    'initial_contact': {
      'PRODUCT_INQUIRY': 'product_selection',
      'DELIVERY_INQUIRY': 'delivery_info',
      'PAYMENT_INQUIRY': 'payment_info',
      'STORE_INQUIRY': 'store_locator',
      'RETURNS_INQUIRY': 'returns_info',
      'CSR_INQUIRY': 'csr_info'
    },
    'product_selection': {
      'PRICE_INQUIRY': 'price_inquiry',
      'RECOMMENDATION': 'product_recommendation',
      'READY_TO_BUY': 'closing'
    },
    'delivery_info': {
      'DELIVERY_COST': 'delivery_cost_info',
      'DELIVERY_TIME': 'delivery_timing_info',
      'TRACKING_INQUIRY': 'delivery_tracking'
    },
    // Add other stages as needed
  },

  analysisInstructions: `Analyze the user query to identify their core intent (e.g., product selection, delivery information, payment methods) and extract any relevant entities such as a specific wine type or a location. Determine the most appropriate conversation stage from the stageFlow to progress the chat.`,
  
  responseInstructions: `Craft a response that is friendly, professional, and directly addresses the user's query using the provided company details. If a specific business logic handler is triggered, use the information it provides to form the response. Conclude your message by gently guiding the user toward the next step, such as asking if they need help with a wine recommendation or want to place an order.`,

  businessLogicTriggers: [
    'delivery', 'deliver', 'courier', 'shipping', 'track',
    'payment', 'pay', 'card', 'momo', 'currency', 'price', 'cost',
    'return', 'returns', 'policy',
    'location', 'branch', 'store', 'address', 'phone', 'find'
  ],
  
  businessLogicHandlers: {
    'delivery_details': async (customerInfo: any, queryParams: any, dbAdapter?: any) => {
      return {
        message: `We use our in-house delivery service and other reputable couriers to ensure your order arrives safely. Delivery is typically on the same day if possible, unless you've requested otherwise. The fee for delivery depends on your location. You will receive a tracking number and ETA once your courier is on the way.`,
        canHandle: true
      };
    },
    'payment_details': async (customerInfo: any, queryParams: any, dbAdapter?: any) => {
      return {
        message: `We currently accept all major credit and debit cards, including Visa, Mastercard, PayPal, and International Remit and MoMo. Please note that we only accept payments in Ghana Cedis.`,
        canHandle: true
      };
    },
    'returns_policy': async (customerInfo: any, queryParams: any, dbAdapter?: any) => {
      return {
        message: `Due to safety and tampering laws, we have a strict policy that we do not accept returns once your goods have been delivered or have left our premises.`,
        canHandle: true
      };
    },
    'store_locations': async (customerInfo: any, queryParams: any, dbAdapter?: any) => {
      const locations = [
        `Accra Mall: +233263019230`,
        `East Legon: +233 506840579`,
        `Labone: +233263019234`,
        `Airport: +233263019234`,
        `Spintex: +233263019210`,
        `Dzorwulu: +233263019234`,
        `Kumasi: +233263019212`
      ];
      return {
        message: `We have several convenient branches in Ghana. Here are their phone numbers and locations: ${locations.join(', ')}. We look forward to welcoming you!`,
        canHandle: true
      };
    },
    'csr_info': async (customerInfo: any, queryParams: any, dbAdapter?: any) => {
      return {
        message: `At Say Cheers, we are committed to giving back to the community. Each year, we participate in programs and activities to help those who are less fortunate, and we are always looking for new ways to contribute financially and socially.`,
        canHandle: true
      };
    },
  },
  
  leadScoringWeights: {
    'PRODUCT_INQUIRY': 20,
    'DELIVERY_INQUIRY': 10,
    'PRICE_INQUIRY': 30,
    'READY_TO_BUY': 50,
    'RETURNS_INQUIRY': -10
  },
  
  leadCaptureThreshold: 40,
};