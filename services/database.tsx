import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import axios from 'axios';
import * as FileSystem from 'expo-file-system';

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

// File system helpers (export/import JSON file)
const JSON_FILENAME = 'budgetn_transactions.json';
const JSON_PATH = ((FileSystem as any).documentDirectory || '') + JSON_FILENAME;

export const exportToJsonFile = async (): Promise<string> => {
  try {
    const items = await readAll();
    await FileSystem.writeAsStringAsync(JSON_PATH, JSON.stringify(items));
    return JSON_PATH;
  } catch (error) {
    console.error('Error exporting JSON file:', error);
    throw error;
  }
};

export const importFromJsonFile = async (uri?: string): Promise<void> => {
  try {
    const path = uri || JSON_PATH;
    const exists = await FileSystem.getInfoAsync(path);
    if (!exists.exists) throw new Error('JSON file not found: ' + path);
    const raw = await FileSystem.readAsStringAsync(path);
    const items = JSON.parse(raw) as Transaction[];
    await writeAll(items || []);
  } catch (error) {
    console.error('Error importing JSON file:', error);
    throw error;
  }
};

// Remote sync helpers using axios. These expect the remote API to expose:
// GET  {apiUrl}/transactions            -> returns Transaction[]
// POST {apiUrl}/transactions/bulk       -> accepts Transaction[] to replace/merge

export const fetchRemoteTransactions = async (apiUrl: string): Promise<Transaction[]> => {
  try {
    const url = apiUrl.replace(/\/$/, '') + '/transactions';
    const res = await axios.get(url);
    const data = res.data as Transaction[];
    if (Array.isArray(data)) {
      await writeAll(data);
      return data;
    }
    throw new Error('Invalid data from remote');
  } catch (error) {
    console.error('Error fetching remote transactions:', error);
    throw error;
  }
};

export const pushLocalTransactions = async (apiUrl: string): Promise<void> => {
  try {
    const url = apiUrl.replace(/\/$/, '') + '/transactions/bulk';
    const items = await readAll();
    await axios.post(url, items);
  } catch (error) {
    console.error('Error pushing local transactions to remote:', error);
    throw error;
  }
};

export const syncWithRemote = async (apiUrl: string): Promise<{ pulled: number; pushed: number }> => {
  let pulled = 0;
  let pushed = 0;
  try {
    // Try to push local first (best-effort)
    try {
      await pushLocalTransactions(apiUrl);
      pushed = 1;
    } catch (pushErr) {
      // ignore push errors — we'll still try to pull
      console.warn('pushLocalTransactions failed:', pushErr);
    }

    // Then pull remote canonical list
    const remote = await fetchRemoteTransactions(apiUrl);
    pulled = Array.isArray(remote) ? remote.length : 0;
    return { pulled, pushed };
  } catch (error) {
    console.error('Error syncing with remote:', error);
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
