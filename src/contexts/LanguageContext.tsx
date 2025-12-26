import React, { createContext, useContext, useState } from 'react';

export type Language = 'en' | 'ko';

interface Translations {
    [key: string]: {
        [K in Language]: string;
    };
}

const translations: Translations = {
    // Sidebar
    add_book: { en: '+ Add', ko: '+ 추가' },
    search_placeholder: { en: 'Search books...', ko: '책 검색...' },
    sort_date_desc: { en: 'Newest First', ko: '최신순' },
    sort_date_asc: { en: 'Oldest First', ko: '오래된순' },
    sort_title: { en: 'Title', ko: '제목순' },
    sort_last_read: { en: 'Last Read', ko: '최근 읽은순' },
    sync_devices: { en: 'Sync Devices', ko: '기기 동기화' },
    check_updates: { en: 'Check Updates', ko: '업데이트 확인' },
    update_available: { en: 'Update Available!', ko: '업데이트 가능!' },
    theme_light: { en: 'Switch to Light Mode', ko: '라이트 모드' },
    theme_dark: { en: 'Switch to Dark Mode', ko: '다크 모드' },
    settings: { en: 'Settings', ko: '설정' },
    no_books: { en: 'No books found.', ko: '책이 없습니다.' },
    installing_update: { en: 'Installing updates...', ko: '업데이트 설치 중...' },
    already_latest: { en: 'Already on the latest version.', ko: '이미 최신 버전입니다.' },
    update_found_reloading: { en: 'New version found! Reloading...', ko: '새 버전 발견! 재시작 중...' },
    select_all: { en: 'Select All', ko: '전체 선택' },
    deselect_all: { en: 'Deselect All', ko: '선택 해제' },
    selected: { en: 'selected', ko: '개 선택됨' },
    all_books: { en: 'All Books', ko: '모든 책' },

    // Add Book Form
    book_title: { en: 'Book Title', ko: '책 제목' },
    total_pages: { en: 'Total Pages', ko: '전체 페이지' },
    cancel: { en: 'Cancel', ko: '취소' },
    save: { en: 'Save', ko: '저장' },

    // Book Detail
    delete_book: { en: 'Delete Book', ko: '책 삭제' },
    confirm_delete: { en: 'Are you sure you want to delete this book? This cannot be undone.', ko: '이 책을 삭제하시겠습니까? 삭제된 데이터는 복구할 수 없습니다.' },
    percent_complete: { en: 'Percent Complete', ko: '독서율' },
    pages_read: { en: 'Pages Read', ko: '읽은 페이지' },
    sessions: { en: 'Sessions', ko: '독서 횟수' },
    daily_progress: { en: 'Daily Progress', ko: '일일 독서량' },
    cumulative_progress: { en: 'Cumulative Progress', ko: '누적 독서량' },
    reading_history: { en: 'Reading History', ko: '독서 기록' },
    export_chart: { en: 'Export Chart', ko: '차트 내보내기' },
    current_page: { en: 'Current Page', ko: '현재 페이지' },
    update_progress: { en: 'Update Progress', ko: '진도 업데이트' },
    select_book_prompt: { en: 'Select a book to view progress', ko: '책을 선택하여 독서 진행 상황을 확인하세요' },
    start_prompt: { en: 'Or create a new one to get started.', ko: '또는 새 책을 추가하여 시작해 보세요.' },
    congrats_finished: { en: 'Congratulations! You finished the book!', ko: '축하합니다! 책 한 권을 완독하셨네요!' },

    // Settings
    summary: { en: 'Summary', ko: '요약' },
    total_books: { en: 'Books', ko: '책' },
    total_sessions: { en: 'Sessions', ko: '독서 세션' },
    data_management: { en: 'Data Management', ko: '데이터 관리' },
    backup_data: { en: 'Backup Data', ko: '데이터 백업' },
    backup_desc: { en: 'Export your reading logs to a JSON file. Select specific books or leave none selected to export everything.', ko: '독서 기록을 JSON 파일로 내보냅니다. 특정 책만 선택하거나 전체를 백업할 수 있습니다.' },
    backup_now: { en: 'Backup Now', ko: '지금 백업' },
    restore_data: { en: 'Restore Data', ko: '데이터 복구' },
    restore_desc: { en: 'Import reading logs from a previously exported JSON file.', ko: '이전에 백업한 JSON 파일에서 독서 기록을 가져옵니다.' },
    choose_file: { en: 'Choose File', ko: '파일 선택' },
    language: { en: 'Language', ko: '언어' },
    app_description: {
        en: 'ReadLog is a simple, private reading progress tracker. It stores all your data locally in your browser, ensuring your reading habits stay private without any server-side storage.',
        ko: 'ReadLog는 심플하고 프라이빗한 독서 진도 추적기입니다. 모든 데이터는 브라우저에 로컬로 저장되며, 서버에 기록을 남기지 않아 사용자의 독서 습관을 안전하게 보호합니다.'
    },
    help_about: { en: 'Help & About', ko: '도움말 및 정보' },
    how_to_use: { en: 'How to use', ko: '사용 방법' },
    how_to_use_desc: { en: 'Add a new book using the "+ Add" button in the sidebar. Track your daily progress by entering the current page number on the book\'s detail page. Use the sync feature to view your progress on multiple devices.', ko: '1. 사이드바의 "+ 추가" 버튼을 눌러 읽기 시작하는 책을 등록하세요.\n2. 목록에서 책을 선택하면 "책 진도 페이지"로 이동합니다.\n3. 읽은 페이지 수를 입력하여 독서 진도를 기록하세요.\n4. "데이터 관리" 메뉴에서 백업/복구 기능을 통해 소중한 독서 기록을 안전하게 보관하세요.\n5. 기기 동기화 기능을 사용하면 여러 기기에 동일한 기록을 공유할 수 있습니다.' },
    app_info: { en: 'App Information', ko: '앱 정보' },
    app_info_desc: { en: 'ReadLog v1.2.0 • Local-only · No server Book Reading Progress Logger', ko: 'ReadLog v1.2.0 • Local-only · No server Book Reading Progress Logger' },
    legal_title: { en: 'Legal Disclaimer', ko: '법적 고지' },
    legal_desc: { en: 'This application is provided "as is" without any warranties. Your data is stored locally in your browser and is your responsibility. We do not collect or store your personal information on our servers.', ko: '이 애플리케이션은 명시적 또는 묵시적인 보증 없이 "있는 그대로" 제공됩니다. 모든 데이터는 브라우저에 로컬로 저장되며 귀하의 책임하에 관리됩니다. 당사는 서버에 어떠한 개인정보도 수집하거나 저장하지 않습니다.' },
    share: { en: 'Share with Friends', ko: '친구에게 공유하기' },
    back: { en: 'Back', ko: '뒤로' },
    import_success: { en: 'Import successful!', ko: '성공적으로 가져왔습니다!' },
    new_books: { en: 'New Books', ko: '새 책' },
    new_logs: { en: 'New Logs', ko: '새 기록' },
    import_failed: { en: 'Failed to import file. Make sure it is a valid ReadLog backup.', ko: '파일 가져오기에 실패했습니다. 올바른 ReadLog 백업 파일인지 확인하세요.' },
    enter_filename: { en: 'Enter filename for export:', ko: '내보낼 파일 이름을 입력하세요:' },
};

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [language, setLanguageState] = useState<Language>(() => {
        return (localStorage.getItem('language') as Language) || 'en';
    });

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem('language', lang);
    };

    const t = (key: string): string => {
        const translation = translations[key];
        if (!translation) return key;
        return translation[language];
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};
