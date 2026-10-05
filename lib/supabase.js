/**
 * Supabase client – single shared instance used by every module.
 *
 * Reads SUPABASE_URL and SUPABASE_KEY from the .env file (loaded by
 * dotenv in server.js before any other module is required).
 */

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "[supabase] Missing SUPABASE_URL or SUPABASE_KEY in .env file.\n" +
    "  Make sure your .env contains both variables and that dotenv is loaded first."
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };
