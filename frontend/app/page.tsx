import VideoUploader from './components/VideoUploader';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 sm:py-12">
      <div className="max-w-screen-lg mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-black dark:text-white mb-2">VidMetaStream</h1>
          <p className="text-gray-600 dark:text-gray-400">Intelligent Video Processing Platform</p>
        </div>
        <div className="flex justify-center">
          <div className="w-full max-w-md">
            <VideoUploader />
          </div>
        </div>
      </div>
    </main>
  );
} 