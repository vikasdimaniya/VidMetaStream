'use client';

import { useState, useRef, ChangeEvent, FormEvent } from 'react';
import axios, { AxiosError } from 'axios';
import { API_ROUTES } from '../constants/api';
import { CreateVideoResponse, Video } from '../interfaces/video';

export default function VideoUploader() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [uploadedVideo, setUploadedVideo] = useState<Video | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a video to upload');
      return;
    }

    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }

    setError('');
    setIsUploading(true);
    setProgress(0);
    
    try {
      // Step 1: Create video entry in database
      console.log(`Attempting to create video entry at ${API_ROUTES.CREATE_VIDEO}`);
      const createResponse = await axios.post<CreateVideoResponse>(
        API_ROUTES.CREATE_VIDEO,
        {
          title,
          description,
          filename: file.name,
        }
      );

      const { video, upload_url } = createResponse.data;
      console.log('Video entry created:', video);
      
      // Step 2: Upload the video file
      if (upload_url) {
        // For S3 direct upload
        console.log(`Uploading to S3 via signed URL: ${upload_url}`);
        await axios.put(upload_url, file, {
          headers: {
            'Content-Type': file.type,
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || 1)
            );
            setProgress(percentCompleted);
          },
        });
        
        // Step 2.5: Notify the backend that the direct S3 upload is complete
        console.log(`Notifying backend that upload is complete via ${API_ROUTES.NOTIFY_UPLOAD_COMPLETE(video._id)}`);
        await axios.post(API_ROUTES.NOTIFY_UPLOAD_COMPLETE(video._id));
      } else {
        // For server upload
        console.log(`Uploading via server at ${API_ROUTES.UPLOAD_VIDEO(video._id)}`);
        const formData = new FormData();
        formData.append('file', file);
        
        await axios.post(
          API_ROUTES.UPLOAD_VIDEO(video._id),
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
            onUploadProgress: (progressEvent) => {
              const percentCompleted = Math.round(
                (progressEvent.loaded * 100) / (progressEvent.total || 1)
              );
              setProgress(percentCompleted);
            },
          }
        );
        // No need to notify for server uploads as the server already updates the status
      }

      // Step 3: Get the updated video info
      console.log(`Fetching updated video info from ${API_ROUTES.GET_VIDEO(video._id)}`);
      const videoResponse = await axios.get<Video>(API_ROUTES.GET_VIDEO(video._id));
      setUploadedVideo(videoResponse.data);
      
      // Reset form
      setTitle('');
      setDescription('');
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Upload error:', err);
      
      if (axios.isAxiosError(err)) {
        const axiosError = err as AxiosError;
        
        if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ERR_NETWORK') {
          setError('Unable to connect to the server. Please make sure the server is running at the correct address (port 8000).');
        } else if (axiosError.response) {
          setError(`Server error: ${axiosError.response.status} ${axiosError.response.statusText}`);
        } else {
          setError(`Network error: ${axiosError.message}`);
        }
      } else {
        setError('An unexpected error occurred during upload. Please try again.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-6">Upload Video</h1>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {uploadedVideo && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-md">
          Video uploaded successfully! Status: {uploadedVideo.status}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="title">
            Title*
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring focus:border-blue-300"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring focus:border-blue-300"
            rows={3}
          />
        </div>

        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="file">
            Video File*
          </label>
          <input
            id="file"
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring focus:border-blue-300"
            ref={fileInputRef}
            required
          />
          {file && (
            <p className="mt-1 text-sm text-gray-500">
              Selected file: {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
            </p>
          )}
        </div>

        {isUploading && (
          <div className="mb-4">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-sm text-center mt-1">{progress}% Uploaded</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isUploading}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:ring disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUploading ? 'Uploading...' : 'Upload Video'}
        </button>
      </form>
    </div>
  );
} 