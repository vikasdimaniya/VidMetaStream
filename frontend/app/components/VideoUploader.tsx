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
    <div className="bg-white dark:bg-gray-900 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      <div className="p-5 sm:p-6">
        <h1 className="text-xl font-bold mb-5 text-gray-900 dark:text-white">Upload Video</h1>
        
        {error && (
          <div className="mb-5 p-3 bg-black/5 border-l-4 border-red-500 text-red-700 dark:text-red-400 dark:bg-red-500/10 rounded">
            <p className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </p>
          </div>
        )}

        {uploadedVideo && (
          <div className="mb-5 p-3 bg-black/5 border-l-4 border-green-500 text-green-700 dark:text-green-400 dark:bg-green-500/10 rounded">
            <p className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Video uploaded successfully! Status: <span className="font-semibold">{uploadedVideo.status}</span>
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="title">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white dark:bg-gray-800 dark:text-white transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white dark:bg-gray-800 dark:text-white transition-colors"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="file">
              Video File <span className="text-red-500">*</span>
            </label>
            <div className="mt-1 flex items-center justify-center p-3 border border-gray-300 dark:border-gray-600 border-dashed rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <div className="flex items-center space-x-3">
                <svg 
                  className="h-6 w-6 text-gray-400"
                  stroke="currentColor"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path 
                    d="M7 16a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3M5 19h14M12 4v12m-4-4l4 4 4-4" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                  />
                </svg>
                <div className="flex flex-col">
                  <label
                    htmlFor="file"
                    className="cursor-pointer text-sm font-medium text-black dark:text-white hover:text-gray-500 dark:hover:text-gray-300"
                  >
                    <span>Select a video file</span>
                    <input
                      id="file"
                      type="file"
                      accept="video/*"
                      onChange={handleFileChange}
                      className="sr-only"
                      ref={fileInputRef}
                      required
                    />
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    MP4, MOV, AVI up to 10GB
                  </p>
                </div>
              </div>
            </div>
            {file && (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Selected file: <span className="font-medium text-gray-900 dark:text-white">{file.name}</span> ({(file.size / (1024 * 1024)).toFixed(2)} MB)
              </p>
            )}
          </div>

          {isUploading && (
            <div className="mt-4">
              <div className="relative pt-1">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold inline-block text-gray-600 dark:text-gray-400">
                      Uploading...
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold inline-block text-gray-600 dark:text-gray-400">
                      {progress}%
                    </span>
                  </div>
                </div>
                <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-gray-200 dark:bg-gray-700">
                  <div
                    style={{ width: `${progress}%` }}
                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-black dark:bg-white transition-all duration-300"
                  ></div>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isUploading}
            className="w-full py-2 px-4 bg-black dark:bg-white text-white dark:text-black font-medium rounded-md hover:bg-gray-800 dark:hover:bg-gray-200 focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-black dark:focus:ring-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isUploading ? 'Uploading...' : 'Upload Video'}
          </button>
        </form>
      </div>
    </div>
  );
} 