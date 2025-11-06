// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yszddgrshowndfouborm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzemRkZ3JzaG93bmRmb3Vib3JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTcxNDMsImV4cCI6MjA3NzkzMzE0M30.wHYapijM12SQmzq3a4HnFBKj0kY5iZ9bslaiD3aSZDg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);