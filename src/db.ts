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
        // MERGE BOOKS
        for (const extBook of data.books as Book[]) {
            // Check if book exists by title and pages
            const existingBook = await db.books
                .where('title').equals(extBook.title)
                .filter(b => b.totalPages === extBook.totalPages)
                .first();

            if (existingBook) {
                // Update dates if external is newer (simple heuristic)
                if (new Date(extBook.lastReadDate) > existingBook.lastReadDate) {
                    await db.books.update(existingBook.id!, {
                        lastReadDate: new Date(extBook.lastReadDate),
                        status: extBook.status
                    });
                }
            } else {
                // Add new book
                const { id, ...bookData } = extBook;
                await db.books.add({
                    ...bookData,
                    startDate: new Date(bookData.startDate),
                    lastReadDate: new Date(bookData.lastReadDate)
                });
            }
        }

        // MERGE LOGS
        // We need to map external book IDs to local book IDs to insert logs correctly
        const allBooks = await db.books.toArray();
        const bookMap = new Map<number, number>(); // External ID -> Local ID

        // Build a map based on title/pages matching
        for (const extBook of data.books as Book[]) {
            const localBook = allBooks.find(b => b.title === extBook.title && b.totalPages === extBook.totalPages);
            if (localBook && extBook.id) {
                bookMap.set(extBook.id, localBook.id!);
            }
        }

        for (const extLog of data.logs as Log[]) {
            const localBookId = bookMap.get(extLog.bookId);
            if (!localBookId) continue; // Skip logs for books we couldn't match (shouldn't happen if book merge worked)

            // Check if log exists
            const exists = await db.logs
                .where({ bookId: localBookId })
                .filter(l =>
                    l.page === extLog.page &&
                    l.date.getTime() === new Date(extLog.date).getTime()
                )
                .first();

            if (!exists) {
                await db.logs.add({
                    bookId: localBookId,
                    date: new Date(extLog.date),
                    page: extLog.page
                });
            }
        }
    });
};
