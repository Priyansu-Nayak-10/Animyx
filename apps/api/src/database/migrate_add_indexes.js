/**
 * Database Index Migration
 * Creates indexes on frequently queried columns to improve query performance
 * Run with: node src/database/migrate_add_indexes.js
 * 
 * This migration is essential for Phase 2 Stability & Scalability:
 * - Speeds up user-specific queries (user_id)
 * - Optimizes pagination with ordering on updated_at/created_at
 * - Prevents table scans on common WHERE clauses
 */
require('dotenv').config();
const supabase = require('./supabase');

/**
 * SQL statements to create performance-critical indexes
 */
const indexStatements = [
  // followed_anime indexes
  'CREATE INDEX IF NOT EXISTS idx_followed_anime_user_id ON followed_anime(user_id);',
  'CREATE INDEX IF NOT EXISTS idx_followed_anime_user_updated ON followed_anime(user_id, updated_at DESC);',
  'CREATE INDEX IF NOT EXISTS idx_followed_anime_user_status ON followed_anime(user_id, status);',
  'CREATE INDEX IF NOT EXISTS idx_followed_anime_mal_id ON followed_anime(mal_id);',

  // notifications indexes
  'CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);',
  'CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);',
  'CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);',

  // user_profiles indexes
  'CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);',

  // user_settings indexes
  'CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);',

  // anime recommendations indexes (if exists)
  'CREATE INDEX IF NOT EXISTS idx_anime_recommendations_user_id ON anime_recommendations(user_id);',

  // push_subscriptions indexes (for push notifications)
  'CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);',
];

/**
 * Attempt to create indexes via RPC
 * If that fails, provide SQL for manual execution
 */
async function createIndexesViaRpc() {
  console.log('📊 Starting database index migration...');
  console.log(`\nAttempting to create ${indexStatements.length} indexes...\n`);

  let successCount = 0;
  let failureCount = 0;
  const failures = [];

  for (const statement of indexStatements) {
    try {
      // Extract index name for logging
      const match = statement.match(/CREATE INDEX IF NOT EXISTS (\w+)/);
      const indexName = match ? match[1] : 'unknown';
      
      process.stdout.write(`Creating index: ${indexName}... `);

      const { error } = await supabase.rpc('exec_sql', {
        query: statement
      });

      if (error) {
        console.log('⚠️  (RPC not available)');
        failures.push(statement);
        failureCount++;
      } else {
        console.log('✅');
        successCount++;
      }
    } catch (err) {
      console.log(`❌`);
      failures.push(statement);
      failureCount++;
    }
  }

  console.log(`\n📈 Results: ${successCount} succeeded, ${failureCount} need manual creation`);

  if (failures.length > 0) {
    console.log('\n⚠️  Some indexes could not be created automatically.');
    console.log('📝 Please run the following SQL statements in your Supabase SQL Editor:\n');
    console.log('--- Copy everything below and paste into Supabase SQL Editor ---\n');
    failures.forEach(stmt => console.log(stmt));
    console.log('\n--- End of SQL ---\n');
    console.log('Navigation: https://app.supabase.com → Your Project → SQL Editor');
  } else {
    console.log('\n✅ All indexes created successfully!');
  }

  console.log('\n📊 Index Creation Details:');
  console.log('  • idx_followed_anime_user_id: Fast user library lookups');
  console.log('  • idx_followed_anime_user_updated: Optimizes paginated library queries');
  console.log('  • idx_followed_anime_user_status: Filters by status (watching, completed, etc)');
  console.log('  • idx_notifications_user_id: Fast notification fetches');
  console.log('  • idx_notifications_user_created: Optimizes paginated notification queries');
  console.log('  • And more for all frequently accessed tables...');

  process.exit(failures.length > 0 ? 1 : 0);
}

// Run migration
createIndexesViaRpc().catch(err => {
  console.error('❌ Migration error:', err.message);
  process.exit(1);
});
