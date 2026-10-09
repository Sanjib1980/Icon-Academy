import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Authoritative Supabase Client Module
 * 
 * Configured using VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
 * Connects directly to the central PostgreSQL database for persistent admission management.
 */

export function getStoredSupabaseConfig(): { url: string; anonKey: string } {
  let url =
    (import.meta.env?.VITE_SUPABASE_URL as string) ||
    (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_URL : '') ||
    '';
  let anonKey =
    (import.meta.env?.VITE_SUPABASE_ANON_KEY as string) ||
    (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_ANON_KEY : '') ||
    '';

  // Allow runtime override via Admin Settings if provided
  try {
    if (typeof localStorage !== 'undefined') {
      const storedUrl = localStorage.getItem('iait_supabase_url');
      const storedKey = localStorage.getItem('iait_supabase_anon_key');
      if (storedUrl && storedUrl.trim()) url = storedUrl.trim();
      if (storedKey && storedKey.trim()) anonKey = storedKey.trim();
    }
  } catch {
    // Ignore storage errors
  }

  return { url: url.trim(), anonKey: anonKey.trim() };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getStoredSupabaseConfig();
  return Boolean(
    url &&
    (url.startsWith('https://') || url.startsWith('http://')) &&
    !url.includes('placeholder.supabase.co') &&
    anonKey &&
    anonKey.length > 15 &&
    !anonKey.includes('placeholder-anon-key')
  );
}

export const STORAGE_BUCKET_DOCUMENTS = 'iait-documents';

let clientInstance: SupabaseClient | null = null;
let lastUsedUrl = '';
let lastUsedKey = '';

export function getSupabase(): SupabaseClient {
  const { url, anonKey } = getStoredSupabaseConfig();
  const effectiveUrl = url || 'https://placeholder.supabase.co';
  const effectiveKey = anonKey || 'placeholder-anon-key';

  if (!clientInstance || effectiveUrl !== lastUsedUrl || effectiveKey !== lastUsedKey) {
    clientInstance = createClient(effectiveUrl, effectiveKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'x-client-info': 'iait-kaliabor-portal@2.0.0',
        },
      },
    });
    lastUsedUrl = effectiveUrl;
    lastUsedKey = effectiveKey;
  }

  return clientInstance;
}

export const supabase: SupabaseClient = getSupabase();

export function saveSupabaseConfig(url: string, anonKey: string): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      if (url.trim()) {
        localStorage.setItem('iait_supabase_url', url.trim());
      } else {
        localStorage.removeItem('iait_supabase_url');
      }

      if (anonKey.trim()) {
        localStorage.setItem('iait_supabase_anon_key', anonKey.trim());
      } else {
        localStorage.removeItem('iait_supabase_anon_key');
      }
    }
    clientInstance = null; // Reset cached client instance
    return true;
  } catch {
    return false;
  }
}

/**
 * Cloud Storage Helper: Upload a file (Blob, Uint8Array, or base64 Data URL) to Supabase Storage
 */
export async function uploadToStorage(
  bucket: string,
  filePath: string,
  fileData: Blob | Uint8Array | string,
  contentType: string = 'image/jpeg'
): Promise<{ publicUrl: string | null; error: Error | null }> {
  try {
    if (!isSupabaseConfigured()) {
      return { publicUrl: null, error: new Error('Supabase is not configured') };
    }

    const client = getSupabase();
    let uploadPayload: Blob | Uint8Array;
    let mimeType = contentType;

    if (typeof fileData === 'string') {
      if (fileData.startsWith('data:')) {
        const parts = fileData.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        if (mimeMatch) mimeType = mimeMatch[1];
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        uploadPayload = new Blob([u8arr], { type: mimeType });
      } else {
        return { publicUrl: fileData, error: null };
      }
    } else {
      uploadPayload = fileData;
    }

    const { error: uploadError } = await client.storage
      .from(bucket)
      .upload(filePath, uploadPayload, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      return { publicUrl: null, error: uploadError };
    }

    const { data: urlData } = client.storage.from(bucket).getPublicUrl(filePath);
    return { publicUrl: urlData?.publicUrl || null, error: null };
  } catch (err: any) {
    return { publicUrl: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Cloud Storage Helper: Get public URL for a stored file
 */
export function getPublicUrl(bucket: string, path: string): string {
  if (!isSupabaseConfigured()) return '';
  const client = getSupabase();
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || '';
}

export default supabase;
