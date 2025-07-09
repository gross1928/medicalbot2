const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase URL or Key not found in .env file');
    // We don't want to exit the process here, because the bot might be used without DB
    // But we should handle functions that use supabase to check if it's available
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
