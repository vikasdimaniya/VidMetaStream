import VideoUploader from './components/VideoUploader';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100 py-10">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold text-center mb-8">VidMetaStream - Video Upload Platform</h1>
        <VideoUploader />
      </div>
    </main>
  );
} 