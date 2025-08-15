// Enhanced RAG Knowledge Base Structure for Insurance AI Agent V2
// File: backend/src/data/enhanced-knowledge-base.ts

export interface EnhancedRAGDocument {
  id: string;
  content: string;
  metadata: {
    type: 'product' | 'premium_calculation' | 'risk_factors' | 'objection' | 'process' | 'market_context' | 'regulatory' | 'claims';
    category: string;
    subcategory?: string;
    priority: 'high' | 'medium' | 'low';
    calculationRules?: PremiumCalculationRule[];
    riskFactors?: RiskFactor[];
    companyId: string;
    lastUpdated: Date;
    version: string;
  };
}

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

// Enhanced Knowledge Base for Premium Calculations
export const enhancedKnowledgeBase: EnhancedRAGDocument[] = [
  
  // 1. AUTO INSURANCE PREMIUM CALCULATIONS
  {
    id: 'auto_premium_base_rates',
    content: `Auto Insurance Premium Base Rates Ghana:
    
    Comprehensive Coverage:
    - Private use sedans: GH₵ 2,400 - 4,800 annually
    - SUVs and 4WDs: GH₵ 3,600 - 7,200 annually
    - Commercial vehicles: GH₵ 4,800 - 12,000 annually
    - Motorcycles: GH₵ 600 - 1,800 annually
    
    Third Party Only:
    - All private vehicles: GH₵ 240 - 480 annually
    - Commercial vehicles: GH₵ 480 - 1,200 annually
    
    Base calculations consider vehicle value, age, and usage type.`,
    metadata: {
      type: 'premium_calculation',
      category: 'auto',
      subcategory: 'base_rates',
      priority: 'high',
      calculationRules: [
        {
          factor: 'vehicle_value',
          multiplier: 0.04,
          condition: 'comprehensive_coverage',
          description: 'Premium is 4% of vehicle value for comprehensive'
        },
        {
          factor: 'vehicle_age',
          multiplier: 0.9,
          condition: 'age > 5 years',
          description: '10% discount for vehicles older than 5 years'
        }
      ],
      companyId: 'default',
      lastUpdated: new Date(),
      version: '2.0'
    }
  },

  {
    id: 'auto_risk_factors',
    content: `Auto Insurance Risk Assessment Factors:
    
    Driver Age Impact:
    - Under 25: +40% premium increase
    - 25-35: Standard rate
    - 35-55: -10% discount
    - Over 55: -5% discount
    
    Location Risk (Ghana):
    - Accra/Kumasi: +20% urban risk premium
    - Regional capitals: +10% premium
    - Rural areas: Standard rate
    
    Driving History:
    - Clean record (5+ years): -15% discount
    - 1 claim in 3 years: +25% increase
    - Multiple claims: +50% increase
    
    Vehicle Security:
    - Car alarm: -5% discount
    - GPS tracking: -10% discount
    - Garage parking: -5% discount`,
    metadata: {
      type: 'risk_factors',
      category: 'auto',
      priority: 'high',
      riskFactors: [
        {
          name: 'driver_age',
          weight: 0.3,
          values: { 'under_25': 1.4, '25_35': 1.0, '35_55': 0.9, 'over_55': 0.95 },
          description: 'Age-based risk multiplier'
        },
        {
          name: 'location',
          weight: 0.2,
          values: { 'accra': 1.2, 'kumasi': 1.2, 'regional': 1.1, 'rural': 1.0 },
          description: 'Location-based risk adjustment'
        }
      ],
      companyId: 'default',
      lastUpdated: new Date(),
      version: '2.0'
    }
  },

  // 2. HEALTH INSURANCE PREMIUM CALCULATIONS
  {
    id: 'health_premium_calculator',
    content: `Health Insurance Premium Calculation Ghana:
    
    Individual Plans:
    - Basic Plan: GH₵ 150-300/month (NHIS supplement)
    - Standard Plan: GH₵ 400-800/month (Private hospitals)
    - Premium Plan: GH₵ 800-1,500/month (International coverage)
    
    Family Plans (Spouse + 2 children):
    - Basic: GH₵ 400-700/month
    - Standard: GH₵ 900-1,800/month  
    - Premium: GH₵ 1,800-3,200/month
    
    Age-based calculations:
    - 0-18 years: 60% of adult rate
    - 19-30 years: Base rate
    - 31-45 years: +20% increase
    - 46-60 years: +50% increase
    - 60+ years: +100% increase`,
    metadata: {
      type: 'premium_calculation',
      category: 'health',
      priority: 'high',
      calculationRules: [
        {
          factor: 'age',
          multiplier: 1.0,
          condition: 'base_rate_19_30',
          description: 'Base health insurance rate for adults 19-30'
        },
        {
          factor: 'family_size',
          multiplier: 0.8,
          condition: 'per_additional_member',
          description: '20% discount for each additional family member'
        }
      ],
      companyId: 'default',
      lastUpdated: new Date(),
      version: '2.0'
    }
  },

  {
    id: 'health_risk_assessment',
    content: `Health Insurance Risk Factors Ghana:
    
    Pre-existing Conditions:
    - Diabetes: +30% premium or exclusion
    - Hypertension: +20% premium
    - Heart conditions: +50% premium or decline
    - Previous surgeries: Case-by-case assessment
    
    Lifestyle Factors:
    - Non-smoker: -10% discount
    - Smoker: +25% increase
    - Regular exercise: -5% discount
    - High-risk occupation: +15-30% increase
    
    Family Medical History:
    - Cancer history: +15% increase
    - Genetic conditions: Medical underwriting required
    
    Geographic Health Risks:
    - Malaria-endemic areas: Standard coverage
    - Urban pollution areas: +5% respiratory coverage
    - Mining communities: +10% occupational health risk`,
    metadata: {
      type: 'risk_factors',
      category: 'health',
      priority: 'high',
      riskFactors: [
        {
          name: 'smoking_status',
          weight: 0.25,
          values: { 'smoker': 1.25, 'non_smoker': 0.9, 'former_smoker': 1.1 },
          description: 'Smoking impact on health premiums'
        }
      ],
      companyId: 'default',
      lastUpdated: new Date(),
      version: '2.0'
    }
  },

  // 3. LIFE INSURANCE CALCULATIONS
  {
    id: 'life_insurance_premiums',
    content: `Life Insurance Premium Calculations Ghana:
    
    Term Life Insurance:
    - Ages 25-35: GH₵ 2-5 per GH₵ 1,000 coverage annually
    - Ages 36-45: GH₵ 5-12 per GH₵ 1,000 coverage annually  
    - Ages 46-55: GH₵ 12-25 per GH₵ 1,000 coverage annually
    - Ages 56-65: GH₵ 25-50 per GH₵ 1,000 coverage annually
    
    Whole Life Insurance:
    - Higher premiums but includes investment component
    - Ages 25-35: GH₵ 15-30 per GH₵ 1,000 coverage annually
    - Ages 36-45: GH₵ 30-50 per GH₵ 1,000 coverage annually
    
    Coverage Amounts (Popular in Ghana):
    - Minimum: GH₵ 50,000 (funeral expenses)
    - Standard: GH₵ 200,000 - 500,000 (income replacement)
    - High: GH₵ 1,000,000+ (business/estate planning)`,
    metadata: {
      type: 'premium_calculation',
      category: 'life',
      priority: 'high',
      calculationRules: [
        {
          factor: 'age_band',
          multiplier: 1.0,
          condition: 'term_life_base',
          description: 'Age-based premium calculation for term life'
        }
      ],
      companyId: 'default',
      lastUpdated: new Date(),
      version: '2.0'
    }
  },

  // 4. BUSINESS INSURANCE CALCULATIONS  
  {
    id: 'business_insurance_premiums',
    content: `Business Insurance Premium Calculations Ghana:
    
    General Liability:
    - Small shops (up to 5 employees): GH₵ 1,200-2,400/year
    - Medium businesses (6-20 employees): GH₵ 2,400-6,000/year
    - Large businesses (20+ employees): GH₵ 6,000+/year
    
    Property Insurance:
    - Retail stores: 0.3-0.8% of property value annually
    - Restaurants: 0.5-1.2% of property value annually
    - Manufacturing: 0.4-1.0% of property value annually
    
    Business Interruption:
    - 3-6 months coverage: 0.2-0.5% of annual revenue
    - 12 months coverage: 0.4-1.0% of annual revenue
    
    Professional Indemnity:
    - Consultants: GH₵ 2,400-12,000/year
    - Healthcare providers: GH₵ 6,000-24,000/year`,
    metadata: {
      type: 'premium_calculation',
      category: 'business',
      priority: 'high',
      calculationRules: [
        {
          factor: 'business_type',
          multiplier: 1.0,
          condition: 'low_risk_office',
          description: 'Base rate for low-risk office businesses'
        },
        {
          factor: 'employee_count',
          multiplier: 1.1,
          condition: 'per_5_employees',
          description: '10% increase per 5 employees'
        }
      ],
      companyId: 'default',
      lastUpdated: new Date(),
      version: '2.0'
    }
  },

  // 5. PREMIUM CALCULATION ENGINE LOGIC
  {
    id: 'premium_calculation_engine',
    content: `Premium Calculation Engine Rules:
    
    Base Premium Formula:
    Premium = (Base Rate × Coverage Amount × Risk Multiplier × Age Factor × Location Factor) + Fixed Fees
    
    Discount Application Order:
    1. Apply bulk/family discounts first
    2. Apply loyalty discounts  
    3. Apply safety/security discounts
    4. Apply payment method discounts (annual payment: -5%)
    
    Maximum Adjustments:
    - Total discounts cannot exceed 40%
    - Total risk increases cannot exceed 200% 
    - Minimum premium thresholds must be maintained
    
    Payment Options Impact:
    - Annual payment: -5% discount
    - Semi-annual: -2% discount  
    - Quarterly: Standard rate
    - Monthly: +3% administrative fee
    - Mobile money: -1% convenience discount`,
    metadata: {
      type: 'premium_calculation',
      category: 'engine',
      priority: 'high',
      companyId: 'default',
      lastUpdated: new Date(),
      version: '2.0'
    }
  },

  // 6. REGULATORY COMPLIANCE
  {
    id: 'nca_regulations_premiums',
    content: `NCA Regulatory Requirements for Premium Calculations:
    
    Minimum Capital Requirements:
    - All premium calculations must ensure adequate reserves
    - Solvency ratios maintained above NCA minimums
    
    Rate Filing Requirements:
    - All premium rates filed with NCA annually
    - Rate changes require 30-day advance notice
    - Discriminatory pricing prohibited
    
    Consumer Protection:
    - Clear premium calculation methodology disclosure
    - Right to premium explanation and breakdown
    - Appeals process for premium disputes
    
    Technical Reserves:
    - Unearned premium reserves: 40% of gross premiums
    - Outstanding claims reserves: Actuarially determined
    - Catastrophe reserves: 3% of net premiums`,
    metadata: {
      type: 'regulatory',
      category: 'compliance',
      priority: 'high',
      companyId: 'default',
      lastUpdated: new Date(),
      version: '2.0'
    }
  },

  // 7. CLAIMS PROCESSING KNOWLEDGE
  {
    id: 'claims_process_auto',
    content: `Auto Insurance Claims Process Ghana:
    
    Immediate Steps (First 24 hours):
    1. Ensure safety and call emergency services if needed
    2. Report to Police (Ghana Police: 191 or 18555)
    3. Contact insurer via WhatsApp: +233-XXX-XXXX or call center
    4. Take photos: vehicle damage, accident scene, license plates
    5. Collect other driver's information and witness contacts
    
    Required Documents:
    - Valid driving license and insurance certificate
    - Police report (MVTD 51 form)
    - Completed claim form
    - Repair quotations from approved workshops
    
    Claim Timeline:
    - Initial assessment: 3-5 business days
    - Workshop approval: 2-3 business days  
    - Final settlement: 10-14 business days
    
    Approved Repair Networks:
    - Accra: Japan Motors, Toyota Ghana, others
    - Kumasi: Unity Motors, Rana Motors
    - Tamale: Northern Motors`,
    metadata: {
      type: 'claims',
      category: 'auto',
      priority: 'high',
      companyId: 'default',
      lastUpdated: new Date(),
      version: '2.0'
    }
  }
];

// Premium Calculation Service Class
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