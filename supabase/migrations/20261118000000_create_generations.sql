-- MeshForge Initial Schema: Generations Table & RLS Policies

-- 1. Create generations table
CREATE TABLE IF NOT EXISTS public.generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'image',
    source_image_path TEXT,
    model_path TEXT,
    status TEXT NOT NULL DEFAULT 'processing',
    quality TEXT DEFAULT 'Standard',
    generation_time NUMERIC(6, 2),
    file_size BIGINT,
    vertex_count INTEGER,
    face_count INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for user lookups and chronological ordering
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON public.generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON public.generations(created_at DESC);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies: Users may only access and manipulate their own rows
CREATE POLICY "Users can view their own generations"
    ON public.generations
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own generations"
    ON public.generations
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own generations"
    ON public.generations
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own generations"
    ON public.generations
    FOR DELETE
    USING (auth.uid() = user_id);

-- 4. Setup Storage Bucket for Models (Private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'models',
    'models',
    false,
    104857600, -- 100MB limit
    ARRAY['model/gltf-binary', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE
SET public = false;

-- Storage RLS Policies
CREATE POLICY "Authenticated users can upload models to their own folder"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'models' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Authenticated users can view/download their own models"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'models' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Authenticated users can delete their own models"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'models' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );
