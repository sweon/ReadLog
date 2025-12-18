import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { DataManagement } from './DataManagement';
import './DataManagement.css';

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
        return result;
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <h2>ReadLog</h2>
                </div>
                <button onClick={() => setIsAdding(!isAdding)}>{isAdding ? 'Cancel' : '+ New Book'}</button>
            </div>

            {isAdding && (
                <form onSubmit={handleAddBook} className="add-book-form">
                    <input
                        type="text"
                        placeholder="Book Title"
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        required
                    />
                    <input
                        type="number"
                        placeholder="Total Pages"
                        value={newTotalPages}
                        onChange={e => setNewTotalPages(e.target.value)}
                        required
                        min="1"
                    />
                    <button type="submit">Add</button>
                </form>
            )}

            <div className="controls">
                <input
                    type="text"
                    placeholder="Search books..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <select value={sort} onChange={e => setSort(e.target.value as SortOption)}>
                    <option value="date-desc">Newest First</option>
                    <option value="date-asc">Oldest First</option>
                    <option value="title">Title</option>
                    <option value="last-read">Last Read</option>
                </select>
            </div>

            <div className="book-list">
                {books?.map(book => (
                    <div
                        key={book.id}
                        className={`book-item ${selectedBookId === book.id ? 'active' : ''}`}
                        onClick={() => onSelectBook(book.id!)}
                    >
                        <div className="book-title">{book.title}</div>
                        <div className="book-meta">
                            {/* Calculate progress here or use a helper */}
                            <span>{new Date(book.lastReadDate).toLocaleDateString()}</span>
                        </div>
                    </div>
                ))}
                {books?.length === 0 && <div className="empty-state">No books found.</div>}
            </div>
            <div style={{ marginTop: 'auto', display: 'flex', gap: '0.5rem', padding: '0.5rem 0' }}>
                <div style={{ flex: 1 }}>
                    <DataManagement />
                </div>
                <button
                    onClick={toggleTheme}
                    style={{
                        padding: '0.5rem',
                        fontSize: '1.2rem',
                        background: 'none',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '40px'
                    }}
                    title="Toggle Theme"
                >
                    {theme === 'light' ? '🌙' : '☀️'}
                </button>
            </div>
        </div>
    );
};
