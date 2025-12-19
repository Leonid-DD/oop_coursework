// Данные всех пользователей
export interface SpendingsData {
  [userId: string]: UserSpendings;
}

// Данные одного пользователя
export interface UserSpendings {
  menuId: number;
  spendings: SpendingRecord[];
}

// Данные об одной трате
export interface SpendingRecord {
  category: string;
  amount: number;
  date: number;
}

// Группировка по категориям
export interface CategoryStats {
  category: string;
  totalAmount: number;
  count: number;
}