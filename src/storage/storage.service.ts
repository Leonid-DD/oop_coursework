import { Injectable } from '@nestjs/common';
import { UserSpendings, SpendingsData, SpendingRecord } from 'src/telegram/dto/telegram.dto';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class StorageService {
  dataFilePath = path.join('./data', 'spendings_data.json');

  initializeDataFile(): void {
    if (!fs.existsSync(this.dataFilePath)) {
      const initialData: SpendingsData = {};
      fs.writeFileSync(this.dataFilePath, JSON.stringify(initialData, null, 2), 'utf-8');
      console.log('Data file created:', this.dataFilePath);
    }
  }

  loadSpendingsData(): SpendingsData {
    try {
      const data = fs.readFileSync(this.dataFilePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading spendings data:', error);
      return {};
    }
  }

  saveSpendingsData(data: SpendingsData): void {
    try {
      fs.writeFileSync(this.dataFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving spendings data:', error);
      throw error;
    }
  }

  saveUserData(userId: number, userInfo: UserSpendings): void {
    try {
      const data = this.loadSpendingsData();
      const oldUserInfo = data[userId]
      const newSpendings = userInfo.spendings.length
      if (oldUserInfo) {
        userInfo.spendings = [...oldUserInfo.spendings, ...userInfo.spendings]
      } else {
        userInfo.spendings = [...userInfo.spendings]
      }
      data[userId] = userInfo
      this.saveSpendingsData(data);
      console.log(`Added ${newSpendings} spendings for user ${userId}`);
      
    } catch (error) {
      console.error('Error adding spendings to storage:', error);
      throw error;
    }
  }

  createUser(): UserSpendings {
    return {menuId: 0, spendings: []}
  }

  getUser(userId: number): UserSpendings {
        try {
          const data = this.loadSpendingsData();
          const userIdStr = userId.toString();
          
          if (!data[userIdStr] || !data[userIdStr].spendings) {
            return this.createUser();
          }
          
          return data[userIdStr]
        } catch (error) {
          console.error('Error getting user spendings:', error);
          return this.createUser();
        }
    }

  getUserSpendings(userId: number): SpendingRecord[] {
        try {
          const data = this.loadSpendingsData();
          const userIdStr = userId.toString();
          
          if (!data[userIdStr] || !data[userIdStr].spendings) {
            return [];
          }
          
          return data[userIdStr].spendings.map(spending => ({
            ...spending,
            date: spending.date
          }));
        } catch (error) {
          console.error('Error getting user spendings:', error);
          return [];
        }
    }
}
