# VidMetaStream Frontend

This is the frontend application for VidMetaStream, a platform for uploading and managing videos.

## Features

- Video uploading with progress indicator
- Form-based video metadata entry
- Direct integration with backend API
- Support for both server-side and S3 direct uploads

## Getting Started

1. First, install the dependencies:

```bash
npm install
# or
yarn install
```

2. Create a `.env.local` file with the API URL:

```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

3. Run the development server:

```bash
npm run dev
# or
yarn dev
```

4. Open [http://localhost:3001](http://localhost:3001) in your browser to see the application.

## Usage

1. Fill out the video upload form with a title and description.
2. Select a video file to upload.
3. Click the "Upload Video" button.
4. Monitor the progress bar as the video uploads.
5. Wait for confirmation that the upload was successful.

## Project Structure

- `app/` - Next.js app directory
  - `components/` - React components
  - `constants/` - API and other constants
  - `interfaces/` - TypeScript interfaces
  - `page.tsx` - Main page component
  - `layout.tsx` - App layout component

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
