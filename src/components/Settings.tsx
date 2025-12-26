import React, { useState } from 'react';
import { db, type Book, type Log } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import './Settings.css';

export const Settings: React.FC = () => {
    const [selectedBooks, setSelectedBooks] = useState<number[]>([]);
    const [language, setLanguage] = useState<'en' | 'ko'>(() => {
        return (localStorage.getItem('language') as 'en' | 'ko') || 'en';
    });

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
                        let localBook = await db.books
                            .where('title')
                            .equals(extBook.title)
                            .filter(b => b.totalPages === extBook.totalPages)
                            .first();

                        let localBookId = localBook?.id;

                        if (!localBook) {
                            const { id, ...bookData } = extBook;
                            localBookId = await db.books.add({
                                ...bookData,
                                startDate: new Date(bookData.startDate),
                                lastReadDate: new Date(bookData.lastReadDate)
                            }) as number;
                            booksImported++;
                        }

                        const extLogs = (data.logs as Log[]).filter(l => l.bookId === extBook.id);
                        for (const extLog of extLogs) {
                            const { id, bookId, ...logData } = extLog;
                            const exists = await db.logs
                                .where({ bookId: localBookId })
                                .filter(l => l.page === logData.page && l.date.getTime() === new Date(logData.date).getTime())
                                .first();

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
            } catch (err) {
                console.error(err);
                alert('Failed to import file. Make sure it is a valid ReadLog backup.');
            }
        };
        reader.readAsText(file);
    };

    const handleLanguageChange = (lang: 'en' | 'ko') => {
        setLanguage(lang);
        localStorage.setItem('language', lang);
        // In a real app, you'd use an i18n library here
        alert('Language setting saved. (UI translations coming soon)');
    };

    const handleShare = () => {
        if (navigator.share) {
            navigator.share({
                title: 'ReadLog',
                text: 'Check out ReadLog, the best way to track your reading progress!',
                url: window.location.href,
            }).catch(console.error);
        } else {
            alert('Sharing is not supported on this browser. You can copy the URL: ' + window.location.href);
        }
    };

    return (
        <div className="settings-page">
            <header className="settings-header">
                <h1>Settings</h1>
            </header>

            <div className="settings-container">
                <section className="settings-section">
                    <h2>Summary</h2>
                    <div className="summary-grid">
                        <div className="summary-card">
                            <span className="value">{books?.length || 0}</span>
                            <span className="label">Total Books</span>
                        </div>
                        <div className="summary-card">
                            <span className="value">{totalLogs || 0}</span>
                            <span className="label">Total Sessions</span>
                        </div>
                    </div>
                </section>

                <section className="settings-section">
                    <h2>Data Management</h2>
                    <div className="data-actions">
                        <div className="action-group">
                            <h3>Backup Data</h3>
                            <p>Export your reading logs to a JSON file. Select specific books or leave none selected to export everything.</p>
                            <div className="book-selection-list">
                                {books?.map(book => (
                                    <label key={book.id} className="selection-row">
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
                                        <span>{book.title}</span>
                                    </label>
                                ))}
                            </div>
                            <button className="settings-action-btn primary" onClick={handleExport}>Backup Now</button>
                        </div>
                        <div className="action-group">
                            <h3>Restore Data</h3>
                            <p>Import reading logs from a previously exported JSON file.</p>
                            <div className="upload-wrapper">
                                <button className="settings-action-btn secondary">Choose File</button>
                                <input type="file" accept=".json" onChange={handleImport} />
                            </div>
                        </div>
                    </div>
                </section>

                <section className="settings-section">
                    <h2>Language</h2>
                    <div className="language-options">
                        <button
                            className={`lang-btn ${language === 'en' ? 'active' : ''}`}
                            onClick={() => handleLanguageChange('en')}
                        >
                            English
                        </button>
                        <button
                            className={`lang-btn ${language === 'ko' ? 'active' : ''}`}
                            onClick={() => handleLanguageChange('ko')}
                        >
                            한국어
                        </button>
                    </div>
                </section>

                <section className="settings-section">
                    <h2>Help & About</h2>
                    <div className="help-content">
                        <div className="help-item">
                            <h3>How to use</h3>
                            <p>Add a new book using the "+ Add" button in the sidebar. Track your daily progress by entering the current page number on the book's detail page. Use the sync feature to view your progress on multiple devices.</p>
                        </div>
                        <div className="help-item">
                            <h3>App Information</h3>
                            <p>ReadLog v1.2.0 - A local-first, privacy-focused reading tracker.</p>
                        </div>
                    </div>
                </section>

                <footer className="settings-footer">
                    <div className="legal-disclaimer">
                        <p><strong>Legal Disclaimer:</strong> This application is provided "as is" without any warranties. Your data is stored locally in your browser and is your responsibility. We do not collect or store your personal information on our servers.</p>
                    </div>
                    <button className="share-btn" onClick={handleShare}>
                        <span>Share with Friends</span> 🔗
                    </button>
                </footer>
            </div>
        </div>
    );
};
