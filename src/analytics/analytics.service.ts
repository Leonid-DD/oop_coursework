import { StorageService } from 'src/storage/storage.service';
import { Injectable } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { CategoryStats, SpendingRecord } from 'src/telegram/dto/telegram.dto';
import { HelperService } from 'src/helper/helper.service';

@Injectable()
export class AnalyticsService {

    constructor(private readonly storageService: StorageService, private readonly helper: HelperService) { }

    showLastMonthSpendings(bot: TelegramBot, id: number, msg: TelegramBot.Message): void {
        const userSpendings = this.storageService.getUserSpendings(id);
        
        if (userSpendings.length === 0) {
          bot.editMessageText("📭 <b>Нет сохраненных трат</b>\n\nУ вас пока нет ни одной сохраненной траты.", {
            chat_id: id, message_id: msg.message_id,
            reply_markup: {
              inline_keyboard: [[{
                text: '↩️ Назад к аналитике',
                callback_data: 'cancel_analytics'
              }]]
            },
            parse_mode: "HTML"
          });
          return;
        }
        
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        const lastMonthSpendings = userSpendings.filter(spending => {
          const spendingDate = new Date(spending.date);
          return spendingDate.getMonth() === currentMonth && 
                 spendingDate.getFullYear() === currentYear;
        });
        
        if (lastMonthSpendings.length === 0) {
          const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                             'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
          
          bot.editMessageText(`📭 <b>Нет трат за текущий месяц</b>\n\nЗа ${monthNames[currentMonth]} ${currentYear} трат не обнаружено.`, {
            chat_id: id, message_id: msg.message_id,
            reply_markup: {
              inline_keyboard: [[{
                text: '↩️ Назад к аналитике',
                callback_data: 'cancel_analytics'
              }]]
            },
            parse_mode: "HTML"
          });
          return;
        }
        
        const totalAmount = lastMonthSpendings.reduce((sum, record) => sum + record.amount, 0);
        
        const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                           'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        
        let resultText = `📅 <b>Траты за ${monthNames[currentMonth]} ${currentYear}</b>\n\n`;
        resultText += `Всего трат: ${lastMonthSpendings.length}\n`;
        resultText += `Общая сумма: ${totalAmount.toFixed(2)} руб.\n\n`;
        
        // Сортируем по дате (новые сначала)
        const sortedSpendings = [...lastMonthSpendings].sort((a, b) => 
          b.date - a.date
        );
        
        // Группируем по дням
        const spendingsByDay: { [key: string]: SpendingRecord[] } = {};
        sortedSpendings.forEach(spending => {
          const dateKey = this.helper.formatDate(spending.date);
          if (!spendingsByDay[dateKey]) {
            spendingsByDay[dateKey] = [];
          }
          spendingsByDay[dateKey].push(spending);
        });
        
        // Выводим траты по дням
        Object.keys(spendingsByDay).sort((a, b) => 
          new Date(b).getTime() - new Date(a).getTime()
        ).forEach(date => {
          const daySpendings = spendingsByDay[date];
          const dayTotal = daySpendings.reduce((sum, record) => sum + record.amount, 0);
          
          resultText += `📆 <b>${date}</b> (${daySpendings.length} трат, ${dayTotal.toFixed(2)} руб.)\n`;
          
          daySpendings.forEach((spending, index) => {
            const time = new Date(spending.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            resultText += `  ${index + 1}. ${spending.category}: ${spending.amount.toFixed(2)} руб. (${time})\n`;
          });
          resultText += '\n';
        });
        
        bot.editMessageText(resultText, {
          chat_id: id, message_id: msg.message_id,
          reply_markup: {
            inline_keyboard: [[{
              text: '↩️ Назад к аналитике',
              callback_data: 'cancel_analytics'
            }]]
          },
          parse_mode: "HTML"
        });
      }
    
      showSpendingsByCategory(bot: TelegramBot, id: number, msg: TelegramBot.Message): void {
        const userSpendings = this.storageService.getUserSpendings(id);
        
        if (userSpendings.length === 0) {
          bot.editMessageText("📭 <b>Нет сохраненных трат</b>\n\nУ вас пока нет ни одной сохраненной траты.", {
            chat_id: id, message_id: msg.message_id,
            reply_markup: {
              inline_keyboard: [[{
                text: '↩️ Назад к аналитике',
                callback_data: 'cancel_analytics'
              }]]
            },
            parse_mode: "HTML"
          });
          return;
        }
        
        // Группируем по категориям
        const categoryStats: { [key: string]: CategoryStats } = {};
        
        userSpendings.forEach(spending => {
          if (!categoryStats[spending.category]) {
            categoryStats[spending.category] = {
              category: spending.category,
              totalAmount: 0,
              count: 0
            };
          }
          categoryStats[spending.category].totalAmount += spending.amount;
          categoryStats[spending.category].count++;
        });
        
        // Сортируем по общей сумме (по убыванию)
        const sortedCategories = Object.values(categoryStats).sort((a, b) => b.totalAmount - a.totalAmount);
        
        const totalAmount = userSpendings.reduce((sum, record) => sum + record.amount, 0);
        const totalCount = userSpendings.length;
        
        let resultText = `🗂️ <b>Траты по категориям (все время)</b>\n\n`;
        resultText += `Всего трат: ${totalCount}\n`;
        resultText += `Общая сумма: ${totalAmount.toFixed(2)} руб.\n\n`;
        
        // Выводим категории с суммами
        sortedCategories.forEach((stat, index) => {
          const percentage = ((stat.totalAmount / totalAmount) * 100).toFixed(1);
          const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          
          resultText += `${rankEmoji} <b>${stat.category}</b>\n`;
          resultText += `   Количество трат: ${stat.count}\n`;
          resultText += `   Общая сумма: ${stat.totalAmount.toFixed(2)} руб.\n`;
          resultText += `   Доля от общих трат: ${percentage}%\n\n`;
        });
        
        // Добавляем итоговую статистику
        const averagePerCategory = totalAmount / sortedCategories.length;
        const mostExpensiveCategory = sortedCategories[0];
        const leastExpensiveCategory = sortedCategories[sortedCategories.length - 1];
        
        resultText += `📊 <b>Статистика:</b>\n`;
        resultText += `• Всего категорий: ${sortedCategories.length}\n`;
        resultText += `• Средняя сумма на категорию: ${averagePerCategory.toFixed(2)} руб.\n`;
        resultText += `• Самая затратная категория: ${mostExpensiveCategory.category} (${mostExpensiveCategory.totalAmount.toFixed(2)} руб.)\n`;
        resultText += `• Наименее затратная категория: ${leastExpensiveCategory.category} (${leastExpensiveCategory.totalAmount.toFixed(2)} руб.)\n`;
        
        bot.editMessageText(resultText, {
          chat_id: id, message_id: msg.message_id,
          reply_markup: {
            inline_keyboard: [[{
              text: '↩️ Назад к аналитике',
              callback_data: 'cancel_analytics'
            }]]
          },
          parse_mode: "HTML"
        });
      }
}
