const mongoose = require('mongoose');
require('dotenv').config();
const searchRegistry = require('./utils/trie');
const Transaction = require('./models/Transaction');

async function test() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB.");
    
    // Check if there are transactions with descriptions
    const txns = await Transaction.find({ description: { $ne: null, $ne: '' } });
    console.log(`Found ${txns.length} transactions with descriptions in MongoDB.`);
    
    await searchRegistry.initializeTrie();
    
    if (txns.length > 0) {
        const userId = txns[0].user;
        console.log(`Testing Trie for user ${userId}...`);
        
        const trie = searchRegistry.getTrie(userId);
        
        // Let's print the first letter of the first transaction's description
        const prefix = txns[0].description.substring(0, 2);
        console.log(`Searching for prefix "${prefix}":`);
        
        const results = trie.searchPrefix(prefix);
        console.log(JSON.stringify(results, null, 2));
    }
    
    process.exit(0);
}

test();
