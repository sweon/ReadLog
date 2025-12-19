import Dexie, { type Table } from 'dexie';

export interface Book {
    id?: number;
    title: string;
    totalPages: number;
    startDate: Date;
    lastReadDate: Date;
    status: 'reading' | 'completed';
    currentPage: number; // Added for performance optimization
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
        // We don't strictly need to bump version for non-indexed fields in Dexie,
        // but it's good practice if we wanted to index currentPage.
        // For now, we'll stick to version 1 and backfill via migration.
    }
}

export const db = new ReadLogDatabase();

// Performance Migration: Backfill currentPage for existing books
export const migrateCurrentPage = async () => {
    const books = await db.books.toArray();
    for (const book of books) {
        if (book.currentPage === undefined) {
            const lastLog = await db.logs.where('bookId').equals(book.id!).reverse().sortBy('date').then(logs => logs[0]);
            const currentPage = lastLog ? lastLog.page : 0;
            await db.books.update(book.id!, { currentPage });
        }
    }
};

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
                // Update dates/progress if external is newer
                if (new Date(extBook.lastReadDate) > existingBook.lastReadDate) {
                    await db.books.update(existingBook.id!, {
                        lastReadDate: new Date(extBook.lastReadDate),
                        status: extBook.status,
                        // Update currentPage if external is newer
                        currentPage: extBook.currentPage ?? existingBook.currentPage
                    });
                }
            } else {
                // Add new book
                const { id, ...bookData } = extBook;
                await db.books.add({
                    ...bookData,
                    startDate: new Date(bookData.startDate),
                    lastReadDate: new Date(bookData.lastReadDate),
                    currentPage: bookData.currentPage ?? 0
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
            if (!localBookId) continue;

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

        // Final pass: Re-calculate currentPage for all touched books to be 100% safe
        await migrateCurrentPage();
    });
};
