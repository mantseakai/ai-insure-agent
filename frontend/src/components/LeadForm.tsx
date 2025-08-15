import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface LeadFormProps {
  onSubmit: (data: any) => void;
  onCancel: () => void;
  chatData?: any;
}

const LeadForm: React.FC<LeadFormProps> = ({ onSubmit, onCancel, chatData }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    interests: [] as string[]
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInterestChange = (interest: string) => {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest]
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Get Your Personalized Quote
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            {/* Context Info */}
            {chatData?.lastMessage && (
              <div className="bg-blue-50 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-800">
                  Based on your question: "{chatData.lastMessage.substring(0, 100)}..."
                </p>
              </div>
            )}

            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Enter your full name"
                required
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="your.email@example.com"
                required
              />
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="+233 XX XXX XXXX"
                required
              />
            </div>

            {/* Interests */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Insurance Interests (select all that apply)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'auto', label: 'Auto Insurance' },
                  { id: 'health', label: 'Health Insurance' },
                  { id: 'life', label: 'Life Insurance' },
                  { id: 'business', label: 'Business Insurance' }
                ].map((interest) => (
                  <label
                    key={interest.id}
                    className="flex items-center space-x-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={formData.interests.includes(interest.id)}
                      onChange={() => handleInterestChange(interest.id)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">{interest.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex space-x-3 mt-6">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 btn-primary"
              disabled={isSubmitting || !formData.name || !formData.email || !formData.phone}
            >
              {isSubmitting ? 'Submitting...' : 'Get My Quote'}
            </button>
          </div>

          <p className="text-xs text-gray-500 mt-3 text-center">
            Your information is secure and will only be used to provide you with insurance quotes.
          </p>
        </form>
      </div>
    </div>
  );
};

export default LeadForm;