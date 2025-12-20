import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { BookDetail } from './components/BookDetail';
import './App.css';

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [fontSize, setFontSize] = useState<number>(16);
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);

  useEffect(() => {
    // Check system preference or saved theme
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const items = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(items);
    document.documentElement.setAttribute('data-theme', items);

    // Initial Font Size
    const savedFontSize = Number(localStorage.getItem('fontSize')) || 16;
    setFontSize(savedFontSize);
    document.documentElement.style.fontSize = `${savedFontSize}px`;
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const handleFontSizeChange = (delta: number) => {
    setFontSize(prev => {
      const next = Math.max(10, Math.min(24, prev + delta));
      localStorage.setItem('fontSize', next.toString());
      document.documentElement.style.fontSize = `${next}px`;
      return next;
    });
  };

  return (
    <div className="app-container">
      <Sidebar
        onSelectBook={setSelectedBookId}
        selectedBookId={selectedBookId}
        theme={theme}
        toggleTheme={toggleTheme}
        fontSize={fontSize}
        onFontSizeChange={handleFontSizeChange}
      />

      <main className="main-content">
        <header className="top-bar">
          {/* Theme toggle moved to Sidebar */}
        </header>

        {selectedBookId ? (
          <BookDetail bookId={selectedBookId} onDelete={() => setSelectedBookId(null)} />
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
