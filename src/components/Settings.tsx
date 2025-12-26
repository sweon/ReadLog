import React, { useState } from 'react';
import { db, type Book, type Log } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import './Settings.css';

import { useLanguage } from '../contexts/LanguageContext';

interface SettingsProps {
    onClose?: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ onClose }) => {
    const { language, setLanguage, t } = useLanguage();
    const [selectedBooks, setSelectedBooks] = useState<number[]>([]);
    const [activeSection, setActiveSection] = useState<'data' | 'language' | 'help' | null>(null);

    const [dataSearch, setDataSearch] = useState('');

    const books = useLiveQuery(() => db.books.toArray());
    const totalLogs = useLiveQuery(() => db.logs.count());

    const filteredBooks = books?.filter(book =>
        book.title.toLowerCase().includes(dataSearch.toLowerCase())
    ) || [];

    const handleSelectAll = () => {
        if (!books) return;
        setSelectedBooks(books.map(b => b.id!));
    };

    const handleDeselectAll = () => {
        setSelectedBooks([]);
    };

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

        const filename = prompt(t('enter_filename'), `readlog-backup-${format(new Date(), 'yyyy-MM-dd')}`);
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
                    alert(`${t('import_success')}\n${t('new_books')}: ${booksImported}\n${t('new_logs')}: ${logsImported}`);
                });
            } catch (err) {
                console.error(err);
                alert(t('import_failed'));
            }
        };
        reader.readAsText(file);
    };

    const handleLanguageChange = (lang: 'en' | 'ko') => {
        setLanguage(lang);
    };

    const handleShare = () => {
        if (navigator.share) {
            navigator.share({
                title: 'ReadLog',
                text: 'Check out ReadLog, Local-only · No server Book Reading Progress Logger.',
                url: window.location.href,
            }).catch(console.error);
        } else {
            alert('Sharing is not supported on this browser. You can copy the URL: ' + window.location.href);
        }
    };

    const renderMain = () => (
        <div className="settings-main-view">
            <section className="settings-section summary-compact">
                <h2>{t('summary')}</h2>
                <div className="summary-grid">
                    <div className="summary-card">
                        <span className="value">{books?.length || 0}</span>
                        <span className="label">{t('total_books')}</span>
                    </div>
                    <div className="summary-card">
                        <span className="value">{totalLogs || 0}</span>
                        <span className="label">{t('total_sessions')}</span>
                    </div>
                </div>
            </section>

            <nav className="settings-nav-list">
                <button className="nav-item-btn" onClick={() => setActiveSection('data')}>
                    <span>{t('data_management')}</span>
                    <span className="chevron">›</span>
                </button>
                <button className="nav-item-btn" onClick={() => setActiveSection('language')}>
                    <span>{t('language')}</span>
                    <span className="chevron">›</span>
                </button>
                <button className="nav-item-btn" onClick={() => setActiveSection('help')}>
                    <span>{t('help_about')}</span>
                    <span className="chevron">›</span>
                </button>
            </nav>

            <footer className="settings-footer">
                <div className="legal-disclaimer">
                    <p><strong>{t('legal_title')}:</strong> {t('legal_desc')}</p>
                </div>
                <button className="share-btn" onClick={handleShare}>
                    <span>{t('share')}</span> 🔗
                </button>
            </footer>
        </div>
    );

    const getSectionTitle = () => {
        switch (activeSection) {
            case 'data': return t('data_management');
            case 'language': return t('language');
            case 'help': return t('help_about');
            default: return t('settings');
        }
    };

    const renderSection = () => {
        switch (activeSection) {
            case 'data':
                return (
                    <div className="subview-content">
                        <div className="data-actions">
                            <div className="action-group">
                                <h3>{t('backup_data')}</h3>
                                <p>{t('backup_desc')}</p>

                                <div className="backup-selection-container">
                                    <div className="selection-toolbar">
                                        <div className="data-search-wrapper">
                                            <input
                                                type="text"
                                                className="data-search-input"
                                                placeholder={t('search_placeholder')}
                                                value={dataSearch}
                                                onChange={e => setDataSearch(e.target.value)}
                                            />
                                            {dataSearch && (
                                                <button className="data-clear-search-btn" onClick={() => setDataSearch('')}>×</button>
                                            )}
                                        </div>
                                        <div className="selection-buttons">
                                            <button onClick={handleSelectAll}>{t('select_all')}</button>
                                            <button onClick={handleDeselectAll}>{t('deselect_all')}</button>
                                        </div>
                                    </div>

                                    <div className="book-selection-list">
                                        {filteredBooks.length > 0 ? (
                                            filteredBooks.map(book => (
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
                                                    <span className="book-name">{book.title}</span>
                                                </label>
                                            ))
                                        ) : (
                                            <div className="no-results-msg">{t('no_books')}</div>
                                        )}
                                    </div>

                                    <div className="selection-summary">
                                        {selectedBooks.length > 0 ? (
                                            <span>{selectedBooks.length} {t('selected')}</span>
                                        ) : (
                                            <span>{t('all_books')}</span>
                                        )}
                                    </div>
                                </div>

                                <button className="settings-action-btn primary" onClick={handleExport}>
                                    {selectedBooks.length > 0 ? t('backup_now') : `${t('backup_now')} (${t('all_books')})`}
                                </button>
                            </div>

                            <div className="action-divider"></div>

                            <div className="action-group">
                                <h3>{t('restore_data')}</h3>
                                <p>{t('restore_desc')}</p>
                                <div className="upload-wrapper">
                                    <button className="settings-action-btn secondary">{t('choose_file')}</button>
                                    <input type="file" accept=".json" onChange={handleImport} />
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case 'language':
                return (
                    <div className="subview-content">
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
                    </div>
                );
            case 'help':
                return (
                    <div className="subview-content">
                        <div className="help-content">
                            <div className="help-item">
                                <p style={{ marginBottom: '1.5rem', fontStyle: 'italic', opacity: 0.9 }}>{t('app_description')}</p>
                                <h3>{t('how_to_use')}</h3>
                                <div className="how-to-use-list">
                                    {t('how_to_use_desc').split('\n').map((line, i) => (
                                        <div key={i} className="how-to-use-item">{line}</div>
                                    ))}
                                </div>
                            </div>
                            <div className="help-item">
                                <h3>{t('legal_title')}</h3>
                                <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>{t('legal_desc')}</p>
                            </div>
                        </div>
                        <div className="help-footer">
                            {t('app_info_desc')}
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="settings-page">
            <header className="settings-header">
                {activeSection ? (
                    <button className="subview-back-btn" onClick={() => setActiveSection(null)}>
                        ←
                    </button>
                ) : onClose && (
                    <button className="subview-back-btn mobile-back-btn" onClick={onClose}>
                        ←
                    </button>
                )}
                <h1>{activeSection ? getSectionTitle() : t('settings')}</h1>
            </header>

            <div className="settings-container">
                {activeSection ? renderSection() : renderMain()}
            </div>
        </div>
    );
};
