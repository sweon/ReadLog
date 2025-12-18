import React, { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
    Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, ComposedChart
} from 'recharts';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
import './BookDetail.css';

interface BookDetailProps {
    bookId: number;
}

export const BookDetail: React.FC<BookDetailProps> = ({ bookId }) => {
    const [pageInput, setPageInput] = useState('');
    const [warning, setWarning] = useState('');
    const [showCongrats, setShowCongrats] = useState(false);
    const chartRef = useRef<HTMLDivElement>(null);

    const data = useLiveQuery(async () => {
        const book = await db.books.get(bookId);
        if (!book) return null;

        const logs = await db.logs
            .where('bookId')
            .equals(bookId)
            .sortBy('date');

        return { book, logs };
    }, [bookId]);

    if (!data?.book) return <div>Loading...</div>;

    const { book, logs } = data;
    const currentProgress = logs.length > 0 ? logs[logs.length - 1].page : 0;
    const percentComplete = Math.round((currentProgress / book.totalPages) * 100);

    // Prepare Chart Data
    // Always include Start Date (0 pages)
    const chartData = [
        { date: book.startDate.getTime(), page: 0, label: 'Start' },
        ...logs.map(log => ({
            date: log.date.getTime(),
            page: log.page,
            label: `${Math.round((log.page / book.totalPages) * 100)}%`
        }))
    ];

    const handleAddLog = async (e: React.FormEvent) => {
        e.preventDefault();
        const newPage = parseInt(pageInput);

        if (isNaN(newPage)) return;

        if (newPage > book.totalPages) {
            setWarning(`Page number cannot exceed total pages (${book.totalPages}).`);
            return;
        }

        if (newPage < currentProgress) {
            if (!confirm('New page is lower than current progress. Record anyway?')) {
                return;
            }
        }

        setWarning('');

        await db.transaction('rw', db.books, db.logs, async () => {
            await db.logs.add({
                bookId: book.id!,
                date: new Date(),
                page: newPage
            });

            await db.books.update(book.id!, {
                lastReadDate: new Date(),
                status: newPage === book.totalPages ? 'completed' : 'reading'
            });
        });

        setPageInput('');
        if (newPage === book.totalPages) {
            setShowCongrats(true);
        }
    };

    const exportChart = async () => {
        if (chartRef.current) {
            const canvas = await html2canvas(chartRef.current, {
                backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg-color')
            });
            const link = document.createElement('a');
            link.download = `readlog-${book.title}-${format(new Date(), 'yyyy-MM-dd')}.png`;
            link.href = canvas.toDataURL();
            link.click();
        }
    };

    const formatDate = (tickItem: number) => {
        return format(new Date(tickItem), 'MM/dd');
    };

    return (
        <div className="book-detail">
            {/* Header */}
            <div className="book-header">
                <h1>{book.title}</h1>
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-value">{percentComplete}%</div>
                        <div className="stat-label">Complete</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{currentProgress} / {book.totalPages}</div>
                        <div className="stat-label">Pages Read</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{logs.length}</div>
                        <div className="stat-label">Sessions</div>
                    </div>
                </div>
            </div>

            {/* Progress Chart */}
            <div className="progress-section" ref={chartRef}>
                <h3>Reading Progress</h3>
                <button className="export-btn" onClick={exportChart}>📷 Save Image</button>
                <div className="chart-container">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis
                                dataKey="date"
                                domain={['auto', 'auto']}
                                tickFormatter={formatDate}
                                type="number"
                                scale="time"
                                stroke="var(--text-color)"
                            />
                            <YAxis
                                domain={[0, book.totalPages]}
                                stroke="var(--text-color)"
                            />
                            <Tooltip
                                labelFormatter={(label) => format(new Date(label), 'PPP p')}
                                contentStyle={{
                                    backgroundColor: 'var(--bg-color)',
                                    borderColor: 'var(--border-color)',
                                    color: 'var(--text-color)'
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="page"
                                stroke="var(--primary-color)"
                                fill="var(--primary-color)"
                                fillOpacity={0.1}
                                strokeWidth={2}
                            />
                            <Line type="monotone" dataKey="page" stroke="var(--primary-color)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
                <div style={{ textAlign: 'right', marginTop: '10px', fontSize: '0.8rem', opacity: 0.7 }}>
                    {format(new Date(), 'PPP p')}
                </div>
            </div>

            {/* Input Form */}
            {book.status !== 'completed' && (
                <div className="log-form-section">
                    <h3>Update Progress</h3>
                    <form onSubmit={handleAddLog} className="log-form">
                        <div className="form-group">
                            <label>Current Page (Today)</label>
                            <input
                                type="number"
                                value={pageInput}
                                onChange={(e) => setPageInput(e.target.value)}
                                placeholder={`Last read: ${currentProgress}`}
                                min="0"
                            />
                        </div>
                        <button type="submit">Update</button>
                    </form>
                    {warning && <div className="warning-msg">⚠️ {warning}</div>}
                </div>
            )}

            {/* Congrats Modal */}
            {showCongrats && (
                <div className="congrats-modal" onClick={() => setShowCongrats(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h2>🎉 Congratulations! 🎉</h2>
                        <p>You have finished <strong>{book.title}</strong>!</p>
                        <button onClick={() => setShowCongrats(false)}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
};
