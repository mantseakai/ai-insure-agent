// Fixed LeadService with captureLead method
// File: backend/src/services/LeadService.ts

interface Lead {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  source: string;
  interests: string[];
  urgencyLevel: 'high' | 'medium' | 'low';
  score: number;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
  nextSteps: string[];
}

interface CaptureLeadData {
  userId: string;
  contactInfo: any;
  source: string;
  productInterest: string;
  score: number;
  conversationContext?: any;
}

export class LeadService {
  private leads: Map<string, Lead> = new Map();

  /**
   * Capture a new lead - this method was missing
   */
  async captureLead(leadData: CaptureLeadData): Promise<Lead> {
    console.log(`🎯 Capturing lead for user ${leadData.userId} with score ${leadData.score}`);
    
    const leadId = this.generateLeadId();
    
    const lead: Lead = {
      id: leadId,
      name: leadData.contactInfo.name,
      email: leadData.contactInfo.email,
      phone: leadData.contactInfo.phone,
      source: leadData.source,
      interests: [leadData.productInterest],
      urgencyLevel: this.determineUrgencyLevel(leadData.score, leadData.conversationContext),
      score: leadData.score,
      status: 'new',
      metadata: {
        userId: leadData.userId,
        conversationContext: leadData.conversationContext,
        capturedAt: new Date()
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      nextSteps: this.generateNextSteps({
        source: leadData.source,
        interests: [leadData.productInterest],
        urgencyLevel: this.determineUrgencyLevel(leadData.score, leadData.conversationContext),
        score: leadData.score
      })
    };

    this.leads.set(leadId, lead);
    console.log(`✅ Lead captured successfully: ${leadId}`);
    
    return lead;
  }

  async createLead(leadData: any): Promise<Lead> {
    const leadId = this.generateLeadId();
    
    const lead: Lead = {
      id: leadId,
      name: leadData.name,
      email: leadData.email,
      phone: leadData.phone,
      source: leadData.source || 'web_form',
      interests: leadData.interests || [],
      urgencyLevel: leadData.urgencyLevel || 'medium',
      score: this.calculateLeadScore(leadData),
      status: 'new',
      metadata: leadData.metadata || {},
      createdAt: new Date(),
      updatedAt: new Date(),
      nextSteps: this.generateNextSteps(leadData)
    };

    this.leads.set(leadId, lead);
    console.log(`New lead created: ${leadId}`);
    
    return lead;
  }

  async getLeadById(leadId: string): Promise<Lead | null> {
    return this.leads.get(leadId) || null;
  }

  async updateLead(leadId: string, updates: Partial<Lead>): Promise<Lead | null> {
    const lead = this.leads.get(leadId);
    if (!lead) return null;

    const updatedLead = {
      ...lead,
      ...updates,
      updatedAt: new Date()
    };

    this.leads.set(leadId, updatedLead);
    return updatedLead;
  }

  private generateLeadId(): string {
    return `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateLeadScore(leadData: any): number {
    let score = 0;

    // Contact information completeness
    if (leadData.email) score += 20;
    if (leadData.phone) score += 25;
    if (leadData.name) score += 15;

    // Interest indicators
    if (leadData.interests?.length > 0) score += 20;
    if (leadData.urgencyLevel === 'high') score += 15;
    if (leadData.urgencyLevel === 'medium') score += 10;

    // Source quality
    const sourceScores: Record<string, number> = {
      'viral_quiz': 20,
      'viral_challenge': 18,
      'qr_code': 15,
      'referral': 25,
      'social_media': 10,
      'web_form': 12,
      'chat': 15
    };
    score += sourceScores[leadData.source] || 5;

    return Math.min(100, Math.max(0, score));
  }

  private determineUrgencyLevel(score: number, context?: any): 'high' | 'medium' | 'low' {
    if (score >= 8.5) return 'high';
    if (score >= 6.5) return 'medium';
    return 'low';
  }

  private generateNextSteps(leadData: any): string[] {
    const nextSteps = [];

    if (leadData.urgencyLevel === 'high') {
      nextSteps.push('Contact within 1 hour');
      nextSteps.push('Prepare personalized quote');
    } else if (leadData.urgencyLevel === 'medium') {
      nextSteps.push('Contact within 24 hours');
      nextSteps.push('Send educational content');
    } else {
      nextSteps.push('Add to nurture sequence');
      nextSteps.push('Contact within 3 days');
    }

    if (leadData.interests?.includes('auto')) {
      nextSteps.push('Prepare auto insurance materials');
    }
    if (leadData.interests?.includes('health')) {
      nextSteps.push('Prepare health insurance comparison');
    }
    if (leadData.interests?.includes('life')) {
      nextSteps.push('Prepare life insurance information');
    }
    if (leadData.interests?.includes('business')) {
      nextSteps.push('Prepare business insurance proposal');
    }

    return nextSteps;
  }

  // Get leads with filters
  async getLeads(filters: any = {}): Promise<Lead[]> {
    let leads = Array.from(this.leads.values());

    if (filters.status) {
      leads = leads.filter(lead => lead.status === filters.status);
    }
    if (filters.source) {
      leads = leads.filter(lead => lead.source === filters.source);
    }
    if (filters.minScore) {
      leads = leads.filter(lead => lead.score >= filters.minScore);
    }

    // Sort by score and creation date
    leads.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return leads;
  }

  // Get lead statistics
  getLeadStats(): any {
    const leads = Array.from(this.leads.values());
    
    return {
      total: leads.length,
      byStatus: {
        new: leads.filter(l => l.status === 'new').length,
        contacted: leads.filter(l => l.status === 'contacted').length,
        qualified: leads.filter(l => l.status === 'qualified').length,
        converted: leads.filter(l => l.status === 'converted').length,
        lost: leads.filter(l => l.status === 'lost').length
      },
      averageScore: leads.reduce((sum, lead) => sum + lead.score, 0) / leads.length || 0,
      highPriorityLeads: leads.filter(l => l.urgencyLevel === 'high').length
    };
  }
}

export default LeadService;