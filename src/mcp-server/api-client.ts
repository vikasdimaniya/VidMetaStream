import axios from 'axios';
import mcpConfig from '../config/mcp.config';

export class VidMetaStreamClient {
    private baseUrl: string;

    constructor() {
        this.baseUrl = mcpConfig.api.baseUrl;
    }

    async querySpatialObjects(params: any) {
        const response = await axios.get(`${this.baseUrl}/query/spatialObjectsPaginated`, { params });
        return response.data;
    }

    async querySequences(params: any) {
        const response = await axios.get(`${this.baseUrl}/query/tempral/objects`, { params });
        return response.data;
    }

    async queryInstanceOverlaps(params: any) {
        const response = await axios.get(`${this.baseUrl}/query/overlaps`, { params });
        return response.data;
    }

    async getVideoChunks(params: any) {
        const response = await axios.post(`${this.baseUrl}/query/chunks`, params);
        return response.data;
    }

    async downloadChunk(chunkId: string) {
        const response = await axios.get(`${this.baseUrl}/query/chunk/download/${chunkId}`, {
            responseType: 'blob'
        });
        return response.data;
    }
} 