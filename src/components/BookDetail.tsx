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
    onDelete: () => void;
}

export const BookDetail: React.FC<BookDetailProps> = ({ bookId, onDelete }) => {
    const [pageInput, setPageInput] = useState('');
    const [warning, setWarning] = useState('');
    const [showCongrats, setShowCongrats] = useState(false);
    const exportRef = useRef<HTMLDivElement>(null);

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

    const handleDeleteBook = async () => {
        if (confirm(`Are you sure you want to delete "${book.title}" and all its reading logs? This cannot be undone.`)) {
            await db.transaction('rw', db.books, db.logs, async () => {
                await db.logs.where('bookId').equals(book.id!).delete();
                await db.books.delete(book.id!);
            });
            onDelete();
        }
    };

    const exportChart = async () => {
        if (exportRef.current) {
            const canvas = await html2canvas(exportRef.current, {
                backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg-color')
            });
            const link = document.createElement('a');
            link.download = `readlog-${book.title}-${format(new Date(), 'yyyy-MM-dd')}.png`;
            link.href = canvas.toDataURL();
            link.click();
        }
    };

    // Calculate ticks for clearer date display
    const ticks = (() => {
        if (chartData.length <= 6) return chartData.map(d => d.date);

        // Always include start and end
        const start = chartData[0].date;
        const end = chartData[chartData.length - 1].date;
        const middlePoints = [
            chartData[Math.floor(chartData.length * 0.2)].date,
            chartData[Math.floor(chartData.length * 0.4)].date,
            chartData[Math.floor(chartData.length * 0.6)].date,
            chartData[Math.floor(chartData.length * 0.8)].date,
        ];
        // Deduplicate and sort
        return Array.from(new Set([start, ...middlePoints, end])).sort((a, b) => a - b);
    })();

    const formatXAxis = (tickItem: number, index: number) => {
        const date = new Date(tickItem);
        // If it's the first tick, show year
        if (index === 0) return format(date, 'yyyy.MM.dd');

        // Compare with previous tick to see if year changed
        // Note: index corresponds to the tick array provided to XAxis (ticks prop)
        // However, formatter index might be relative to rendered ticks.
        // Safer way: Use the raw tick value comparison if possible, or simpler logic:
        // Since we are passed the tick value, we can't easily access "previous" tick value in standard generic formatter without closure.
        // But we computed `ticks` array above. We can find the index in that array.

        const tickIndex = ticks.indexOf(tickItem);
        if (tickIndex > 0) {
            const prevDate = new Date(ticks[tickIndex - 1]);
            if (prevDate.getFullYear() !== date.getFullYear()) {
                return format(date, 'yyyy.MM.dd');
            }
        }

        return format(date, 'MM.dd');
    };

    return (
        <div className="book-detail">
            <div ref={exportRef} className="export-wrapper">
                {/* Header / Title */}
                <div className="book-header">
                    <h1>{book.title}</h1>
                </div>

                {/* Progress Chart */}
                <div className="progress-section">
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis
                                    dataKey="date"
                                    domain={['dataMin', 'dataMax']}
                                    ticks={ticks}
                                    tickFormatter={formatXAxis}
                                    type="number"
                                    scale="time"
                                    stroke="var(--text-color)"
                                    tick={{ fontSize: 11 }}
                                />
                                <YAxis
                                    domain={[0, book.totalPages]}
                                    stroke="var(--text-color)"
                                    tick={{ fontSize: 11 }}
                                    width={30}
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
                    <div className="chart-footer">
                        <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                            Started: {format(book.startDate, 'PPP')}
                        </div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                            {format(new Date(), 'PPP p')}
                        </div>
                    </div>
                </div>

                {/* Stats Grid */}
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

            {/* Actions Row */}
            <div className="actions-row">
                <button className="export-btn" onClick={exportChart}>📷 Save Image</button>
                <button
                    onClick={handleDeleteBook}
                    className="delete-btn"
                    title="Delete Book"
                >
                    Delete
                </button>
            </div>

            {/* Input Form */}
            {book.status !== 'completed' && (
                <div className="log-form-section">
                    <form onSubmit={handleAddLog} className="log-form">
                        <div className="form-group">
                            <label>Current Page (Today)</label>
                            <input
                                type="number"
                                value={pageInput}
                                onChange={(e) => setPageInput(e.target.value)}
                                placeholder={`Last read: ${currentProgress} / ${book.totalPages}`}
                                min="0"
                            />
                        </div>
                        <button type="submit" className="update-btn">Update</button>
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
