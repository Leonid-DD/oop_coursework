export interface SpendingRecord {
  category: string;
  amount: number;
  date: number;
}

export interface UserSpendings {
  menuId: number;
  spendings: SpendingRecord[];
}

export interface SpendingsData {
  [userId: string]: UserSpendings;
}

export interface CategoryStats {
  category: string;
  totalAmount: number;
  count: number;
}