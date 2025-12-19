import { Injectable } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { SpendingRecord, UserSpendings, SpendingsData, CategoryStats} from './dto/telegram.dto'

@Injectable()
export class TelegramService {

  private bot: TelegramBot;

  // По пользователю тип меню
  private menuPhases: Map<number,string>;
  private temporarySpendings: Map<number, SpendingRecord[]>;

  private temporaryUserData: {[userId: number]: UserSpendings} = [];
  private readonly dataFilePath: string;
  
  constructor() {
    // Инициализация бота
    const token = config.telegramBotToken;
    this.bot = new TelegramBot(token, {polling: true});

    // Инициализация синхронизации меню
    this.menuPhases = new Map();

    // Инициализация хранения данных
    this.dataFilePath = path.join('./data', 'spendings_data.json');
    this.initializeDataFile();

    this.eventHandler()
  }

  private initializeDataFile(): void {
    if (!fs.existsSync(this.dataFilePath)) {
      const initialData: SpendingsData = {};
      fs.writeFileSync(this.dataFilePath, JSON.stringify(initialData, null, 2), 'utf-8');
      console.log('Data file created:', this.dataFilePath);
    }
  }

  private loadSpendingsData(): SpendingsData {
    try {
      const data = fs.readFileSync(this.dataFilePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading spendings data:', error);
      return {};
    }
  }

  private saveSpendingsData(data: SpendingsData): void {
    try {
      fs.writeFileSync(this.dataFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving spendings data:', error);
      throw error;
    }
  }

  private addSpendingsToStorage(userId: number, newSpendings: SpendingRecord[]): void {
    try {
      const data = this.loadSpendingsData();
      const userIdStr = userId.toString();
      
      if (!data[userIdStr]) {
        data[userIdStr] = { menuId: 0, spendings: [] };
      }
      
      // Преобразуем даты из строк обратно в объекты Date при загрузке
      const existingSpendings = data[userIdStr].spendings.map(spending => ({
        ...spending,
        date: spending.date
      }));
      
      // Добавляем новые траты
      const allSpendings = [...existingSpendings, ...newSpendings];
      
      // Сохраняем обратно с преобразованием дат в строки
      data[userIdStr].spendings = allSpendings.map(spending => ({
        ...spending,
        date: spending.date
      }));
      
      this.saveSpendingsData(data);
      console.log(`Added ${newSpendings.length} spendings for user ${userId}`);
      
    } catch (error) {
      console.error('Error adding spendings to storage:', error);
      throw error;
    }
  }

  private getUserSpendings(userId: number): SpendingRecord[] {
    try {
      const data = this.loadSpendingsData();
      const userIdStr = userId.toString();
      
      if (!data[userIdStr] || !data[userIdStr].spendings) {
        return [];
      }
      
      // Преобразуем даты из строк обратно в объекты Date
      return data[userIdStr].spendings.map(spending => ({
        ...spending,
        date: spending.date
      }));
    } catch (error) {
      console.error('Error getting user spendings:', error);
      return [];
    }
  }

  private eventHandler(): void {
    this.bot.on('message', (msg) => {
      try {
        const id = msg.chat.id;
        const text = msg.text;
        if (!text) {
          throw new Error("text is null");
        }

        const menuPhase = this.menuPhases.get(id) || '';

        switch (text) {
          case "/start":
            this.startCom(id);
            break;
          default:
            if (menuPhase == "spendings") {
              console.log("spending detected");
              this.processSpending(id, msg, text);
            }
            else {
              this.deleteUserMessage(id, msg);
            }
            break;
        }
      }
      catch (error) {
        console.log('error ', error);
      }
    });

    this.bot.on('callback_query', (query) => {
      try {
        const msg = query.message;
        if (!msg) {
          throw new Error("msg is null");
        }
        const id = msg.chat.id;
        const button = query.data;
        
        console.log(button)

        switch(button) {
          case 'spendings':
            this.transferToSpendingsSection(id, msg);
            break;
          case 'analytics':
            this.transferToAnalyticsSection(id, msg);
            break;
          case 'returnToMenu':
            this.returnToMenu(id, msg);
            break;
          case 'cancel_spendings':
            this.transferToSpendingsSection(id, msg);
            break;
          case 'confirm':
            this.confirmSpendings(id, msg);
            break;
          case 'spendingsLastMonth':
            this.showLastMonthSpendings(id, msg);
            break;
          case 'spendingsByCategory':
            this.showSpendingsByCategory(id, msg);
            break;
          case 'cancel_analytics':
            this.transferToAnalyticsSection(id, msg);
            break;
          default:
            break;
        }

        this.bot.answerCallbackQuery(query.id);
      }
      catch (error) {
        console.log('error ', error)
      }
    });
  }

  private async startCom(userId: number): Promise<void> {
    this.menuPhases.set(userId, 'menu');
    if (!this.temporaryUserData[userId]) {
      this.temporaryUserData[userId] = {menuId: 0, spendings: []}
    }
    const sentMessage = await this.bot.sendMessage(userId,'========== Меню ==========', {
      reply_markup: {
        inline_keyboard: [[{
          text: '➕ Добавить траты',
          callback_data: 'spendings'
        }],
        [{
          text: '📊 Анализ трат',
          callback_data: 'analytics'
        }]]
      }
    })
    this.temporaryUserData[userId].menuId = sentMessage.message_id;
  }

  private transferToSpendingsSection(userId: number, msg: TelegramBot.Message): void {
    this.menuPhases.set(userId, 'spendings');
    
    this.temporaryUserData[userId].spendings = [];

    this.bot.editMessageText("Введите траты в формате 'Категория Сумма'\n\nДобавленные траты:\n(пока нет трат)",
      {chat_id: userId, message_id: msg.message_id,
        reply_markup: {
          inline_keyboard: [[{
            text: '↩️ Вернуться в меню',
            callback_data: 'returnToMenu'
        }]]
    }})
  }

  private transferToAnalyticsSection(id: number, msg: TelegramBot.Message): void {
    this.menuPhases.set(id, 'analytics');

    const userSpendings = this.getUserSpendings(id);
    const totalSavedSpendings = userSpendings.length;
    const totalAmount = userSpendings.reduce((sum, record) => sum + record.amount, 0);
    
    let analyticsText = "📊 *Аналитика трат*\n\n";
    analyticsText += `Всего сохранено трат: ${totalSavedSpendings}\n`;
    analyticsText += `Общая сумма: ${totalAmount.toFixed(2)} руб.\n\n`;
    analyticsText += "Выберите вариант для аналитики:";

    this.bot.editMessageText(analyticsText,
      {chat_id: id, message_id: msg.message_id,
        reply_markup: {
          inline_keyboard: [[{
            text: '📅 Траты за последний месяц',
            callback_data: 'spendingsLastMonth'}],
          [{
            text: '🗂️ Траты по всем категориям',
            callback_data: 'spendingsByCategory'
          }],
          // [{
          //   text: '🔎 Посмотреть траты по выбранной категории',
          //   callback_data: 'spendingsByCategory'
          // }],
          [{
            text: '↩️ Вернуться в меню',
            callback_data: 'returnToMenu'
        }]]
    }})
  }

  private returnToMenu(id: number, msg: TelegramBot.Message): void {
    this.menuPhases.set(id, 'menu');
    // TODO: А надо ли?
    // this.temporarySpendings.delete(id);

    this.bot.editMessageText("========== Меню ==========",
      {chat_id: id, message_id:msg.message_id,
        reply_markup: {
        inline_keyboard: [[{
          text: '➕ Добавить траты',
          callback_data: 'spendings'
        }],
        [{
          text: '📊 Анализ трат',
          callback_data: 'analytics'
        }]]
      }})
  }

  private deleteUserMessage(id: number, msg: TelegramBot.Message): void {
    this.bot.deleteMessage(id, msg.message_id).catch(error => {
      console.error('Error deleting message: ', error)
    });
  }

    private processSpending(id: number, msg: TelegramBot.Message, text: string): void {
    // Проверяем формат ввода
    const spendingPattern = /^(\S+)\s+(\d+(?:\.\d{1,2})?)$/;
    const match = text.match(spendingPattern);
    
    const menuMessageId = this.temporaryUserData[id].menuId
    if (!menuMessageId) {
      console.error('Menu message ID not found for user', id);
      this.deleteUserMessage(id, msg);
      return;
    }

    if (match) {
      const [, category, amount] = match;
      
      // Создаем запись о трате с датой
      const spendingRecord: SpendingRecord = {
        category: category,
        amount: parseFloat(amount),
        date:  new Date().getTime() // Сохраняем текущую дату и время
      };
      
      // Добавляем трату во временное хранилище для данного пользователя
      // if (!this.temporarySpendings.has(id)) {
      //   this.temporaryUserData[id].spendings = [];
      // }
      const userSpendings = this.temporaryUserData[id].spendings;
      userSpendings.push(spendingRecord);
      
      // Формируем текст с тратами
      const spendingsText = this.formatSpendingsText(userSpendings);
      const menuText = `Введите траты в формате 'Категория Сумма'\n\n📋 Добавленные траты:\n${spendingsText}`;
      
      // Определяем кнопки в зависимости от количества трат
      const buttons: { text: string; callback_data: string; }[][] = [];
      if (userSpendings.length > 0) {
        buttons.push([
          { text: '❌ Отмена', callback_data: 'cancel_spendings' },
          { text: '✅ Подтвердить', callback_data: 'confirm' }
        ],[
          { text: '↩️ Вернуться в меню', callback_data: 'returnToMenu' }
        ]);
      } else {
        buttons.push([
          { text: '↩️ Вернуться в меню', callback_data: 'returnToMenu' }
        ]);
      }
      
      this.bot.editMessageText(menuText, {
        chat_id: id, message_id: menuMessageId,
        reply_markup: {
          inline_keyboard: buttons
        }
      }).then(() => {
        this.deleteUserMessage(id, msg);
      }).catch(error => {
        console.error('Error updating menu: ', error)
      })
      
    } else {
      // Если формат неправильный, удаляем ввод
      const userSpendings = this.temporaryUserData[id].spendings;
      
      // Формируем текст с тратами
      let spendingsText = ''
      if (userSpendings) {
        spendingsText = this.formatSpendingsText(userSpendings);
      }
      const menuText = `Введите траты в формате 'Категория Сумма'\n\n📋 Добавленные траты:\n${spendingsText}\n\n❌ Ошибка при добавлении! Введите трату в указаном формате`;
      
      // Определяем кнопки в зависимости от количества трат
      const buttons: { text: string; callback_data: string; }[][] = [];
      if (userSpendings.length > 0) {
        buttons.push([
          { text: '❌ Отмена', callback_data: 'cancel_spendings' },
          { text: '✅ Подтвердить', callback_data: 'confirm' }
        ],[
          { text: '↩️ Вернуться в меню', callback_data: 'returnToMenu' }
        ]);
      } else {
        buttons.push([
          { text: '↩️ Вернуться в меню', callback_data: 'returnToMenu' }
        ]);
      }

      this.bot.editMessageText(menuText, {
        chat_id: id, message_id: menuMessageId,
        reply_markup: {
          inline_keyboard: buttons
        }
      }).then(() => {
        this.deleteUserMessage(id, msg);
      }).catch(error => {
        console.error('Error updating menu: ', error)
      })
    }
  }

  private formatSpendingsText(spendings: SpendingRecord[]): string {
    if (spendings.length === 0) {
      return "(пока нет трат)";
    }
    
    return spendings.map((record, index) => {
      const date = this.formatDate(record.date);
      return `${index + 1}. ${record.category}: ${record.amount} руб. (${date})`;
    }).join('\n');
  }

  private formatDate(date: number): string {
    return new Date(date).toLocaleDateString('ru-RU');
  }

  private confirmSpendings(id: number, msg: TelegramBot.Message): void {
    const userSpendings = this.temporaryUserData[id].spendings;
    
    if (!userSpendings || userSpendings.length === 0) {
      this.bot.sendMessage(id, "❌ Нет трат для подтверждения");
      return;
    }
       
    const menuMessageId = this.temporaryUserData[id].menuId

    if (!menuMessageId) {
      console.error('Menu message ID not found for user', id);
      this.deleteUserMessage(id, msg);
      return;
    }

    try {
      this.addSpendingsToStorage(id, userSpendings);

      const totalAmount = userSpendings.reduce((sum, record) => sum + record.amount, 0);
      const spendingsText = this.formatSpendingsText(userSpendings);

      const allUserSpendings = this.getUserSpendings(id);
      const totalSaved = allUserSpendings.length;
      const totalSavedAmount = allUserSpendings.reduce((sum, record) => sum + record.amount, 0);

      const successText = `✅ *Траты успешно сохранены*\n\n` +
        `*Текущие траты:*\n` +
        `Добавлено: ${userSpendings.length} трат\n` +
        `Сумма: ${totalAmount.toFixed(2)} руб\.\n\n` +
        `*Общая статистика:*\n` +
        `Всего сохранено трат: ${totalSaved}\n` +
        `Общая сумма: ${totalSavedAmount.toFixed(2)} руб\.\n\n` +
        `📁 Данные сохранены в файл`;

      this.bot.editMessageText(successText, {
        chat_id: id, message_id: menuMessageId,
        reply_markup: {
          inline_keyboard: [[{
            text: '↩️ Вернуться в меню',
            callback_data: 'returnToMenu'
          }]]
        }
      })

      // Очищаем временные траты после подтверждения
      delete this.temporaryUserData[id];

    } catch (error) {
      console.error('Error confirming spendings:', error);
      
      this.bot.editMessageText("❌ *Ошибка при сохранении трат*\n\nПожалуйста, попробуйте позже\.", {
        chat_id: id, message_id: menuMessageId,
        reply_markup: {
          inline_keyboard: [[{
            text: '↩️ Вернуться в меню',
            callback_data: 'returnToMenu'
          }]]
        }
      });
    }
  }

  private showLastMonthSpendings(id: number, msg: TelegramBot.Message): void {
    const userSpendings = this.getUserSpendings(id);
    
    if (userSpendings.length === 0) {
      this.bot.editMessageText("📭 *Нет сохраненных трат*\n\nУ вас пока нет ни одной сохраненной траты.", {
        chat_id: id, message_id: msg.message_id,
        reply_markup: {
          inline_keyboard: [[{
            text: '↩️ Назад к аналитике',
            callback_data: 'cancel_analytics'
          }]]
        }
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
      
      this.bot.editMessageText(`📭 *Нет трат за текущий месяц*\n\nЗа ${monthNames[currentMonth]} ${currentYear} трат не обнаружено.`, {
        chat_id: id, message_id: msg.message_id,
        reply_markup: {
          inline_keyboard: [[{
            text: '↩️ Назад к аналитике',
            callback_data: 'cancel_analytics'
          }]]
        }
      });
      return;
    }
    
    const totalAmount = lastMonthSpendings.reduce((sum, record) => sum + record.amount, 0);
    
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                       'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    
    let resultText = `📅 *Траты за ${monthNames[currentMonth]} ${currentYear}*\n\n`;
    resultText += `Всего трат: ${lastMonthSpendings.length}\n`;
    resultText += `Общая сумма: ${totalAmount.toFixed(2)} руб.\n\n`;
    
    // Сортируем по дате (новые сначала)
    const sortedSpendings = [...lastMonthSpendings].sort((a, b) => 
      b.date - a.date
    );
    
    // Группируем по дням
    const spendingsByDay: { [key: string]: SpendingRecord[] } = {};
    sortedSpendings.forEach(spending => {
      const dateKey = this.formatDate(spending.date);
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
      
      resultText += `📆 *${date}* (${daySpendings.length} трат, ${dayTotal.toFixed(2)} руб.)\n`;
      
      daySpendings.forEach((spending, index) => {
        const time = new Date(spending.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        resultText += `  ${index + 1}. ${spending.category}: ${spending.amount.toFixed(2)} руб. (${time})\n`;
      });
      resultText += '\n';
    });
    
    this.bot.editMessageText(resultText, {
      chat_id: id, message_id: msg.message_id,
      reply_markup: {
        inline_keyboard: [[{
          text: '↩️ Назад к аналитике',
          callback_data: 'cancel_analytics'
        }]]
      }
    });
  }

  private showSpendingsByCategory(id: number, msg: TelegramBot.Message): void {
    const userSpendings = this.getUserSpendings(id);
    
    if (userSpendings.length === 0) {
      this.bot.editMessageText("📭 *Нет сохраненных трат*\n\nУ вас пока нет ни одной сохраненной траты.", {
        chat_id: id, message_id: msg.message_id,
        reply_markup: {
          inline_keyboard: [[{
            text: '↩️ Назад к аналитике',
            callback_data: 'cancel_analytics'
          }]]
        }
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
    
    let resultText = `🗂️ *Траты по категориям (все время)*\n\n`;
    resultText += `Всего трат: ${totalCount}\n`;
    resultText += `Общая сумма: ${totalAmount.toFixed(2)} руб.\n\n`;
    
    // Выводим категории с суммами
    sortedCategories.forEach((stat, index) => {
      const percentage = ((stat.totalAmount / totalAmount) * 100).toFixed(1);
      const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      
      resultText += `${rankEmoji} *${stat.category}*\n`;
      resultText += `   Количество трат: ${stat.count}\n`;
      resultText += `   Общая сумма: ${stat.totalAmount.toFixed(2)} руб.\n`;
      resultText += `   Доля от общих трат: ${percentage}%\n\n`;
    });
    
    // Добавляем итоговую статистику
    const averagePerCategory = totalAmount / sortedCategories.length;
    const mostExpensiveCategory = sortedCategories[0];
    const leastExpensiveCategory = sortedCategories[sortedCategories.length - 1];
    
    resultText += `📊 *Статистика:*\n`;
    resultText += `• Всего категорий: ${sortedCategories.length}\n`;
    resultText += `• Средняя сумма на категорию: ${averagePerCategory.toFixed(2)} руб.\n`;
    resultText += `• Самая затратная категория: ${mostExpensiveCategory.category} (${mostExpensiveCategory.totalAmount.toFixed(2)} руб.)\n`;
    resultText += `• Наименее затратная категория: ${leastExpensiveCategory.category} (${leastExpensiveCategory.totalAmount.toFixed(2)} руб.)\n`;
    
    this.bot.editMessageText(resultText, {
      chat_id: id, message_id: msg.message_id,
      reply_markup: {
        inline_keyboard: [[{
          text: '↩️ Назад к аналитике',
          callback_data: 'cancel_analytics'
        }]]
      }
    });
  }
}