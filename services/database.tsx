import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

// Debug: afficher le module expo-sqlite et si openDatabase est présent
console.log('expo-sqlite module:', SQLite);
console.log('openDatabase typeof:', typeof (SQLite as any).openDatabase);

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

let db: any = null;

const isSqliteAvailable = () => {
  return !!(SQLite && typeof (SQLite as any).openDatabase === 'function');
};

const getDb = (): any | null => {
  if (!db) {
    if (Platform.OS === 'web') {
      // Explicitly don't support web for native sqlite in this project
      console.warn('SQLite: web platform detected — native sqlite is not available.');
      return null;
    }

    if (!isSqliteAvailable()) {
      console.warn(
        'expo-sqlite is not available (SQLite.openDatabase is undefined).\n' +
        'Make sure `expo-sqlite` is installed and configured: run `npx expo install expo-sqlite`.\n' +
        'If you are running a custom client or bare workflow, rebuild the native app so the module is linked.'
      );
      return null;
    }

    db = (SQLite as any).openDatabase('budgetn.db');
  }
  return db;
};

const runAsync = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    const database = getDb();
    if (!database) {
      return reject(new Error('SQLite database is not available at runtime.'));
    }

    database.transaction((tx: any) => {
      tx.executeSql(
        sql,
        params,
        (_tx: any, result: any) => resolve(result),
        (_tx: any, error: any) => {
          reject(error);
          // retourner vrai pour stopper la transaction
          return true;
        }
      );
    });
  });
};

const getAllAsync = async <T = any>(sql: string, params: any[] = []): Promise<T[]> => {
  const result = await runAsync(sql, params);
  // @ts-ignore _array est une propriété interne de WebSQLResult
  return result.rows._array as T[];
};

const execManyAsync = async (statements: string[]): Promise<void> => {
  for (const stmt of statements) {
    if (stmt.trim().length === 0) continue;
    await runAsync(stmt);
  }
};

// --- Initialisation de la base ---

export const initDatabase = async () => {
  try {
    // Création de la table
    await runAsync(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        category TEXT NOT NULL,
        isRecurring INTEGER DEFAULT 0,
        recurringType TEXT,
        recurringEndDate TEXT
      );
    `);

    // Vérifier les colonnes existantes
    const tableInfo = await getAllAsync<any>('PRAGMA table_info(transactions);');
    const columns = tableInfo.map(col => col.name as string);

    // Si les colonnes n’existent pas encore, on les ajoute
    const alterStatements: string[] = [];
    if (!columns.includes('isRecurring')) {
      alterStatements.push(`ALTER TABLE transactions ADD COLUMN isRecurring INTEGER DEFAULT 0;`);
    }
    if (!columns.includes('recurringType')) {
      alterStatements.push(`ALTER TABLE transactions ADD COLUMN recurringType TEXT;`);
    }
    if (!columns.includes('recurringEndDate')) {
      alterStatements.push(`ALTER TABLE transactions ADD COLUMN recurringEndDate TEXT;`);
    }

    if (alterStatements.length > 0) {
      await execManyAsync(alterStatements);
    }

    console.log('Database initialized');
    return true;
  } catch (error) {
    console.error('Error initializing database:', error);
    // If SQLite is not available at runtime, don't crash the whole app.
    const errAny: any = error;
    const msg = (errAny && (errAny.message || String(errAny))) || '';
    if (
      msg.includes('SQLite database is not available at runtime') ||
      msg.includes('expo-sqlite is not available') ||
      msg.includes('SQLite.openDatabase is undefined')
    ) {
      console.warn('SQLite unavailable — continuing without database.');
      return false;
    }

    throw error;
  }
};

// --- CRUD Operations ---

export const getTransactions = async (): Promise<Transaction[]> => {
  try {
    const rows = await getAllAsync<any>(
      'SELECT * FROM transactions ORDER BY date DESC;'
    );

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      amount: row.amount,
      date: row.date,
      category: row.category,
      isRecurring: row.isRecurring === 1,
      recurringType: row.recurringType,
      recurringEndDate: row.recurringEndDate
    }));
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

    await runAsync(
      `INSERT INTO transactions (
        id, 
        title, 
        amount, 
        date, 
        category,
        isRecurring,
        recurringType,
        recurringEndDate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        transaction.title,
        transaction.amount,
        transaction.date,
        transaction.category,
        transaction.isRecurring ? 1 : 0,
        transaction.recurringType || null,
        transaction.recurringEndDate || null
      ]
    );

    return id;
  } catch (error) {
    console.error('Error adding transaction:', error);
    throw error;
  }
};

export const updateTransaction = async (transaction: Transaction): Promise<void> => {
  try {
    await runAsync(
      `UPDATE transactions 
       SET title = ?, 
           amount = ?, 
           date = ?, 
           category = ?,
           isRecurring = ?,
           recurringType = ?,
           recurringEndDate = ?
       WHERE id = ?;`,
      [
        transaction.title,
        transaction.amount,
        transaction.date,
        transaction.category,
        transaction.isRecurring ? 1 : 0,
        transaction.recurringType || null,
        transaction.recurringEndDate || null,
        transaction.id
      ]
    );
  } catch (error) {
    console.error('Error updating transaction:', error);
    throw error;
  }
};

export const deleteTransaction = async (id: string): Promise<void> => {
  try {
    await runAsync('DELETE FROM transactions WHERE id = ?;', [id]);
  } catch (error) {
    console.error('Error deleting transaction:', error);
    throw error;
  }
};

// Getter pour garder la même API publique si tu l’utilises ailleurs
export const getDatabase = () => getDb();
