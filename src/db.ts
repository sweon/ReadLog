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
    let booksImported = 0;
    let logsImported = 0;

    await db.transaction('rw', db.books, db.logs, async () => {
        // 1. Process Books
        const extBooks = data.books as Book[];
        const bookMap = new Map<number, number>(); // External ID -> Local ID

        for (const extBook of extBooks) {
            // Match criteria: Same title and total pages
            const existingBook = await db.books
                .where('title').equals(extBook.title)
                .filter(b => b.totalPages === extBook.totalPages)
                .first();

            let localId: number;
            if (existingBook) {
                localId = existingBook.id!;
                // Update fields to the "most representative" (Union logic)
                const extStart = new Date(extBook.startDate).getTime();
                const extLast = new Date(extBook.lastReadDate).getTime();
                const localStart = new Date(existingBook.startDate).getTime();
                const localLast = new Date(existingBook.lastReadDate).getTime();

                await db.books.update(localId, {
                    // Take the earliest start date
                    startDate: new Date(Math.min(extStart, localStart)),
                    // Take the latest read date
                    lastReadDate: new Date(Math.max(extLast, localLast)),
                    // If either is 'completed', the union is 'completed'
                    status: (extBook.status === 'completed' || existingBook.status === 'completed') ? 'completed' : 'reading'
                });
            } else {
                // New book
                const { id, ...bookData } = extBook;
                localId = await db.books.add({
                    ...bookData,
                    startDate: new Date(bookData.startDate),
                    lastReadDate: new Date(bookData.lastReadDate)
                });
                booksImported++;
            }

            if (extBook.id) {
                bookMap.set(extBook.id, localId);
            }
        }

        // 2. Process Logs
        const extLogs = data.logs as Log[];
        for (const extLog of extLogs) {
            const localBookId = bookMap.get(extLog.bookId);
            if (!localBookId) continue;

            // UNION DEDUPLICATION: Same book, same page, same DAY.
            const extDate = new Date(extLog.date);
            const extDateStr = extDate.toDateString();

            const exists = await db.logs
                .where('bookId').equals(localBookId)
                .filter(l =>
                    l.page === extLog.page &&
                    new Date(l.date).toDateString() === extDateStr
                )
                .first();

            if (!exists) {
                await db.logs.add({
                    bookId: localBookId,
                    date: extDate,
                    page: extLog.page
                });
                logsImported++;
            }
        }
    });

    return { booksImported, logsImported };
};
