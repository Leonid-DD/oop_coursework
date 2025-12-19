import { Injectable } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { StorageService } from 'src/storage/storage.service';
import { SpendingRecord } from 'src/telegram/dto/telegram.dto';

@Injectable()
export class HelperService {

    deleteUserMessage(bot: TelegramBot, id: number, msg: TelegramBot.Message): void {
        bot.deleteMessage(id, msg.message_id).catch(error => {
          console.error('Error deleting message: ', error)
        });
    }    

    formatSpendingsText(spendings: SpendingRecord[]): string {
        if (spendings.length === 0) {
          return "(пока нет трат)";
        }
        
        return spendings.map((record, index) => {
          const date = this.formatDate(record.date);
          return `${index + 1}. ${record.category}: ${record.amount} руб. (${date})`;
        }).join('\n');
    }
    
    formatDate(date: number): string {
        return new Date(date).toLocaleDateString('ru-RU');
    }
}
