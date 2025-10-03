/**
 * Database Index Verification and Creation Script
 * 
 * This script:
 * 1. Connects to MongoDB
 * 2. Creates indexes defined in models
 * 3. Verifies all indexes exist
 * 4. Displays index information
 */

import db from '../src/db.js';
import dotenv from 'dotenv';

dotenv.config();

async function verifyIndexes() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await db.connectDB();
        console.log('✅ Connected to MongoDB\n');

        // ==================== Objects Collection ====================
        console.log('📊 OBJECTS COLLECTION');
        console.log('=' .repeat(60));
        
        console.log('🔄 Creating indexes for objects collection...');
        await db.objects.createIndexes();
        
        const objectsIndexes = await db.objects.collection.listIndexes().toArray();
        console.log(`✅ Found ${objectsIndexes.length} indexes:\n`);
        
        for (const index of objectsIndexes) {
            const name = index.name;
            const keys = Object.entries(index.key || {})
                .map(([field, order]) => `${field}:${order}`)
                .join(', ');
            const background = index.background ? '(background)' : '';
            console.log(`  • ${name}: { ${keys} } ${background}`);
        }
        console.log('');

        // ==================== Videos Collection ====================
        console.log('📊 VIDEOS COLLECTION');
        console.log('=' .repeat(60));
        
        console.log('🔄 Creating indexes for videos collection...');
        await db.videos.createIndexes();
        
        const videosIndexes = await db.videos.collection.listIndexes().toArray();
        console.log(`✅ Found ${videosIndexes.length} indexes:\n`);
        
        for (const index of videosIndexes) {
            const name = index.name;
            const keys = Object.entries(index.key || {})
                .map(([field, order]) => `${field}:${order}`)
                .join(', ');
            const background = index.background ? '(background)' : '';
            console.log(`  • ${name}: { ${keys} } ${background}`);
        }
        console.log('');

        // ==================== Collection Statistics ====================
        console.log('📈 COLLECTION STATISTICS');
        console.log('=' .repeat(60));
        
        const objectsCount = await db.objects.countDocuments();
        const videosCount = await db.videos.countDocuments();
        
        console.log(`Objects Collection:`);
        console.log(`  • Documents: ${objectsCount}`);
        console.log('');
        
        console.log(`Videos Collection:`);
        console.log(`  • Documents: ${videosCount}`);
        console.log('');

        // ==================== Query Performance Test ====================
        console.log('⚡ QUERY PERFORMANCE TEST');
        console.log('=' .repeat(60));
        
        // Test 1: Find by object_name (should use index)
        console.time('Query with index (object_name)');
        const testQuery1 = await db.objects.find({ object_name: "person" }).limit(10).explain();
        console.timeEnd('Query with index (object_name)');
        
        const usedIndex1 = testQuery1.executionStats?.executionStages?.inputStage?.indexName || 
                          testQuery1.queryPlanner?.winningPlan?.inputStage?.indexName || 
                          'COLLSCAN';
        console.log(`  Index used: ${usedIndex1}`);
        console.log(`  Documents examined: ${testQuery1.executionStats?.totalDocsExamined || 0}`);
        console.log(`  Documents returned: ${testQuery1.executionStats?.nReturned || 0}`);
        console.log('');

        // Test 2: Compound query (should use compound index)
        console.time('Query with compound index');
        const testQuery2 = await db.objects.find({ 
            object_name: "person", 
            video_id: { $exists: true } 
        }).limit(10).explain();
        console.timeEnd('Query with compound index');
        
        const usedIndex2 = testQuery2.executionStats?.executionStages?.inputStage?.indexName || 
                          testQuery2.queryPlanner?.winningPlan?.inputStage?.indexName || 
                          'COLLSCAN';
        console.log(`  Index used: ${usedIndex2}`);
        console.log(`  Documents examined: ${testQuery2.executionStats?.totalDocsExamined || 0}`);
        console.log(`  Documents returned: ${testQuery2.executionStats?.nReturned || 0}`);
        console.log('');

        console.log('✅ Index verification complete!');
        console.log('=' .repeat(60));
        console.log('');
        console.log('💡 TIP: Run this script after any schema changes to ensure indexes are created.');
        console.log('');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

verifyIndexes();

