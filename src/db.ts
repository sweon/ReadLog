import Dexie, { type Table } from 'dexie';

export interface Book {
    id?: number;
    title: string;
    totalPages: number;
    startDate: Date;
    lastReadDate: Date;
    status: 'reading' | 'completed';
}

export interface Log {
    id?: number;
    bookId: number; // Foreign key to Book
    date: Date;
    page: number;
}

export class ReadLogDatabase extends Dexie {
    books!: Table<Book>;
    logs!: Table<Log>;

    constructor() {
        super('ReadLogDB');
        this.version(1).stores({
            books: '++id, title, lastReadDate, status', // Indexes
            logs: '++id, bookId, date' // Indexes
        });
    }
}

export const db = new ReadLogDatabase();

export const exportDB = async () => {
    const books = await db.books.toArray();
    const logs = await db.logs.toArray();
    return JSON.stringify({ books, logs });
};

export const importDB = async (json: string) => {
    const data = JSON.parse(json);
    await db.transaction('rw', db.books, db.logs, async () => {
        await db.books.clear();
        await db.logs.clear();
        await db.books.bulkAdd(data.books);
        await db.logs.bulkAdd(data.logs.map((log: any) => ({
            ...log,
            date: new Date(log.date)
        })));

        // Data in books also needs date restoration
        const books = await db.books.toArray();
        for (const book of books) {
            await db.books.update(book.id!, {
                startDate: new Date(book.startDate),
                lastReadDate: new Date(book.lastReadDate)
            });
        }
    });
};
