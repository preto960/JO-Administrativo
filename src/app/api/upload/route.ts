import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_SIZE = 2 * 1024 * 1024 // 2MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No se envió ningún archivo' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Tipo de archivo no soportado. Usa JPG, PNG, GIF o WebP.' }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'El archivo no debe superar 2MB' }, { status: 400 })
    }

    // Ensure uploads directory exists
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadsDir, { recursive: true })

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'jpg'
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const filePath = path.join(uploadsDir, uniqueName)

    // Write file
    const bytes = await file.arrayBuffer()
    await writeFile(filePath, Buffer.from(bytes))

    const url = `/uploads/${uniqueName}`

    return NextResponse.json({ url })
  } catch (error) {
    console.error('[Upload] Error:', error)
    return NextResponse.json({ error: 'Error al subir archivo' }, { status: 500 })
  }
}
