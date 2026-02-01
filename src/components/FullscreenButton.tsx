import React from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

interface FullscreenButtonProps {
  isFullscreen: boolean;
  onClick: () => void;
}

const FullscreenButton: React.FC<FullscreenButtonProps> = ({ isFullscreen, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 bg-white/90 dark:bg-slate-800/90 rounded-md shadow-sm backdrop-blur-sm transition-colors"
      title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
    >
      {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </button>
  );
};

export default FullscreenButton;