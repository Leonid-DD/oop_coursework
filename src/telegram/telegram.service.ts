import { Injectable } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { SpendingRecord, UserSpendings, SpendingsData, CategoryStats} from './dto/telegram.dto'
import { StorageService } from 'src/storage/storage.service';
import { AnalyticsService } from 'src/analytics/analytics.service';
import { HelperService } from 'src/helper/helper.service';

@Injectable()
export class TelegramService {

  private bot: TelegramBot;

  // По пользователю тип меню
  private menuPhases: Map<number,string>;

  private temporaryUserData: {[userId: number]: UserSpendings} = [];
  
  constructor(private readonly storageService: StorageService,
              private readonly analyticsService: AnalyticsService,
              private readonly helper: HelperService) {
    // Инициализация бота
    const token = config.telegramBotToken;
    this.bot = new TelegramBot(token, {polling: true});

    // Инициализация синхронизации меню
    this.menuPhases = new Map();

    // Инициализация хранения данных
    this.storageService.initializeDataFile();

    this.eventHandler()
  }

  private eventHandler(): void {
    this.bot.on('message', (msg) => {
      try {
        const userId = msg.chat.id;
        if (!this.temporaryUserData[userId]) {
          this.temporaryUserData[userId] = this.storageService.getUser(userId);
        }
        
        const text = msg.text;
        if (!text) {
          throw new Error("text is null");
        }

        const menuPhase = this.menuPhases.get(userId) || '';

        switch (text) {
          case "/start":
            this.start(userId);
            break;
          default:
            if (menuPhase == "spendings") {
              console.log("spending detected");
              this.processSpending(userId, msg, text);
            }
            else {
              this.toMenu(userId, this.temporaryUserData[userId].menuId, "❌ Ошибка: Бот не ожидает сообщения");
              this.helper.deleteUserMessage(this.bot, userId, msg);
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
        const userId = msg.chat.id;
        
        if (!this.temporaryUserData[userId]) {
          this.temporaryUserData[userId] = this.storageService.getUser(userId);
        }
        const button = query.data;
        
        console.log(button)

        switch(button) {
          case 'spendings':
            this.toSpendingsSection(userId, msg);
            break;
          case 'analytics':
            this.toAnalyticsSection(userId, msg);
            break;
          case 'returnToMenu':
            this.toMenu(userId, msg.message_id);
            break;
          case 'cancel_spendings':
            this.toSpendingsSection(userId, msg);
            break;
          case 'confirm':
            this.confirmSpendings(userId, msg);
            break;
          case 'spendingsLastMonth':
            this.analyticsService.showLastMonthSpendings(this.bot, userId, msg);
            break;
          case 'spendingsByCategory':
            this.analyticsService.showSpendingsByCategory(this.bot, userId, msg);
            break;
          case 'cancel_analytics':
            this.toAnalyticsSection(userId, msg);
            break;
          default:
            console.log('Ошибка. Не найден обработчик кнопки', button)
            break;
        }

        this.bot.answerCallbackQuery(query.id);
      }
      catch (error) {
        console.log('error ', error)
      }
    });
  }

  private async start(userId: number): Promise<void> {
    this.menuPhases.set(userId, 'menu');
    if (!this.temporaryUserData[userId]) {
      this.temporaryUserData[userId] = this.storageService.createUser();
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
    this.storageService.saveUserData(userId, this.temporaryUserData[userId]);
  }

  private toMenu(userId: number, msgId: number, errorText?: string): void {
    this.menuPhases.set(userId, 'menu');

    this.bot.editMessageText(`========== Меню ==========\n${errorText??""}`,
      {chat_id: userId, message_id:msgId,
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

  private toSpendingsSection(userId: number, msg: TelegramBot.Message): void {
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

  private toAnalyticsSection(userId: number, msg: TelegramBot.Message): void {
    this.menuPhases.set(userId, 'analytics');

    const userSpendings = this.storageService.getUserSpendings(userId);
    const totalSavedSpendings = userSpendings.length;
    const totalAmount = userSpendings.reduce((sum, record) => sum + record.amount, 0);
    
    let analyticsText = "📊 <b>Аналитика трат</b>\n\n";
    analyticsText += `Всего сохранено трат: ${totalSavedSpendings}\n`;
    analyticsText += `Общая сумма: ${totalAmount.toFixed(2)} руб.\n\n`;
    analyticsText += "Выберите вариант для аналитики:";

    this.bot.editMessageText(analyticsText,
      {chat_id: userId, message_id: msg.message_id,
        reply_markup: {
          inline_keyboard: [[{
            text: '📅 Траты за последний месяц',
            callback_data: 'spendingsLastMonth'}],
          [{
            text: '🗂️ Траты по всем категориям',
            callback_data: 'spendingsByCategory'
          }],
          [{
            text: '↩️ Вернуться в меню',
            callback_data: 'returnToMenu'
        }]]
    },
    parse_mode: "HTML"
  })
  }

    private processSpending(userId: number, msg: TelegramBot.Message, text: string): void {
    // Проверяем формат ввода
    const spendingPattern = /^(\S+)\s+(\d+(?:\.\d{1,2})?)$/;
    const match = text.match(spendingPattern);
    
    const menuMessageId = this.temporaryUserData[userId].menuId
    if (!menuMessageId) {
      console.error('Menu message ID not found for user', userId);
      this.helper.deleteUserMessage(this.bot, userId, msg);
      return;
    }

    const generateButtons = (spendingLength: number) => {
      let buttons: { text: string; callback_data: string; }[][] = []
      if (spendingLength > 0) {
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
      return buttons
    }

    if (match) {
      const [, category, amount] = match;
      
      // Создаем запись о трате с датой
      const spendingRecord: SpendingRecord = {
        category: category,
        amount: parseFloat(amount),
        date:  new Date().getTime() // Сохраняем текущую дату и время
      };
      
      const userSpendings = this.temporaryUserData[userId].spendings;
      userSpendings.push(spendingRecord);
      
      // Формируем текст с тратами
      const spendingsText = this.helper.formatSpendingsText(userSpendings);
      const menuText = `Введите траты в формате 'Категория Сумма'\n\n📋 Добавленные траты:\n${spendingsText}`;
      
      // Определяем кнопки в зависимости от количества трат
      const buttons: { text: string; callback_data: string; }[][] = generateButtons(userSpendings.length);
      
      
      this.bot.editMessageText(menuText, {
        chat_id: userId, message_id: menuMessageId,
        reply_markup: {
          inline_keyboard: buttons
        }
      }).then(() => {
        this.helper.deleteUserMessage(this.bot, userId, msg);
      }).catch(error => {
        console.error('Error updating menu: ', error)
      })
      
    } else {
      // Если формат неправильный, удаляем ввод
      const userSpendings = this.temporaryUserData[userId].spendings;
      
      // Формируем текст с тратами
      let spendingsText = userSpendings ? this.helper.formatSpendingsText(userSpendings) : '';
        const menuText = `Введите траты в формате 'Категория Сумма'\n\n📋 Добавленные траты:\n${spendingsText}\n\n❌ Ошибка при добавлении! Введите трату в указаном формате`;
      
      // Определяем кнопки в зависимости от количества трат
      const buttons: { text: string; callback_data: string; }[][] = generateButtons(userSpendings.length);

      this.bot.editMessageText(menuText, {
        chat_id: userId, message_id: menuMessageId,
        reply_markup: {
          inline_keyboard: buttons
        }
      }).then(() => {
        this.helper.deleteUserMessage(this.bot, userId, msg);
      }).catch(error => {
        console.error('Error updating menu: ', error)
      })
    }
  }

  private confirmSpendings(userId: number, msg: TelegramBot.Message): void {
    const userSpendings = this.temporaryUserData[userId].spendings;
    
    if (!userSpendings || userSpendings.length === 0) {
      this.bot.sendMessage(userId, "❌ Нет трат для подтверждения");
      return;
    }
       
    const menuMessageId = this.temporaryUserData[userId].menuId

    if (!menuMessageId) {
      console.error('Menu message ID not found for user', userId);
      this.helper.deleteUserMessage(this.bot, userId, msg);
      return;
    }

    try {
      this.storageService.saveUserData(userId, this.temporaryUserData[userId]);

      const totalAmount = userSpendings.reduce((sum, record) => sum + record.amount, 0);

      const allUserSpendings = this.storageService.getUserSpendings(userId);
      const totalSaved = allUserSpendings.length;
      const totalSavedAmount = allUserSpendings.reduce((sum, record) => sum + record.amount, 0);

      const successText = `✅ <b>Траты успешно сохранены</b>\n\n` +
        `<b>Текущие траты:</b>\n` +
        `Добавлено: ${userSpendings.length} трат\n` +
        `Сумма: ${totalAmount.toFixed(2)} руб\.\n\n` +
        `<b>Общая статистика:</b>\n` +
        `Всего сохранено трат: ${totalSaved}\n` +
        `Общая сумма: ${totalSavedAmount.toFixed(2)} руб\.\n\n` +
        `📁 Данные сохранены в файл`;

      this.bot.editMessageText(successText, {
        chat_id: userId, message_id: menuMessageId,
        reply_markup: {
          inline_keyboard: [[{
            text: '↩️ Вернуться в меню',
            callback_data: 'returnToMenu'
          }]]
        },
        parse_mode: "HTML"
      })

      // Очищаем временные траты после подтверждения
      delete this.temporaryUserData[userId];

    } catch (error) {
      console.error('Error confirming spendings:', error);
      
      this.bot.editMessageText("❌ <b>Ошибка при сохранении трат</b>\n\nПожалуйста, попробуйте позже\.", {
        chat_id: userId, message_id: menuMessageId,
        reply_markup: {
          inline_keyboard: [[{
            text: '↩️ Вернуться в меню',
            callback_data: 'returnToMenu'
          }]]
        },
        parse_mode: "HTML"
      });
    }
  }
}