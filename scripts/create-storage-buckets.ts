import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const buckets = [
  {
    id: 'event-photos',
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  },
  {
    id: 'speaker-handouts',
    public: false,
    fileSizeLimit: 20 * 1024 * 1024,
    allowedMimeTypes: [
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
  },
  {
    id: 'org-assets',
    public: true,
    fileSizeLimit: 2 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
  },
  {
    id: 'event-assets',
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  {
    id: 'user-avatars',
    public: true,
    fileSizeLimit: 2 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  {
    id: 'event-documents',
    public: false,
    fileSizeLimit: 20 * 1024 * 1024,
    allowedMimeTypes: [
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },
]

async function createBuckets() {
  for (const bucket of buckets) {
    const { data, error } = await supabase.storage.createBucket(bucket.id, {
      public: bucket.public,
      fileSizeLimit: bucket.fileSizeLimit,
      allowedMimeTypes: bucket.allowedMimeTypes,
    })
    if (error && !error.message.includes('already exists')) {
      console.error(`FAILED to create bucket ${bucket.id}:`, error.message)
    } else {
      console.log(`OK bucket: ${bucket.id} (${bucket.public ? 'public' : 'private'})`)
    }
  }
}

createBuckets().catch(console.error)
