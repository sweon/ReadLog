import React, { useState } from 'react';
import { db, type Book, type Log } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';

export const DataManagement: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [view, setView] = useState<'main' | 'export' | 'import'>('main');
    const [selectedBooks, setSelectedBooks] = useState<number[]>([]);

    const books = useLiveQuery(() => db.books.toArray());
    const totalLogs = useLiveQuery(() => db.logs.count());

    const handleExport = async () => {
        if (!books) return;

        const booksToExport = selectedBooks.length > 0
            ? books.filter(b => selectedBooks.includes(b.id!))
            : books;

        const logsToExport = await db.logs
            .where('bookId')
            .anyOf(booksToExport.map(b => b.id!))
            .toArray();

        const data = {
            version: 1,
            timestamp: new Date().toISOString(),
            books: booksToExport,
            logs: logsToExport
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        // Choose filename
        const filename = prompt('Enter filename for export:', `readlog-backup-${format(new Date(), 'yyyy-MM-dd')}`);
        if (filename) {
            link.href = url;
            link.download = filename.endsWith('.json') ? filename : `${filename}.json`;
            link.click();
        }

        URL.revokeObjectURL(url);
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);
                if (!data.books || !data.logs) throw new Error('Invalid format');

                await db.transaction('rw', db.books, db.logs, async () => {
                    let booksImported = 0;
                    let logsImported = 0;

                    for (const extBook of data.books as Book[]) {
                        // Try to find existing book by Title and TotalPages
                        let localBook = await db.books
                            .where('title')
                            .equals(extBook.title)
                            .filter(b => b.totalPages === extBook.totalPages)
                            .first();

                        let localBookId = localBook?.id;

                        if (!localBook) {
                            // Create new book
                            const { id, ...bookData } = extBook; // Remove ID to auto-increment
                            localBookId = await db.books.add({
                                ...bookData,
                                startDate: new Date(bookData.startDate), // Restore Date object
                                lastReadDate: new Date(bookData.lastReadDate)
                            }) as number;
                            booksImported++;
                        }

                        // Import Logs
                        const extLogs = (data.logs as Log[]).filter(l => l.bookId === extBook.id);
                        for (const extLog of extLogs) {
                            const { id, bookId, ...logData } = extLog;

                            // Check if log exists (same date and page)
                            const exists = await db.logs
                                .where({ bookId: localBookId })
                                .filter(l => l.page === logData.page && l.date.getTime() === new Date(logData.date).getTime())
                                .first(); // Use simple check, ideally date matching should be fuzzy or exact? strict for now.

                            if (!exists) {
                                await db.logs.add({
                                    bookId: localBookId!,
                                    date: new Date(logData.date),
                                    page: logData.page
                                });
                                logsImported++;
                            }
                        }
                    }
                    alert(`Import successful!\nNew Books: ${booksImported}\nNew Logs: ${logsImported}`);
                });
                setIsOpen(false);
            } catch (err) {
                console.error(err);
                alert('Failed to import file. Make sure it is a valid ReadLog backup.');
            }
        };
        reader.readAsText(file);
    };



    // ... (existing import)
    // ...

    // UI rendering
    if (!isOpen) {
        return (
            <button className="settings-btn" onClick={() => setIsOpen(true)} data-tooltip="Data Management">
                ⚙️
            </button>
        );
    }

    return (
        <div className="modal-overlay">

            <div className="modal-content data-modal">
                <div className="modal-header">
                    <h3>Data Management</h3>
                    <button className="close-btn" onClick={() => setIsOpen(false)}>×</button>
                </div>

                <div className="modal-body">


                    <div className="tab-content-container">
                        {view === 'main' && (
                            <div className="tab-content overview-tab">
                                <div className="overview-stats">
                                    <div className="stat-box">
                                        <span className="count">{books?.length || 0}</span>
                                        <span className="label">Total Books</span>
                                    </div>
                                    <div className="stat-box">
                                        <span className="count">{totalLogs || 0}</span>
                                        <span className="label">Total Sessions</span>
                                    </div>
                                </div>
                                <div className="action-cards">
                                    <div className="action-card" onClick={() => setView('export')}>
                                        <div className="icon">📤</div>
                                        <h4>Backup Data</h4>
                                    </div>
                                    <div className="action-card" onClick={() => setView('import')}>
                                        <div className="icon">📥</div>
                                        <h4>Restore Data</h4>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ... export/import tabs ... */}
                        {view === 'export' && (
                            <div className="tab-content export-tab">
                                <div className="section-header">
                                    <button className="back-btn" onClick={() => setView('main')}>← Back</button>
                                    <h4>Select Books</h4>
                                    <button className="text-btn" onClick={() => setSelectedBooks([])}>Clear All</button>
                                </div>
                                <div className="book-checklist">
                                    <label className="checkbox-row all-books">
                                        <input
                                            type="checkbox"
                                            checked={selectedBooks.length === 0}
                                            onChange={() => setSelectedBooks([])}
                                        />
                                        <span className="custom-checkbox"></span>
                                        <span className="label-text">All Books ({books?.length})</span>
                                    </label>
                                    <div className="divider"></div>
                                    {books?.map(book => (
                                        <label key={book.id} className="checkbox-row">
                                            <input
                                                type="checkbox"
                                                checked={selectedBooks.includes(book.id!)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedBooks([...selectedBooks, book.id!]);
                                                    } else {
                                                        setSelectedBooks(selectedBooks.filter(id => id !== book.id));
                                                    }
                                                }}
                                            />
                                            <span className="custom-checkbox"></span>
                                            <span className="label-text">{book.title}</span>
                                        </label>
                                    ))}
                                </div>
                                <button className="primary-btn full-width" onClick={handleExport}>
                                    Download JSON Backup
                                </button>
                            </div>
                        )}

                        {view === 'import' && (
                            <div className="tab-content import-tab">
                                <div className="section-header">
                                    <button className="back-btn" onClick={() => setView('main')}>← Back</button>
                                    <h4>Import Data</h4>
                                </div>
                                <div className="upload-area">
                                    <div className="upload-icon">📂</div>
                                    <h4>Select Backup File</h4>
                                    <p>Click to browse JSON files</p>
                                    <input type="file" accept=".json" onChange={handleImport} title="Upload JSON backup" />
                                </div>
                                <div className="info-box">
                                    <p><strong>Note:</strong> Existing data will be preserved. Duplicate entries (same date and page) will be skipped.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
