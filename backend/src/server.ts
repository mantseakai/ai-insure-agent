// Load environment variables FIRST
import dotenv from 'dotenv';
dotenv.config();

// Verify environment
console.log('🔍 Environment Check:');
console.log('OPENAI_API_KEY present:', !!process.env.OPENAI_API_KEY);
console.log('OPENAI_API_KEY length:', process.env.OPENAI_API_KEY?.length || 0);


import app from './app';

const PORT = process.env.PORT || 3000;



const server = app.listen(PORT, () => {
  console.log(`🚀 AI Insurance Agent API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 Chat endpoint: http://localhost:${PORT}/api/chat`);
  console.log(`📝 Environment: ${process.env.NODE_ENV}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});