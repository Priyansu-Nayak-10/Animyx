/**
 * One-time migration: Add `image` column to followed_anime table.
 * Run with: node src/database/migrate_add_image.js
 */
require('dotenv').config();
const supabase = require('./supabase');

(async () => {
  console.log('Running migration: Add image column to followed_anime...');
  const { error } = await supabase.rpc('exec_sql', {
    query: `ALTER TABLE followed_anime ADD COLUMN IF NOT EXISTS image TEXT;`
  });

  if (error) {
    // rpc may not exist, try a direct approach via rest
    console.warn('RPC approach failed, trying direct column check...');
    // Supabase JS client can't run raw DDL, so we just verify the column exists
    // by doing a select
    const { data, error: selErr } = await supabase
      .from('followed_anime')
      .select('image')
      .limit(1);
    
    if (selErr && selErr.message.includes('column')) {
      console.error('❌ The "image" column does NOT exist in followed_anime.');
      console.error('Please run this SQL in Supabase SQL Editor:');
      console.error('  ALTER TABLE followed_anime ADD COLUMN image TEXT;');
      process.exit(1);
    } else {
      console.log('✅ The "image" column already exists or was just added.');
    }
  } else {
    console.log('✅ Migration complete: image column added.');
  }
  process.exit(0);
})();
