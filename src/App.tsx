import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { BookDetail } from './components/BookDetail';
import './App.css';

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);

  useEffect(() => {
    // Check system preference or saved theme
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const items = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(items);
    document.documentElement.setAttribute('data-theme', items);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  return (
    <div className="app-container">
      <Sidebar
        onSelectBook={setSelectedBookId}
        selectedBookId={selectedBookId}
      />

      <main className="main-content">
        <header className="top-bar">
          <button onClick={toggleTheme} className="theme-toggle">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </header>

        {selectedBookId ? (
          <BookDetail bookId={selectedBookId} />
        ) : (
          <div className="empty-state-main">
            <h1>Select a book to view progress</h1>
            <p>Or create a new one to get started.</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
