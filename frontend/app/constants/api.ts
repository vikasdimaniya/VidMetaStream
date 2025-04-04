const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const API_ROUTES = {
  CREATE_VIDEO: `${BASE_URL}/video`,
  UPLOAD_VIDEO: (videoId: string) => `${BASE_URL}/upload/${videoId}`,
  GET_VIDEO: (videoId: string) => `${BASE_URL}/video/${videoId}`,
}; 