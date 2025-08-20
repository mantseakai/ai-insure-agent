// backend/src/types/rag.ts
export interface Document {
  id: string;
  content: string;
  metadata: Record<string, any>;
}

export interface QueryContext {
  productType?: string;
  leadSource?: string;
  stage?: string;
  budget?: string;
  personalityType?: string;
  age?: number;
}

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
  entityType: string;
}