const { app, BrowserWindow } = require('electron')
const { copyFile, mkdir, readFile, writeFile } = require('node:fs/promises')
const { dirname, join, resolve } = require('node:path')

const rootDir = resolve(__dirname, '..')
const assetsDir = join(rootDir, 'assets')
const publicDir = join(rootDir, 'public')
const sourceSvgPath = join(assetsDir, 'icon.svg')
const pngSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
const icoSizes = new Set([16, 32, 48, 64, 128, 256])

function iconDirEntry({ size, png }, imageOffset) {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size === 256 ? 0 : size, 0)
  entry.writeUInt8(size === 256 ? 0 : size, 1)
  entry.writeUInt8(0, 2)
  entry.writeUInt8(0, 3)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(imageOffset, 12)
  return entry
}

function makeIco(images) {
  const headerSize = 6
  const entrySize = 16
  let imageOffset = headerSize + entrySize * images.length

  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const entries = images.map((image) => {
    const entry = iconDirEntry(image, imageOffset)
    imageOffset += image.png.length
    return entry
  })

  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)])
}

function stripExternalDoctype(svgText) {
  return svgText.replace(/<!DOCTYPE[\s\S]*?>\s*/i, '')
}

async function createRenderer() {
  const window = new BrowserWindow({
    height: 256,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    width: 256,
  })

  await window.loadURL('data:text/html;charset=utf-8,<html><body></body></html>')
  return window
}

async function renderPng(window, svgText, size) {
  const dataUrl = await window.webContents.executeJavaScript(
    `new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas')
      canvas.width = ${size}
      canvas.height = ${size}

      const image = new Image()
      const svgUrl = URL.createObjectURL(new Blob([${JSON.stringify(svgText)}], { type: 'image/svg+xml' }))

      image.onload = () => {
        const context = canvas.getContext('2d')
        context.clearRect(0, 0, ${size}, ${size})
        context.drawImage(image, 0, 0, ${size}, ${size})
        URL.revokeObjectURL(svgUrl)
        resolve(canvas.toDataURL('image/png'))
      }

      image.onerror = () => {
        URL.revokeObjectURL(svgUrl)
        reject(new Error('Failed to render SVG at ${size}px'))
      }

      image.src = svgUrl
    })`,
  )

  const data = String(dataUrl).replace(/^data:image\/png;base64,/, '')
  return Buffer.from(data, 'base64')
}

async function writePng(window, svgText, size, targetPath) {
  const png = await renderPng(window, svgText, size)
  if (png.length === 0) throw new Error(`Failed to render ${targetPath}`)
  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, png)
  return png
}

async function main() {
  await mkdir(assetsDir, { recursive: true })
  await mkdir(publicDir, { recursive: true })

  const svgText = stripExternalDoctype(await readFile(sourceSvgPath, 'utf8'))
  const window = await createRenderer()

  try {
    const icoImages = []
    for (const size of pngSizes) {
      const png = await writePng(window, svgText, size, join(assetsDir, `icon-${size}.png`))
      if (size === 512) await writeFile(join(assetsDir, 'icon.png'), png)
      if (icoSizes.has(size)) icoImages.push({ png, size })
    }

    await writeFile(join(assetsDir, 'icon.ico'), makeIco(icoImages))
    await copyFile(sourceSvgPath, join(publicDir, 'favicon.svg'))
  } finally {
    if (!window.isDestroyed()) window.destroy()
  }

  console.log(`Generated ${pngSizes.length} PNG files, icon.png, icon.ico, and public/favicon.svg`)
}

app
  .whenReady()
  .then(main)
  .then(() => {
    app.exit(0)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
