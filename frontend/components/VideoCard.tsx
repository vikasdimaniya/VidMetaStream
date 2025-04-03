import { useState } from 'react';

interface Object {
  class: string;
  confidence: number;
  bbox: [number, number, number, number];
}

interface VideoCardProps {
  videoId: string;
  startTime: number;
  endTime: number;
  objects: Object[];
}

export default function VideoCard({ videoId, startTime, endTime, objects }: VideoCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
    // TODO: Implement video playback control
  };

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="relative aspect-video bg-gray-200">
        {/* Video player will be implemented here */}
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={handlePlayPause}
            className="p-2 rounded-full bg-black bg-opacity-50 text-white hover:bg-opacity-75"
          >
            {isPlaying ? (
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-900">
            Video ID: {videoId}
          </span>
          <span className="text-sm text-gray-500">
            {formatTime(startTime)} - {formatTime(endTime)}
          </span>
        </div>

        <div className="mt-2">
          <h3 className="text-sm font-medium text-gray-900">Detected Objects:</h3>
          <ul className="mt-1 space-y-1">
            {objects.map((obj, index) => (
              <li key={index} className="text-sm text-gray-500">
                {obj.class} ({Math.round(obj.confidence * 100)}%)
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
} 