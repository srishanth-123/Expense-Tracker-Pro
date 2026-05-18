const { LRUCache } = require('lru-cache');

// Construct the L1 runtime cache securely locking 100 most active user queries
const searchCache = new LRUCache({
    max: 100, 
    ttl: 1000 * 60 * 5, // 5 minutes Time-to-Live
});

/**
 * Searches the LRU map to selectively delete only the cached keys 
 * connected to the user who triggered the data-refresh hooks.
 */
function invalidateUserSearchCache(userId) {
    if (!userId) return;
    const stringId = userId.toString();
    for (const key of searchCache.keys()) {
        if (key.startsWith(`search:${stringId}:`)) {
            searchCache.delete(key);
        }
    }
}

module.exports = {
    searchCache,
    invalidateUserSearchCache
};
