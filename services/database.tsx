import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Types
export interface Transaction {
  id: string;
  title: string;
  amount: number;
  date: string;
  category: string;
  isRecurring?: boolean;
  recurringType?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurringEndDate?: string | null;
}

// --- Helpers basés sur l'API "classique" de expo-sqlite ---

const STORAGE_KEY = 'budgetn:transactions';

// Simple JSON-backed storage using AsyncStorage. Keeps the same exported API
// (initDatabase, getTransactions, addTransaction, updateTransaction, deleteTransaction)
// so other parts of the app don't need to change.

const readAll = async (): Promise<Transaction[]> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Transaction[];
  } catch (error) {
    console.error('Error reading transactions from AsyncStorage:', error);
    return [];
  }
};

const writeAll = async (items: Transaction[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.error('Error writing transactions to AsyncStorage:', error);
    throw error;
  }
};



// --- Initialisation de la base ---

export const initDatabase = async () => {
  try {
    // Ensure storage key exists
    const existing = await AsyncStorage.getItem(STORAGE_KEY);
    if (!existing) {
      await writeAll([]);
    }

    console.log('JSON storage initialized');
    return true;
  } catch (error) {
    console.error('Error initializing database:', error);
    const errAny: any = error;
    throw errAny;
  }
};

// --- CRUD Operations ---

export const getTransactions = async (): Promise<Transaction[]> => {
  try {
    const rows = await readAll();
    // sort by date desc (assumes ISO string in `date`)
    rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return rows;
  } catch (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }
};

export const addTransaction = async (
  transaction: Omit<Transaction, 'id'>
): Promise<string> => {
  try {
    const id = Math.random().toString(36).substr(2, 9);
    const items = await readAll();
    const newItem: Transaction = {
      id,
      title: transaction.title,
      amount: transaction.amount,
      date: transaction.date,
      category: transaction.category,
      isRecurring: transaction.isRecurring || false,
      recurringType: transaction.recurringType || undefined,
      recurringEndDate: transaction.recurringEndDate || null,
    };
    items.push(newItem);
    await writeAll(items);
    return id;
  } catch (error) {
    console.error('Error adding transaction:', error);
    throw error;
  }
};

export const updateTransaction = async (transaction: Transaction): Promise<void> => {
  try {
    const items = await readAll();
    const idx = items.findIndex(i => i.id === transaction.id);
    if (idx === -1) throw new Error('Transaction not found');
    items[idx] = { ...items[idx], ...transaction };
    await writeAll(items);
  } catch (error) {
    console.error('Error updating transaction:', error);
    throw error;
  }
};

export const deleteTransaction = async (id: string): Promise<void> => {
  try {
    const items = await readAll();
    const filtered = items.filter(i => i.id !== id);
    await writeAll(filtered);
  } catch (error) {
    console.error('Error deleting transaction:', error);
    throw error;
  }
};

// Getter pour garder la même API publique si tu l’utilises ailleurs
// Backwards-compat helper: return an object with basic methods if someone calls getDatabase().
export const getDatabase = () => ({
  // These helpers are not SQL — they mimic the shape used previously in some places.
  getAllAsync: async (_sql?: string) => {
    return readAll();
  },
  runAsync: async (_sql: string, _params?: any[]) => {
    // No-op / not supported for raw SQL. Encourage using the exported helpers.
    throw new Error('runAsync SQL is not supported for JSON storage. Use exported functions instead.');
  }
});
