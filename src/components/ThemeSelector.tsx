import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface ThemeSelectorProps {
    isMobile?: boolean;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({ isMobile }) => {
    const { theme, setTheme } = useTheme();
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    const isLongPress = useRef(false);
    const mobileMenuRef = useRef<HTMLDivElement>(null);

    // Close mobile menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
                setShowMobileMenu(false);
            }
        };

        if (showMobileMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showMobileMenu]);

    const handleMobileTouchStart = () => {
        isLongPress.current = false;
        longPressTimer.current = setTimeout(() => {
            isLongPress.current = true;
            setShowMobileMenu(true);
        }, 500); // 500ms for long press
    };

    const handleMobileTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
        }
    };

    const handleMobileClick = () => {
        if (isLongPress.current) return;

        // Simple toggle logic: 
        // If current is dark -> light
        // If current is light -> dark
        // If current is system -> toggle based on resolved system theme? 
        // Simplification: Toggle between light and dark. If system, switch to the opposite of resolved or just dark.
        // Let's standard: Toggle Dark <-> Light.
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
    };

    if (isMobile) {
        return (
            <div className="relative" ref={mobileMenuRef}>
                <button
                    className="p-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-md shadow-sm border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 transition-colors"
                    onTouchStart={handleMobileTouchStart}
                    onTouchEnd={handleMobileTouchEnd}
                    onClick={handleMobileClick}
                    title="Toggle Theme (Long press for options)"
                >
                    {theme === 'dark' ? <Moon size={20} /> : theme === 'light' ? <Sun size={20} /> : <Monitor size={20} />}
                </button>

                {showMobileMenu && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 overflow-hidden z-50">
                        <div className="p-1 flex flex-col gap-1">
                            <button
                                onClick={() => { setTheme('light'); setShowMobileMenu(false); }}
                                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md ${theme === 'light' ? 'bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                            >
                                <Sun size={16} /> Light
                            </button>
                            <button
                                onClick={() => { setTheme('dark'); setShowMobileMenu(false); }}
                                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md ${theme === 'dark' ? 'bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                            >
                                <Moon size={16} /> Dark
                            </button>
                            <button
                                onClick={() => { setTheme('system'); setShowMobileMenu(false); }}
                                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md ${theme === 'system' ? 'bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                            >
                                <Monitor size={16} /> Auto
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Desktop Segmented Control
    return (
        <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-lg border border-gray-200 dark:border-slate-700">
            <button
                onClick={() => setTheme('system')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${theme === 'system' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-200 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                title="System Preference"
            >
                <Monitor size={14} />
            </button>
            <button
                onClick={() => setTheme('light')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${theme === 'light' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-200 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                title="Light Mode"
            >
                <Sun size={14} />
            </button>
            <button
                onClick={() => setTheme('dark')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${theme === 'dark' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-200 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                title="Dark Mode"
            >
                <Moon size={14} />
            </button>
        </div>
    );
};
