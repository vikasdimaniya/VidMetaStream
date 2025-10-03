/**
 * CommonJS wrapper for core.js
 * Provides backward compatibility for CommonJS modules
 */

// Since we can't directly require ES modules from CommonJS in Node.js < 13.2
// We need to use dynamic import() which returns a Promise
let coreModule = null;

const loadCore = async () => {
    if (!coreModule) {
        coreModule = await import('./core.js');
    }
    return coreModule.default;
};

// Export a promise-based API
module.exports = {
    getCore: loadCore,
    getGridFSBucket: async () => {
        const core = await loadCore();
        return core.getGridFSBucket();
    },
    getDb: async () => {
        const core = await loadCore();
        return core.getDb();
    },
    s3Client: null // Will be populated after loadCore()
};

// Initialize s3Client after first load
loadCore().then(core => {
    module.exports.s3Client = core.s3Client;
}).catch(err => {
    console.error('Error loading core module:', err);
});

