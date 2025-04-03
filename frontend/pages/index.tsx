import { useState } from 'react';
import SearchForm from '../components/SearchForm';
import VideoResults from '../components/VideoResults';
import { MCPClient } from '@modelcontextprotocol/sdk';

export default function Home() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const client = new MCPClient({
        serverUrl: process.env.NEXT_PUBLIC_MCP_SERVER_URL || 'http://localhost:3001'
      });
      
      const response = await client.processQuery(query);
      setResults(response.results);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Video Search
          </h1>
          
          <SearchForm onSubmit={handleSearch} />
          
          {loading && (
            <div className="mt-4 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            </div>
          )}
          
          {error && (
            <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-md">
              {error}
            </div>
          )}
          
          {results.length > 0 && (
            <VideoResults results={results} />
          )}
        </div>
      </div>
    </div>
  );
} 