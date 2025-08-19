import { Router, Request, Response } from 'express';
import LeadService from '../services/LeadService';
import { validateLeadCapture } from '../middleware/validation';

const router = Router();
const leadService = new LeadService();

// Capture new lead
router.post('/capture', validateLeadCapture, async (req: Request, res: Response) => {
  try {
    const leadData = req.body;
    const lead = await leadService.captureLead(leadData);

    res.status(201).json({
      success: true,
      data: {
        leadId: lead.leadId,
        message: 'Lead captured successfully'
      }
    });

  } catch (error) {
    console.error('Lead capture error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to capture lead'
    });
  }
});

// Get lead by ID
router.get('/:leadId', async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const lead = await leadService.getLead(leadId);

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    res.json({
      success: true,
      data: lead
    });

  } catch (error) {
    console.error('Get lead error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve lead'
    });
  }
});

export default router;