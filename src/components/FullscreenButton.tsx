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
      className="p-2 text-gray-600 hover:text-gray-900 bg-white/90 rounded-lg shadow-sm backdrop-blur-sm transition-colors"
      title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
    >
      {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
    </button>
  );
};

export default FullscreenButton;