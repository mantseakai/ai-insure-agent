// Updated LeadService with Enhanced RAG Integration
// File: backend/src/services/LeadService.ts

import fs from 'fs/promises';
import path from 'path';
import { 
  CustomerProfile,
  ConversationContext,
  AIAnalysis,
  LeadAnalysisResult,
  ConversationMessage
} from '../types/unified-rag';

interface Lead {
  id: string;
  userId: string;
  contactInfo: {
    name?: string;
    phone?: string;
    email?: string;
    whatsappNumber?: string;
    preferredContact?: 'phone' | 'email' | 'whatsapp';
  };
  source: 'chat' | 'whatsapp' | 'web_form' | 'phone' | 'referral' | 'social_media';
  productInterest: string;
  score: number;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost' | 'nurturing';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  
  // Enhanced fields from new system
  customerProfile?: Partial<CustomerProfile>;
  conversationContext?: Partial<ConversationContext>;
  aiAnalysis?: Partial<AIAnalysis>;
  leadAnalysis?: LeadAnalysisResult;
  
  // Premium calculation context
  premiumCalculationRequest?: {
    insuranceType: string;
    parameters: any;
    quote?: {
      amount: number;
      breakdown: any;
      validity: string;
    };
  };
  
  // Enhanced context from RAG
  enhancedContext?: {
    customerSegment: string;
    urgencyLevel: string;
    seasonalFactors: string[];
    locationFactors: string[];
    conversationQuality: number;
    buyingSignals: string[];
    riskFactors: string[];
  };
  
  // Tracking fields
  createdAt: Date;
  updatedAt: Date;
  lastContactedAt?: Date;
  assignedTo?: string;
  notes: Array<{
    id: string;
    content: string;
    createdAt: Date;
    createdBy: string;
    type: 'system' | 'manual' | 'ai_insight';
  }>;
  
  // Performance tracking
  conversionProbability?: number;
  estimatedValue?: number;
  followUpScheduled?: Date;
  
  // Analytics
  touchpoints: Array<{
    channel: string;
    timestamp: Date;
    interaction: string;
    outcome?: string;
  }>;
}

interface LeadCaptureRequest {
  userId: string;
  contactInfo: Lead['contactInfo'];
  source: Lead['source'];
  productInterest: string;
  score: number;
  
  // Enhanced context
  conversationContext?: Partial<ConversationContext>;
  customerProfile?: Partial<CustomerProfile>;
  aiAnalysis?: Partial<AIAnalysis>;
  leadAnalysis?: LeadAnalysisResult;
  premiumCalculationRequest?: Lead['premiumCalculationRequest'];
  
  // Additional metadata
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    deviceType?: string;
    sessionId?: string;
    conversationLength?: number;
    averageResponseTime?: number;
  };
}

interface LeadAnalytics {
  totalLeads: number;
  leadsBySource: { [key: string]: number };
  leadsByStatus: { [key: string]: number };
  leadsByPriority: { [key: string]: number };
  leadsByProduct: { [key: string]: number };
  conversionRate: number;
  averageLeadScore: number;
  averageTimeToContact: number;
  topPerformingSources: Array<{ source: string; conversionRate: number; count: number }>;
  premiumCalculationLeads: number;
  enhancedRAGLeads: number;
  qualityDistribution: { [key: string]: number };
  
  // Time-based analytics
  leadsThisWeek: number;
  leadsThisMonth: number;
  conversionTrend: Array<{ date: string; leads: number; conversions: number }>;
  
  // Enhanced analytics
  customerSegmentDistribution: { [key: string]: number };
  seasonalTrends: { [key: string]: number };
  urgencyDistribution: { [key: string]: number };
  averageConversationQuality: number;
}

export class LeadService {
  private leads: Map<string, Lead> = new Map();
  private initialized = false;
  private companyId: string;
  private dataPath: string;
  private analyticsPath: string;
  
  constructor(companyId: string = 'default') {
    this.companyId = companyId;
    this.dataPath = path.join(process.cwd(), 'data', `leads_${companyId}.json`);
    this.analyticsPath = path.join(process.cwd(), 'data', `lead_analytics_${companyId}.json`);
  }

  /**
   * Initialize the lead service
   */
  async initialize(): Promise<void> {
    console.log(`🎯 Initializing Lead Service for company ${this.companyId}`);
    
    try {
      await fs.mkdir(path.dirname(this.dataPath), { recursive: true });
      
      // Load existing leads
      try {
        const data = await fs.readFile(this.dataPath, 'utf-8');
        const parsed = JSON.parse(data);
        
        if (parsed.leads && Array.isArray(parsed.leads)) {
          parsed.leads.forEach((lead: Lead) => {
            // Convert date strings back to Date objects
            lead.createdAt = new Date(lead.createdAt);
            lead.updatedAt = new Date(lead.updatedAt);
            if (lead.lastContactedAt) lead.lastContactedAt = new Date(lead.lastContactedAt);
            if (lead.followUpScheduled) lead.followUpScheduled = new Date(lead.followUpScheduled);
            
            this.leads.set(lead.id, lead);
          });
          
          console.log(`📊 Loaded ${this.leads.size} existing leads`);
        }
      } catch (error) {
        console.log('📝 No existing leads found, starting fresh');
      }
      
      this.initialized = true;
      console.log('✅ Lead Service initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize Lead Service:', error);
      throw error;
    }
  }

  /**
   * Capture a new lead with enhanced context
   */
  async captureLead(request: LeadCaptureRequest): Promise<{ leadId: string; lead: Lead }> {
    if (!this.initialized) await this.initialize();
    
    try {
      console.log(`🎯 Capturing lead for user ${request.userId} from ${request.source}`);
      
      // Check if lead already exists for this user
      const existingLead = this.findLeadByUserId(request.userId);
      
      if (existingLead) {
        console.log(`📝 Updating existing lead ${existingLead.id} for user ${request.userId}`);
        return await this.updateExistingLead(existingLead, request);
      }
      
      // Create new lead
      const leadId = this.generateLeadId();
      const now = new Date();
      
      // Build enhanced context
      const enhancedContext = this.buildEnhancedContext(request);
      
      // Calculate conversion probability
      const conversionProbability = this.calculateConversionProbability(request);
      
      // Estimate lead value
      const estimatedValue = this.estimateLeadValue(request);
      
      // Determine priority
      const priority = this.determinePriority(request.score, enhancedContext);
      
      const lead: Lead = {
        id: leadId,
        userId: request.userId,
        contactInfo: request.contactInfo,
        source: request.source,
        productInterest: request.productInterest,
        score: request.score,
        status: 'new',
        priority,
        
        // Enhanced fields
        customerProfile: request.customerProfile,
        conversationContext: request.conversationContext,
        aiAnalysis: request.aiAnalysis,
        leadAnalysis: request.leadAnalysis,
        premiumCalculationRequest: request.premiumCalculationRequest,
        enhancedContext,
        
        // Tracking
        createdAt: now,
        updatedAt: now,
        notes: [
          {
            id: this.generateNoteId(),
            content: `Lead captured from ${request.source} with score ${request.score}`,
            createdAt: now,
            createdBy: 'system',
            type: 'system'
          }
        ],
        
        // Performance tracking
        conversionProbability,
        estimatedValue,
        
        // Analytics
        touchpoints: [
          {
            channel: request.source,
            timestamp: now,
            interaction: 'lead_captured',
            outcome: 'new_lead'
          }
        ]
      };
      
      // Add AI insights as notes
      if (request.aiAnalysis) {
        lead.notes.push({
          id: this.generateNoteId(),
          content: `AI Analysis: ${request.aiAnalysis.primaryIntent} intent, ${request.aiAnalysis.leadReadiness} readiness, ${request.aiAnalysis.urgencyLevel} urgency`,
          createdAt: now,
          createdBy: 'ai_system',
          type: 'ai_insight'
        });
      }
      
      // Add premium calculation context
      if (request.premiumCalculationRequest) {
        lead.notes.push({
          id: this.generateNoteId(),
          content: `Premium calculation requested: ${request.premiumCalculationRequest.insuranceType} insurance${request.premiumCalculationRequest.quote ? ` - Quote: GH₵ ${request.premiumCalculationRequest.quote.amount}` : ''}`,
          createdAt: now,
          createdBy: 'system',
          type: 'system'
        });
      }
      
      // Store lead
      this.leads.set(leadId, lead);
      
      // Save to file
      await this.saveToFile();
      
      // Schedule follow-up based on priority
      await this.scheduleFollowUp(lead);
      
      console.log(`✅ Lead captured successfully: ${leadId} (Priority: ${priority}, Score: ${request.score})`);
      
      return { leadId, lead };
      
    } catch (error) {
      console.error('❌ Error capturing lead:', error);
      throw error;
    }
  }

  /**
   * Update existing lead with new information
   */
  private async updateExistingLead(
    existingLead: Lead, 
    request: LeadCaptureRequest
  ): Promise<{ leadId: string; lead: Lead }> {
    
    const now = new Date();
    
    // Update lead with new information
    existingLead.score = Math.max(existingLead.score, request.score); // Keep highest score
    existingLead.updatedAt = now;
    
    // Merge contact info
    existingLead.contactInfo = { ...existingLead.contactInfo, ...request.contactInfo };
    
    // Update enhanced context
    if (request.customerProfile) {
      existingLead.customerProfile = { ...existingLead.customerProfile, ...request.customerProfile };
    }
    
    if (request.conversationContext) {
      existingLead.conversationContext = { ...existingLead.conversationContext, ...request.conversationContext };
    }
    
    // Update AI analysis
    if (request.aiAnalysis) {
      existingLead.aiAnalysis = { ...existingLead.aiAnalysis, ...request.aiAnalysis };
    }
    
    // Update premium calculation
    if (request.premiumCalculationRequest) {
      existingLead.premiumCalculationRequest = request.premiumCalculationRequest;
    }
    
    // Recalculate enhanced context
    existingLead.enhancedContext = this.buildEnhancedContext(request);
    
    // Recalculate conversion probability
    existingLead.conversionProbability = this.calculateConversionProbability(request);
    
    // Update priority if needed
    const newPriority = this.determinePriority(existingLead.score, existingLead.enhancedContext);
    if (newPriority !== existingLead.priority) {
      existingLead.priority = newPriority;
      existingLead.notes.push({
        id: this.generateNoteId(),
        content: `Priority updated from ${existingLead.priority} to ${newPriority} due to increased engagement`,
        createdAt: now,
        createdBy: 'system',
        type: 'system'
      });
    }
    
    // Add touchpoint
    existingLead.touchpoints.push({
      channel: request.source,
      timestamp: now,
      interaction: 'lead_updated',
      outcome: 'engagement_increased'
    });
    
    // Add update note
    existingLead.notes.push({
      id: this.generateNoteId(),
      content: `Lead updated with new interaction from ${request.source}. Score: ${existingLead.score}`,
      createdAt: now,
      createdBy: 'system',
      type: 'system'
    });
    
    await this.saveToFile();
    
    return { leadId: existingLead.id, lead: existingLead };
  }

  /**
   * Get lead by ID
   */
  getLead(leadId: string): Lead | null {
    return this.leads.get(leadId) || null;
  }

  /**
   * Get lead by user ID
   */
  getLeadByUserId(userId: string): Lead | null {
    return this.findLeadByUserId(userId);
  }

  /**
   * Get all leads with filtering and pagination
   */
  getLeads(filters?: {
    source?: string;
    status?: string;
    priority?: string;
    productInterest?: string;
    minScore?: number;
    maxScore?: number;
    dateFrom?: Date;
    dateTo?: Date;
    assignedTo?: string;
  }, pagination?: {
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): { leads: Lead[]; total: number; page: number; totalPages: number } {
    
    let filteredLeads = Array.from(this.leads.values());
    
    // Apply filters
    if (filters) {
      if (filters.source) {
        filteredLeads = filteredLeads.filter(lead => lead.source === filters.source);
      }
      if (filters.status) {
        filteredLeads = filteredLeads.filter(lead => lead.status === filters.status);
      }
      if (filters.priority) {
        filteredLeads = filteredLeads.filter(lead => lead.priority === filters.priority);
      }
      if (filters.productInterest) {
        filteredLeads = filteredLeads.filter(lead => lead.productInterest === filters.productInterest);
      }
      if (filters.minScore !== undefined) {
        filteredLeads = filteredLeads.filter(lead => lead.score >= filters.minScore!);
      }
      if (filters.maxScore !== undefined) {
        filteredLeads = filteredLeads.filter(lead => lead.score <= filters.maxScore!);
      }
      if (filters.dateFrom) {
        filteredLeads = filteredLeads.filter(lead => lead.createdAt >= filters.dateFrom!);
      }
      if (filters.dateTo) {
        filteredLeads = filteredLeads.filter(lead => lead.createdAt <= filters.dateTo!);
      }
      if (filters.assignedTo) {
        filteredLeads = filteredLeads.filter(lead => lead.assignedTo === filters.assignedTo);
      }
    }
    
    // Apply sorting
    if (pagination?.sortBy) {
      const sortBy = pagination.sortBy;
      const sortOrder = pagination.sortOrder || 'desc';
      
      filteredLeads.sort((a, b) => {
        let aValue = (a as any)[sortBy];
        let bValue = (b as any)[sortBy];
        
        if (aValue instanceof Date) aValue = aValue.getTime();
        if (bValue instanceof Date) bValue = bValue.getTime();
        
        if (sortOrder === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });
    } else {
      // Default sort by score descending, then by created date descending
      filteredLeads.sort((a, b) => {
        if (a.score !== b.score) {
          return b.score - a.score;
        }
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
    }
    
    // Apply pagination
    const total = filteredLeads.length;
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 50;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const end = start + limit;
    
    const paginatedLeads = filteredLeads.slice(start, end);
    
    return {
      leads: paginatedLeads,
      total,
      page,
      totalPages
    };
  }

  /**
   * Update lead status
   */
  async updateLeadStatus(
    leadId: string, 
    status: Lead['status'],
    note?: string,
    updatedBy?: string
  ): Promise<Lead | null> {
    const lead = this.leads.get(leadId);
    if (!lead) return null;
    
    const oldStatus = lead.status;
    lead.status = status;
    lead.updatedAt = new Date();
    
    if (status === 'contacted') {
      lead.lastContactedAt = new Date();
    }
    
    // Add status update note
    lead.notes.push({
      id: this.generateNoteId(),
      content: note || `Status updated from ${oldStatus} to ${status}`,
      createdAt: new Date(),
      createdBy: updatedBy || 'system',
      type: updatedBy ? 'manual' : 'system'
    });
    
    // Add touchpoint
    lead.touchpoints.push({
      channel: 'system',
      timestamp: new Date(),
      interaction: 'status_update',
      outcome: status
    });
    
    await this.saveToFile();
    
    console.log(`📊 Lead ${leadId} status updated: ${oldStatus} → ${status}`);
    
    return lead;
  }

  /**
   * Add note to lead
   */
  async addLeadNote(
    leadId: string,
    content: string,
    createdBy: string,
    type: 'system' | 'manual' | 'ai_insight' = 'manual'
  ): Promise<Lead | null> {
    const lead = this.leads.get(leadId);
    if (!lead) return null;
    
    lead.notes.push({
      id: this.generateNoteId(),
      content,
      createdAt: new Date(),
      createdBy,
      type
    });
    
    lead.updatedAt = new Date();
    await this.saveToFile();
    
    return lead;
  }

  /**
   * Get lead analytics
   */
  async getAnalytics(dateRange?: { from: Date; to: Date }): Promise<LeadAnalytics> {
    let leads = Array.from(this.leads.values());
    
    // Filter by date range if provided
    if (dateRange) {
      leads = leads.filter(lead => 
        lead.createdAt >= dateRange.from && lead.createdAt <= dateRange.to
      );
    }
    
    const totalLeads = leads.length;
    const convertedLeads = leads.filter(lead => lead.status === 'converted').length;
    const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;
    
    // Calculate distributions
    const leadsBySource = this.calculateDistribution(leads, 'source');
    const leadsByStatus = this.calculateDistribution(leads, 'status');
    const leadsByPriority = this.calculateDistribution(leads, 'priority');
    const leadsByProduct = this.calculateDistribution(leads, 'productInterest');
    
    // Enhanced analytics
    const customerSegmentDistribution = this.calculateEnhancedDistribution(
      leads, 
      lead => lead.enhancedContext?.customerSegment || 'unknown'
    );
    
    const urgencyDistribution = this.calculateEnhancedDistribution(
      leads,
      lead => lead.enhancedContext?.urgencyLevel || 'unknown'
    );
    
    const seasonalTrends = this.calculateSeasonalTrends(leads);
    
    // Calculate averages
    const averageLeadScore = totalLeads > 0 
      ? leads.reduce((sum, lead) => sum + lead.score, 0) / totalLeads 
      : 0;
    
    const averageConversationQuality = this.calculateAverageConversationQuality(leads);
    
    // Time-based metrics
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const leadsThisWeek = leads.filter(lead => lead.createdAt >= oneWeekAgo).length;
    const leadsThisMonth = leads.filter(lead => lead.createdAt >= oneMonthAgo).length;
    
    // Top performing sources
    const topPerformingSources = this.calculateTopPerformingSources(leads);
    
    // Premium calculation leads
    const premiumCalculationLeads = leads.filter(lead => 
      lead.premiumCalculationRequest !== undefined
    ).length;
    
    // Enhanced RAG leads
    const enhancedRAGLeads = leads.filter(lead => 
      lead.enhancedContext !== undefined
    ).length;
    
    // Quality distribution
    const qualityDistribution = {
      'high (8-10)': leads.filter(lead => lead.score >= 8).length,
      'medium (5-7)': leads.filter(lead => lead.score >= 5 && lead.score < 8).length,
      'low (0-4)': leads.filter(lead => lead.score < 5).length
    };
    
    return {
      totalLeads,
      leadsBySource,
      leadsByStatus,
      leadsByPriority,
      leadsByProduct,
      conversionRate,
      averageLeadScore,
      averageTimeToContact: 0, // Would calculate from actual contact data
      topPerformingSources,
      premiumCalculationLeads,
      enhancedRAGLeads,
      qualityDistribution,
      leadsThisWeek,
      leadsThisMonth,
      conversionTrend: [], // Would calculate trend data
      customerSegmentDistribution,
      seasonalTrends,
      urgencyDistribution,
      averageConversationQuality
    };
  }

  // ===== PRIVATE HELPER METHODS =====

  private findLeadByUserId(userId: string): Lead | null {
    return Array.from(this.leads.values()).find(lead => lead.userId === userId) || null;
  }

  private buildEnhancedContext(request: LeadCaptureRequest): Lead['enhancedContext'] {
    const customerSegment = this.determineCustomerSegment(request.customerProfile);
    const urgencyLevel = request.aiAnalysis?.urgencyLevel || 'medium';
    const seasonalFactors = this.getSeasonalFactors();
    const locationFactors = this.getLocationFactors(request.customerProfile?.location);
    const conversationQuality = this.calculateConversationQuality(request);
    const buyingSignals = request.aiAnalysis?.buyingSignals || [];
    const riskFactors = this.extractRiskFactors(request);
    
    return {
      customerSegment,
      urgencyLevel,
      seasonalFactors,
      locationFactors,
      conversationQuality,
      buyingSignals,
      riskFactors
    };
  }

  private determineCustomerSegment(profile?: Partial<CustomerProfile>): string {
    if (!profile?.age) return 'unknown';
    
    const age = profile.age;
    if (age >= 22 && age <= 35) return 'young_professional';
    if (age >= 25 && age <= 50) return 'family_oriented';
    if (age >= 30 && age <= 65) return 'business_owner';
    if (age >= 55) return 'senior';
    
    return 'young_professional';
  }

  private calculateConversionProbability(request: LeadCaptureRequest): number {
    let probability = 0.3; // Base probability
    
    // Score factor
    probability += (request.score / 10) * 0.4;
    
    // Source factor
    const sourceFactors: { [key: string]: number } = {
      'whatsapp': 0.15,
      'chat': 0.1,
      'web_form': 0.05,
      'referral': 0.2,
      'phone': 0.25
    };
    probability += sourceFactors[request.source] || 0;
    
    // Premium calculation factor
    if (request.premiumCalculationRequest) {
      probability += 0.2;
    }
    
    // Urgency factor
    if (request.aiAnalysis?.urgencyLevel === 'high') {
      probability += 0.15;
    }
    
    // Buying signals factor
    const buyingSignalCount = request.aiAnalysis?.buyingSignals?.length || 0;
    probability += Math.min(buyingSignalCount * 0.05, 0.2);
    
    return Math.min(probability, 0.95);
  }

  private estimateLeadValue(request: LeadCaptureRequest): number {
    const baseValues: { [key: string]: number } = {
      'auto': 2000,
      'health': 3000,
      'life': 5000,
      'business': 8000,
      'property': 4000,
      'travel': 500
    };
    
    let baseValue = baseValues[request.productInterest] || 1000;
    
    // Adjust based on customer segment
    if (request.customerProfile?.incomeRange === 'premium') {
      baseValue *= 2;
    } else if (request.customerProfile?.incomeRange === 'high') {
      baseValue *= 1.5;
    } else if (request.customerProfile?.incomeRange === 'low') {
      baseValue *= 0.7;
    }
    
    // Adjust based on lead score
    baseValue *= (request.score / 10);
    
    return Math.round(baseValue);
  }

  private determinePriority(
    score: number, 
    enhancedContext?: Lead['enhancedContext']
  ): Lead['priority'] {
    if (score >= 8.5 || enhancedContext?.urgencyLevel === 'high') {
      return 'urgent';
    } else if (score >= 7 || enhancedContext?.urgencyLevel === 'medium') {
      return 'high';
    } else if (score >= 5) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private getSeasonalFactors(): string[] {
    const month = new Date().getMonth() + 1;
    
    if ([11, 12, 1, 2, 3].includes(month)) {
      return ['harmattan', 'dust_season', 'respiratory_concerns'];
    } else if ([4, 5, 6, 7, 8, 9, 10].includes(month)) {
      return ['rainy_season', 'flooding_risk', 'vehicle_protection'];
    } else if (month === 12) {
      return ['christmas', 'travel_season', 'family_protection'];
    }
    
    return ['dry_season'];
  }

  private getLocationFactors(location?: string): string[] {
    if (!location) return [];
    
    const locationMap: { [key: string]: string[] } = {
      'accra': ['urban', 'high_traffic', 'theft_risk', 'flooding_areas'],
      'kumasi': ['urban', 'market_fires', 'dust'],
      'tamale': ['rural', 'extreme_weather', 'limited_services'],
      'coastal': ['flooding', 'storms', 'saltwater_damage']
    };
    
    return locationMap[location.toLowerCase()] || ['general_location'];
  }

  private calculateConversationQuality(request: LeadCaptureRequest): number {
    let quality = 0.5; // Base quality
    
    // Conversation length factor
    const messageCount = request.conversationContext?.messageCount || 1;
    quality += Math.min(messageCount * 0.1, 0.3);
    
    // AI analysis confidence
    if (request.aiAnalysis?.confidence) {
      quality += request.aiAnalysis.confidence * 0.2;
    }
    
    // Premium calculation engagement
    if (request.premiumCalculationRequest) {
      quality += 0.2;
    }
    
    return Math.min(quality, 1.0);
  }

  private extractRiskFactors(request: LeadCaptureRequest): string[] {
    const riskFactors: string[] = [];
    
    if (request.aiAnalysis?.emotionalState === 'frustrated') {
      riskFactors.push('customer_frustration');
    }
    
    if (request.score < 5) {
      riskFactors.push('low_engagement');
    }
    
    if (!request.contactInfo.phone && !request.contactInfo.email) {
      riskFactors.push('no_contact_info');
    }
    
    return riskFactors;
  }

  private async scheduleFollowUp(lead: Lead): Promise<void> {
    // Schedule follow-up based on priority
    const followUpDelays: { [key: string]: number } = {
      'urgent': 1, // 1 hour
      'high': 4,   // 4 hours
      'medium': 24, // 1 day
      'low': 72    // 3 days
    };
    
    const delayHours = followUpDelays[lead.priority] || 24;
    lead.followUpScheduled = new Date(Date.now() + delayHours * 60 * 60 * 1000);
    
    console.log(`📅 Follow-up scheduled for lead ${lead.id} in ${delayHours} hours`);
  }

  private calculateDistribution(leads: Lead[], field: keyof Lead): { [key: string]: number } {
    const distribution: { [key: string]: number } = {};
    
    leads.forEach(lead => {
      const value = String(lead[field] || 'unknown');
      distribution[value] = (distribution[value] || 0) + 1;
    });
    
    return distribution;
  }

  private calculateEnhancedDistribution(
    leads: Lead[], 
    accessor: (lead: Lead) => string
  ): { [key: string]: number } {
    const distribution: { [key: string]: number } = {};
    
    leads.forEach(lead => {
      const value = accessor(lead);
      distribution[value] = (distribution[value] || 0) + 1;
    });
    
    return distribution;
  }

  private calculateSeasonalTrends(leads: Lead[]): { [key: string]: number } {
    const trends: { [key: string]: number } = {};
    
    leads.forEach(lead => {
      const month = lead.createdAt.getMonth() + 1;
      let season = 'dry';
      
      if ([11, 12, 1, 2, 3].includes(month)) season = 'harmattan';
      else if ([4, 5, 6, 7, 8, 9, 10].includes(month)) season = 'rainy';
      else if (month === 12) season = 'christmas';
      
      trends[season] = (trends[season] || 0) + 1;
    });
    
    return trends;
  }

  private calculateAverageConversationQuality(leads: Lead[]): number {
    const qualityLeads = leads.filter(lead => lead.enhancedContext?.conversationQuality);
    
    if (qualityLeads.length === 0) return 0;
    
    const totalQuality = qualityLeads.reduce(
      (sum, lead) => sum + (lead.enhancedContext?.conversationQuality || 0), 
      0
    );
    
    return totalQuality / qualityLeads.length;
  }

  private calculateTopPerformingSources(leads: Lead[]): Array<{ source: string; conversionRate: number; count: number }> {
    const sourceStats: { [key: string]: { total: number; converted: number } } = {};
    
    leads.forEach(lead => {
      if (!sourceStats[lead.source]) {
        sourceStats[lead.source] = { total: 0, converted: 0 };
      }
      
      sourceStats[lead.source].total++;
      if (lead.status === 'converted') {
        sourceStats[lead.source].converted++;
      }
    });
    
    return Object.entries(sourceStats)
      .map(([source, stats]) => ({
        source,
        conversionRate: stats.total > 0 ? (stats.converted / stats.total) * 100 : 0,
        count: stats.total
      }))
      .sort((a, b) => b.conversionRate - a.conversionRate)
      .slice(0, 5);
  }

  private generateLeadId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 6);
    return `lead_${timestamp}_${random}`;
  }

  private generateNoteId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 4);
    return `note_${timestamp}_${random}`;
  }

  private async saveToFile(): Promise<void> {
    try {
      const data = {
        leads: Array.from(this.leads.values()),
        lastUpdated: new Date(),
        companyId: this.companyId,
        version: '2.0'
      };
      
      await fs.writeFile(this.dataPath, JSON.stringify(data, null, 2));
      console.log('💾 Leads saved to file');
    } catch (error) {
      console.error('❌ Failed to save leads to file:', error);
    }
  }

  /**
   * Export leads to CSV
   */
  async exportToCSV(filters?: any): Promise<string> {
    const { leads } = this.getLeads(filters);
    
    const headers = [
      'Lead ID',
      'User ID',
      'Name',
      'Phone',
      'Email',
      'Source',
      'Product Interest',
      'Score',
      'Status',
      'Priority',
      'Created At',
      'Customer Segment',
      'Urgency Level',
      'Premium Quote',
      'Conversion Probability',
      'Estimated Value'
    ];
    
    const rows = leads.map(lead => [
      lead.id,
      lead.userId,
      lead.contactInfo.name || '',
      lead.contactInfo.phone || '',
      lead.contactInfo.email || '',
      lead.source,
      lead.productInterest,
      lead.score,
      lead.status,
      lead.priority,
      lead.createdAt.toISOString(),
      lead.enhancedContext?.customerSegment || '',
      lead.enhancedContext?.urgencyLevel || '',
      lead.premiumCalculationRequest?.quote?.amount || '',
      lead.conversionProbability || '',
      lead.estimatedValue || ''
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    
    return csvContent;
  }

  /**
   * Get lead insights using AI analysis
   */
  getLeadInsights(leadId: string): {
    summary: string;
    recommendations: string[];
    nextBestActions: string[];
    riskFactors: string[];
    opportunities: string[];
  } {
    const lead = this.leads.get(leadId);
    if (!lead) {
      return {
        summary: 'Lead not found',
        recommendations: [],
        nextBestActions: [],
        riskFactors: [],
        opportunities: []
      };
    }
    
    const summary = this.generateLeadSummary(lead);
    const recommendations = this.generateRecommendations(lead);
    const nextBestActions = this.generateNextBestActions(lead);
    const riskFactors = lead.enhancedContext?.riskFactors || [];
    const opportunities = this.identifyOpportunities(lead);
    
    return {
      summary,
      recommendations,
      nextBestActions,
      riskFactors,
      opportunities
    };
  }

  private generateLeadSummary(lead: Lead): string {
    const age = lead.customerProfile?.age;
    const location = lead.customerProfile?.location;
    const segment = lead.enhancedContext?.customerSegment;
    const urgency = lead.enhancedContext?.urgencyLevel;
    const score = lead.score;
    const probability = lead.conversionProbability;
    
    let summary = `${segment || 'Customer'} interested in ${lead.productInterest} insurance. `;
    
    if (age && location) {
      summary += `${age}y old from ${location}. `;
    }
    
    summary += `Lead score: ${score}/10 with ${Math.round((probability || 0) * 100)}% conversion probability. `;
    
    if (urgency === 'high') {
      summary += 'High urgency - requires immediate attention. ';
    }
    
    if (lead.premiumCalculationRequest) {
      summary += `Requested premium calculation for ${lead.premiumCalculationRequest.insuranceType} insurance. `;
    }
    
    const touchpointCount = lead.touchpoints.length;
    summary += `${touchpointCount} touchpoint${touchpointCount !== 1 ? 's' : ''} via ${lead.source}.`;
    
    return summary;
  }

  private generateRecommendations(lead: Lead): string[] {
    const recommendations: string[] = [];
    
    // Priority-based recommendations
    if (lead.priority === 'urgent') {
      recommendations.push('Contact immediately - high priority lead');
    } else if (lead.priority === 'high') {
      recommendations.push('Contact within 4 hours for best results');
    }
    
    // Score-based recommendations
    if (lead.score >= 8) {
      recommendations.push('Highly qualified lead - focus on closing');
    } else if (lead.score < 5) {
      recommendations.push('Nurture lead with educational content');
    }
    
    // Premium calculation recommendations
    if (lead.premiumCalculationRequest && lead.premiumCalculationRequest.quote) {
      recommendations.push('Follow up on premium quote provided');
    } else if (lead.productInterest && !lead.premiumCalculationRequest) {
      recommendations.push('Offer premium calculation to increase engagement');
    }
    
    // Source-specific recommendations
    if (lead.source === 'whatsapp') {
      recommendations.push('Continue conversation via WhatsApp for best engagement');
    } else if (lead.source === 'chat') {
      recommendations.push('Consider phone follow-up for more personal touch');
    }
    
    // Customer segment recommendations
    const segment = lead.enhancedContext?.customerSegment;
    if (segment === 'young_professional') {
      recommendations.push('Emphasize digital convenience and affordability');
    } else if (segment === 'family_oriented') {
      recommendations.push('Focus on family protection and comprehensive coverage');
    } else if (segment === 'business_owner') {
      recommendations.push('Highlight business protection and tax benefits');
    }
    
    return recommendations;
  }

  private generateNextBestActions(lead: Lead): string[] {
    const actions: string[] = [];
    
    // Status-based actions
    switch (lead.status) {
      case 'new':
        actions.push('Make initial contact');
        actions.push('Qualify lead requirements');
        break;
      case 'contacted':
        actions.push('Follow up on initial conversation');
        actions.push('Send relevant information');
        break;
      case 'qualified':
        actions.push('Present tailored solution');
        actions.push('Schedule product demonstration');
        break;
      case 'nurturing':
        actions.push('Send educational content');
        actions.push('Check in monthly');
        break;
    }
    
    // Premium calculation actions
    if (lead.premiumCalculationRequest?.quote) {
      actions.push('Discuss premium quote details');
      actions.push('Address any pricing concerns');
    }
    
    // Urgency-based actions
    if (lead.enhancedContext?.urgencyLevel === 'high') {
      actions.push('Expedite application process');
      actions.push('Offer immediate coverage options');
    }
    
    // Follow-up scheduling
    if (lead.followUpScheduled && lead.followUpScheduled <= new Date()) {
      actions.push('Execute scheduled follow-up');
    }
    
    return actions.slice(0, 5); // Limit to top 5 actions
  }

  private identifyOpportunities(lead: Lead): string[] {
    const opportunities: string[] = [];
    
    // Cross-selling opportunities
    if (lead.productInterest === 'auto' && lead.customerProfile?.familySize && lead.customerProfile.familySize > 1) {
      opportunities.push('Cross-sell family health insurance');
    }
    
    if (lead.productInterest === 'health' && lead.enhancedContext?.customerSegment === 'family_oriented') {
      opportunities.push('Cross-sell life insurance for family protection');
    }
    
    if (lead.enhancedContext?.customerSegment === 'business_owner') {
      opportunities.push('Explore business insurance needs');
    }
    
    // Seasonal opportunities
    const month = new Date().getMonth() + 1;
    if ([4, 5, 6, 7, 8, 9, 10].includes(month) && lead.customerProfile?.location?.toLowerCase().includes('accra')) {
      opportunities.push('Offer flood insurance for rainy season');
    }
    
    if ([11, 12, 1, 2, 3].includes(month)) {
      opportunities.push('Promote health coverage for Harmattan season');
    }
    
    // Premium calculation opportunities
    if (!lead.premiumCalculationRequest && lead.score >= 6) {
      opportunities.push('Offer premium calculation to increase engagement');
    }
    
    // Location-based opportunities
    if (lead.customerProfile?.location?.toLowerCase() === 'accra') {
      opportunities.push('Highlight urban-specific coverage benefits');
    }
    
    return opportunities;
  }

  /**
   * Get dashboard statistics
   */
  getDashboardStats(): {
    totalLeads: number;
    newLeads: number;
    hotLeads: number;
    conversionRate: number;
    averageScore: number;
    premiumCalculationLeads: number;
    todaysLeads: number;
    pendingFollowUps: number;
  } {
    const allLeads = Array.from(this.leads.values());
    const totalLeads = allLeads.length;
    
    const newLeads = allLeads.filter(lead => lead.status === 'new').length;
    const hotLeads = allLeads.filter(lead => lead.score >= 8 || lead.priority === 'urgent').length;
    
    const convertedLeads = allLeads.filter(lead => lead.status === 'converted').length;
    const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;
    
    const averageScore = totalLeads > 0 
      ? allLeads.reduce((sum, lead) => sum + lead.score, 0) / totalLeads 
      : 0;
    
    const premiumCalculationLeads = allLeads.filter(lead => 
      lead.premiumCalculationRequest !== undefined
    ).length;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysLeads = allLeads.filter(lead => lead.createdAt >= today).length;
    
    const now = new Date();
    const pendingFollowUps = allLeads.filter(lead => 
      lead.followUpScheduled && lead.followUpScheduled <= now && lead.status !== 'converted' && lead.status !== 'lost'
    ).length;
    
    return {
      totalLeads,
      newLeads,
      hotLeads,
      conversionRate: Math.round(conversionRate * 100) / 100,
      averageScore: Math.round(averageScore * 100) / 100,
      premiumCalculationLeads,
      todaysLeads,
      pendingFollowUps
    };
  }

  /**
   * Cleanup old leads (for maintenance)
   */
  async cleanupOldLeads(daysOld: number = 365): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const initialCount = this.leads.size;
    
    // Only remove leads that are old AND have status 'lost' or very low scores
    for (const [leadId, lead] of this.leads.entries()) {
      if (lead.createdAt < cutoffDate && 
          (lead.status === 'lost' || (lead.score < 3 && lead.status === 'new'))) {
        this.leads.delete(leadId);
      }
    }
    
    const finalCount = this.leads.size;
    const deletedCount = initialCount - finalCount;
    
    if (deletedCount > 0) {
      await this.saveToFile();
      console.log(`🧹 Cleaned up ${deletedCount} old leads`);
    }
    
    return deletedCount;
  }

  /**
   * Assign lead to team member
   */
  async assignLead(leadId: string, assignedTo: string): Promise<Lead | null> {
    const lead = this.leads.get(leadId);
    if (!lead) return null;
    
    lead.assignedTo = assignedTo;
    lead.updatedAt = new Date();
    
    lead.notes.push({
      id: this.generateNoteId(),
      content: `Lead assigned to ${assignedTo}`,
      createdAt: new Date(),
      createdBy: 'system',
      type: 'system'
    });
    
    await this.saveToFile();
    
    console.log(`👥 Lead ${leadId} assigned to ${assignedTo}`);
    
    return lead;
  }

  /**
   * Get leads assigned to specific team member
   */
  getAssignedLeads(assignedTo: string): Lead[] {
    return Array.from(this.leads.values()).filter(lead => lead.assignedTo === assignedTo);
  }

  /**
   * Get overdue follow-ups
   */
  getOverdueFollowUps(): Lead[] {
    const now = new Date();
    return Array.from(this.leads.values()).filter(lead => 
      lead.followUpScheduled && 
      lead.followUpScheduled <= now && 
      lead.status !== 'converted' && 
      lead.status !== 'lost'
    );
  }
}

export default LeadService;