export interface Video {
  _id: string;
  title: string;
  description?: string;
  filename?: string;
  status: 'created' | 'uploaded' | 'analyzing' | 'analized' | 'fragmenting' | 'fragmented' | 'ready' | 'error';
  metadata?: any;
  error?: any;
}

export interface CreateVideoResponse {
  video: Video;
  upload_url: string;
} 