import dotenv from 'dotenv';

dotenv.config();

export const config = {
  telegramBotToken: process.env.BOT_TOKEN || '',
  
  validateConfig: () => {
    if (!config.telegramBotToken) {
      throw new Error('BOT_TOKEN не найден в .env файле');
    }
    return true;
  }
};

config.validateConfig();