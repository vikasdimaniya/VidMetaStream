import VideoCard from './VideoCard';

interface VideoResult {
  video_id: string;
  start_time: number;
  end_time: number;
  objects: Array<{
    class: string;
    confidence: number;
    bbox: [number, number, number, number];
  }>;
}

interface VideoResultsProps {
  results: VideoResult[];
}

export default function VideoResults({ results }: VideoResultsProps) {
  if (!results.length) {
    return null;
  }

  return (
    <div className="mt-8">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Search Results
      </h2>
      
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((result, index) => (
          <VideoCard
            key={`${result.video_id}-${index}`}
            videoId={result.video_id}
            startTime={result.start_time}
            endTime={result.end_time}
            objects={result.objects}
          />
        ))}
      </div>
    </div>
  );
} 