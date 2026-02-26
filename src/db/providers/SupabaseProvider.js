'use strict';

const DatabaseProvider = require('../DatabaseProvider');

/**
 * SupabaseProvider requires a `users` table with the following columns:
 *   id uuid primary key default gen_random_uuid()
 *   name text not null
 *   email text not null unique
 *   password text not null
 *   role text not null
 *   created_by text
 *   created_at timestamptz default now()
 *   updated_at timestamptz default now()
 */
class SupabaseProvider extends DatabaseProvider {
  /**
   * @param {string} url
   * @param {string} key - service_role key (full access, never expose to client)
   */
  constructor(url, key) {
    super();
    this._url    = url;
    this._key    = key;
    this._client = null;
  }

  async connect() {
    if (!this._url || !this._key) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_ANON_KEY are required for SupabaseProvider'
      );
    }

    let createClient;
    try {
      ({ createClient } = require('@supabase/supabase-js'));
    } catch {
      throw new Error(
        '@supabase/supabase-js is required for SupabaseProvider. Run: npm install @supabase/supabase-js'
      );
    }

    this._client = createClient(this._url, this._key);

    // Verify connectivity with a lightweight probe
    const { error } = await this._client.from('users').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Supabase connection probe failed: ${error.message}`);
    }
  }

  async disconnect() {
    this._client = null;
  }

  async createUser(data) {
    const now = new Date().toISOString();
    const { data: row, error } = await this._client
      .from('users')
      .insert({
        name:       data.name,
        email:      data.email.toLowerCase(),
        password:   data.password,
        role:       data.role,
        created_by: data.createdBy ?? null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    if (error) throw new Error(`createUser failed: ${error.message}`);
    return this._toPlain(row);
  }

  async findUserByEmail(email) {
    const { data: row, error } = await this._client
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (error) throw new Error(`findUserByEmail failed: ${error.message}`);
    return row ? this._toPlain(row) : null;
  }

  async findUserById(id) {
    const { data: row, error } = await this._client
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`findUserById failed: ${error.message}`);
    return row ? this._toPlain(row) : null;
  }

  async listUsers() {
    const { data: rows, error } = await this._client.from('users').select('*');
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    return (rows ?? []).map((r) => this._toPlain(r));
  }

  async updateUser(id, data) {
    const update = { updated_at: new Date().toISOString() };
    if (data.name     !== undefined) update.name     = data.name;
    if (data.email    !== undefined) update.email    = data.email.toLowerCase();
    if (data.password !== undefined) update.password = data.password;
    if (data.role     !== undefined) update.role     = data.role;

    const { data: row, error } = await this._client
      .from('users')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`updateUser failed: ${error.message}`);
    return this._toPlain(row);
  }

  async deleteUser(id) {
    const { error } = await this._client
      .from('users')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`deleteUser failed: ${error.message}`);
  }

  _toPlain(row) {
    return {
      id:        String(row.id),
      name:      row.name,
      email:     row.email,
      password:  row.password,
      role:      row.role,
      createdBy: row.created_by ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = SupabaseProvider;
