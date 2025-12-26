import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { SyncModal } from './SyncModal';
import { useRegisterSW } from 'virtual:pwa-register/react';
import './DataManagement.css';
import './Sidebar.css';
import { useLanguage } from '../contexts/LanguageContext';

interface SidebarProps {
    onSelectBook: (bookId: number | null) => void;
    selectedBookId: number | null;
    theme: 'light' | 'dark';
    toggleTheme: () => void;
    fontSize: number;
    onFontSizeChange: (delta: number) => void;
    onShowSettings: () => void;
}

type SortOption = 'date-desc' | 'date-asc' | 'title' | 'last-read';

export const Sidebar: React.FC<SidebarProps> = ({ onSelectBook, selectedBookId, theme, toggleTheme, fontSize, onFontSizeChange, onShowSettings }) => {
    const { t } = useLanguage();
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<SortOption>('date-desc');
    const [isAdding, setIsAdding] = useState(false);
    const [showSync, setShowSync] = useState(false);
    const [updateMessage, setUpdateMessage] = useState<string | null>(null);

    const showStatus = (msg: string) => {
        setUpdateMessage(msg);
        setTimeout(() => setUpdateMessage(null), 3000);
    };

    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            // Check for updates periodically every hour
            r && setInterval(() => {
                r.update();
            }, 60 * 60 * 1000);
        }
    });

    const handleUpdateCheck = async () => {
        // If an update is already detected (indicator is red)
        if (needRefresh) {
            showStatus('Installing updates...');
            setNeedRefresh(false); // Clear indicator immediately for feedback
            updateServiceWorker(true);
            return;
        }

        // Otherwise, manually trigger a check
        if (!('serviceWorker' in navigator)) {
            showStatus('PWA not supported.');
            return;
        }

        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
            showStatus('Service worker not active.');
            return;
        }

        showStatus('Checking for updates...');

        try {
            await registration.update();

            // Wait a bit for the service worker to discover the new content
            // The 'needRefresh' state from useRegisterSW should update automatically
            // But we add a small delay to provide feedback if nothing was found
            setTimeout(() => {
                // If the state hasn't changed to true, it means we are on the latest
                const sw = registration.waiting || registration.installing;
                if (!sw && !needRefresh) {
                    showStatus('Already on the latest version.');
                } else if (needRefresh) {
                    showStatus('New version available!');
                }
            }, 2000);
        } catch (err) {
            console.error('Update check failed:', err);
            showStatus('Failed to check for updates.');
        }
    };

    // New Book Form State
    const [newTitle, setNewTitle] = useState('');
    const [newTotalPages, setNewTotalPages] = useState('');

    const books = useLiveQuery(async () => {
        let collection = db.books.toCollection();

        // Filtering
        if (search) {
            collection = db.books.filter(book =>
                book.title.toLowerCase().includes(search.toLowerCase())
            );
        }

        let result = await collection.toArray();

        // Sorting
        switch (sort) {
            case 'date-desc':
                result.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
                break;
            case 'date-asc':
                result.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
                break;
            case 'title':
                result.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'last-read':
                result.sort((a, b) => b.lastReadDate.getTime() - a.lastReadDate.getTime());
                break;
        }

        // Enrich with progress data (N+1 query but acceptable for sidebar)
        const enriched = await Promise.all(result.map(async (book) => {
            const lastLog = await db.logs.where('bookId').equals(book.id!).reverse().sortBy('date').then(logs => logs[0]);
            const currentPage = lastLog ? lastLog.page : 0;
            return { ...book, currentPage };
        }));

        return enriched;
    }, [search, sort]);

    const handleAddBook = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle || !newTotalPages) return;

        try {
            const id = await db.books.add({
                title: newTitle,
                totalPages: parseInt(newTotalPages),
                startDate: new Date(),
                lastReadDate: new Date(),
                status: 'reading'
            });
            setNewTitle('');
            setNewTotalPages('');
            setIsAdding(false);
            onSelectBook(id as number);
        } catch (error) {
            console.error('Failed to add book:', error);
            alert('Failed to add book.');
        }
    };

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <div className="header-actions">
                    <button
                        className={`icon-btn add-btn ${isAdding ? 'active' : ''}`}
                        onClick={() => setIsAdding(!isAdding)}
                        data-tooltip={t('add_book')}
                    >
                        {t('add_book')}
                    </button>
                    <div className="font-size-controls">
                        <button className="icon-btn" onClick={() => onFontSizeChange(-1)} data-tooltip={`Decrease Font Size (${fontSize}px)`}>-</button>
                        <button className="icon-btn" onClick={() => onFontSizeChange(1)} data-tooltip={`Increase Font Size (${fontSize}px)`}>+</button>
                    </div>
                    <div className="right-actions">
                        <button
                            className="icon-btn"
                            onClick={() => setShowSync(true)}
                            data-tooltip={t('sync_devices')}
                        >
                            🔄
                        </button>
                        <button
                            className={`icon-btn update-btn ${needRefresh ? 'has-update' : ''}`}
                            onClick={handleUpdateCheck}
                            data-tooltip={needRefresh ? t('update_available') : t('check_updates')}
                        >
                            🔃
                        </button>
                        <button
                            className="icon-btn"
                            onClick={toggleTheme}
                            data-tooltip={theme === 'light' ? t('theme_dark') : t('theme_light')}
                        >
                            {theme === 'light' ? '🌙' : '☀️'}
                        </button>
                        <button
                            className="icon-btn"
                            onClick={onShowSettings}
                            data-tooltip={t('settings')}
                        >
                            ⚙️
                        </button>
                    </div>
                </div>
            </div>

            {updateMessage && (
                <div className="status-notification">
                    {updateMessage}
                </div>
            )}

            {
                isAdding && (
                    <form onSubmit={handleAddBook} className="add-book-form">
                        <input
                            className="input-field"
                            type="text"
                            placeholder={t('book_title')}
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                            required
                            autoFocus
                        />
                        <input
                            className="input-field"
                            type="number"
                            placeholder={t('total_pages')}
                            value={newTotalPages}
                            onChange={e => setNewTotalPages(e.target.value)}
                            required
                            min="1"
                        />
                        <div className="form-actions">
                            <button type="button" className="sidebar-action-btn secondary" onClick={() => setIsAdding(false)}>{t('cancel')}</button>
                            <button type="submit" className="sidebar-action-btn primary">{t('save')}</button>
                        </div>
                    </form>
                )
            }

            <div className="controls">
                <div className="search-wrapper">
                    <input
                        className="search-input"
                        type="text"
                        placeholder={t('search_placeholder')}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button
                            className="clear-search-btn"
                            onClick={() => setSearch('')}
                            data-tooltip="Clear Search"
                        >
                            ×
                        </button>
                    )}
                </div>
                <div className="sort-wrapper">
                    <select
                        className="sort-select"
                        value={sort}
                        onChange={e => setSort(e.target.value as SortOption)}
                        data-tooltip={t('sort_books')}
                    >
                        <option value="date-desc">{t('sort_date_desc')}</option>
                        <option value="date-asc">{t('sort_date_asc')}</option>
                        <option value="title">{t('sort_title')}</option>
                        <option value="last-read">{t('sort_last_read')}</option>
                    </select>
                </div>
            </div>

            <div className="book-list unified-list">
                {books?.map(book => {
                    const percent = Math.round((book.currentPage / book.totalPages) * 100) || 0;
                    const dateObj = new Date(book.lastReadDate);
                    const formattedDate = `${dateObj.getFullYear().toString().slice(2)}.${(dateObj.getMonth() + 1).toString().padStart(2, '0')}.${dateObj.getDate().toString().padStart(2, '0')}`;

                    return (
                        <div
                            key={book.id}
                            className={`book-row ${selectedBookId === book.id ? 'active' : ''}`}
                            onClick={() => onSelectBook(book.id!)}
                        >
                            <div className="book-row-main">
                                <div className="book-title" title={book.title}>{book.title}</div>
                            </div>
                            <div className="book-row-sub">
                                <span className="book-progress">{percent}% · {book.currentPage} / {book.totalPages}p</span>
                                <span className="book-date">{formattedDate}</span>
                            </div>
                        </div>
                    );
                })}
                {books?.length === 0 && <div className="empty-state">{t('no_books')}</div>}
            </div>
            {showSync && <SyncModal onClose={() => setShowSync(false)} />}
        </div >
    );
};
