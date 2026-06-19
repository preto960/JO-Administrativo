import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

// Allowed mime types for upload
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
])

// Max file size: 2MB
const MAX_SIZE = 2 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const folder = (formData.get('folder') as string) || 'uploads'

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó ningún archivo' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Tipo de archivo no permitido' }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'El archivo no debe superar 2MB' }, { status: 400 })
    }

    // Generate a unique filename preserving the original extension
    const ext = file.name.split('.').pop() || 'bin'
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const blob = await put(`${folder}/${safeName}`, file, {
      access: 'public',
      addRandomSuffix: false,
    })

    return NextResponse.json({ url: blob.url })
  } catch (error: any) {
    console.error('[POST /api/upload]', error)
    // Provide a clear message if the blob token is missing
    if (error?.message?.includes('BLOB_READ_WRITE_TOKEN')) {
      return NextResponse.json(
        { error: 'Token de almacenamiento no configurado. Agrega BLOB_READ_WRITE_TOKEN en las variables de entorno de Vercel.' },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: 'Error al subir archivo' }, { status: 500 })
  }
}