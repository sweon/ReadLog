import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { DataManagement } from './DataManagement';
import './DataManagement.css';
import './Sidebar.css';

interface SidebarProps {
    onSelectBook: (bookId: number | null) => void;
    selectedBookId: number | null;
    theme: 'light' | 'dark';
    toggleTheme: () => void;
}

type SortOption = 'date-desc' | 'date-asc' | 'title' | 'last-read';

export const Sidebar: React.FC<SidebarProps> = ({ onSelectBook, selectedBookId, theme, toggleTheme }) => {
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<SortOption>('date-desc');
    const [isAdding, setIsAdding] = useState(false);

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
                        title="Add New Book"
                    >
                        + Add
                    </button>
                    <div className="right-actions">
                        <DataManagement />
                        <button
                            className="icon-btn"
                            onClick={toggleTheme}
                            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
                        >
                            {theme === 'light' ? '🌙' : '☀️'}
                        </button>
                    </div>
                </div>
            </div>

            {isAdding && (
                <form onSubmit={handleAddBook} className="add-book-form">
                    <input
                        className="input-field"
                        type="text"
                        placeholder="Book Title"
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        required
                        autoFocus
                    />
                    <input
                        className="input-field"
                        type="number"
                        placeholder="Total Pages"
                        value={newTotalPages}
                        onChange={e => setNewTotalPages(e.target.value)}
                        required
                        min="1"
                    />
                    <button type="submit" className="primary-action-btn">List Book</button>
                </form>
            )}

            <div className="controls">
                <input
                    className="search-input"
                    type="text"
                    placeholder="Search library..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <div className="sort-wrapper">
                    <select
                        className="sort-select"
                        value={sort}
                        onChange={e => setSort(e.target.value as SortOption)}
                        title="Sort Books"
                    >
                        <option value="date-desc">Newest</option>
                        <option value="date-asc">Oldest</option>
                        <option value="title">A-Z</option>
                        <option value="last-read">Recent</option>
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
                                <div className="book-title">{book.title}</div>
                            </div>
                            <div className="book-row-sub">
                                <span className="book-progress">{percent}% · {book.currentPage} / {book.totalPages}p</span>
                                <span className="book-date">{formattedDate}</span>
                            </div>
                        </div>
                    );
                })}
                {books?.length === 0 && <div className="empty-state">No books. Click + to add.</div>}
            </div>
        </div>
    );
};
