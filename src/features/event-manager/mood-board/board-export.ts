function sanitizeFileName(title: string) {
  const cleaned = title.trim().replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "")
  return cleaned || "mood-board"
}

function triggerDownload(href: string, filename: string) {
  const link = Object.assign(document.createElement("a"), {
    href,
    download: filename,
  })
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

async function waitForBoardAssets(container: HTMLElement) {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready.catch(() => {})
  }
  const images = Array.from(container.querySelectorAll("img"))
  await Promise.all(
    images.map((img) =>
      typeof img.decode === "function" ? img.decode().catch(() => {}) : Promise.resolve(),
    ),
  )
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIndex = dataUrl.indexOf(",")
  if (commaIndex === -1) {
    throw new Error("Invalid image data URL.")
  }
  const binary = atob(dataUrl.slice(commaIndex + 1))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export type PdfPageInput = {
  jpegBytes: Uint8Array
  pixelWidth: number
  pixelHeight: number
  pageWidthPt: number
  pageHeightPt: number
}

/**
 * Builds a PDF 1.4 document with one page per board page using DCTDecode (JPEG)
 * image XObjects so each page preserves exact dimensions, colors, fonts, and layout.
 */
export function buildPdfFromJpegPages(pages: PdfPageInput[]): Uint8Array {
  if (pages.length === 0) {
    throw new Error("At least one page is required to build a PDF.")
  }

  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  let offset = 0

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes)
    offset += bytes.length
  }
  const pushText = (text: string) => {
    pushBytes(encoder.encode(text))
  }

  // PDF 1.4 header + binary comment marker
  pushText("%PDF-1.4\n")
  pushBytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

  const totalObjects = 2 + pages.length * 3
  const offsets = new Array<number>(totalObjects + 1).fill(0)

  const beginObj = (id: number) => {
    offsets[id] = offset
    pushText(`${id} 0 obj\n`)
  }
  const endObj = () => {
    pushText("\nendobj\n")
  }

  const pageIds = pages.map((_, index) => 3 + index * 3)

  // 1: Catalog
  beginObj(1)
  pushText("<< /Type /Catalog /Pages 2 0 R >>")
  endObj()

  // 2: Pages tree
  beginObj(2)
  pushText(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`)
  endObj()

  // 3..N: Page, Content stream, Image XObject per page
  pages.forEach((page, index) => {
    const pageObjId = 3 + index * 3
    const contentObjId = pageObjId + 1
    const imageObjId = pageObjId + 2
    const imageName = `Im${index + 1}`

    const widthPt = Number(page.pageWidthPt.toFixed(2))
    const heightPt = Number(page.pageHeightPt.toFixed(2))
    const contentStream = `q\n${widthPt} 0 0 ${heightPt} 0 0 cm\n/${imageName} Do\nQ\n`
    const contentBytes = encoder.encode(contentStream)

    beginObj(pageObjId)
    pushText(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] ` +
        `/Resources << /XObject << /${imageName} ${imageObjId} 0 R >> >> ` +
        `/Contents ${contentObjId} 0 R >>`,
    )
    endObj()

    beginObj(contentObjId)
    pushText(`<< /Length ${contentBytes.length} >>\nstream\n`)
    pushBytes(contentBytes)
    pushText("endstream")
    endObj()

    beginObj(imageObjId)
    pushText(
      `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.length} >>\nstream\n`,
    )
    pushBytes(page.jpegBytes)
    pushText("\nendstream")
    endObj()
  })

  const xrefOffset = offset
  pushText(`xref\n0 ${totalObjects + 1}\n`)
  pushText("0000000000 65535 f \n")
  for (let id = 1; id <= totalObjects; id++) {
    pushText(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`)
  }
  pushText(`trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)

  const result = new Uint8Array(offset)
  let cursor = 0
  for (const chunk of chunks) {
    result.set(chunk, cursor)
    cursor += chunk.length
  }
  return result
}

export async function exportBoardAsPng({
  captureEl,
  title,
  backgroundColor,
}: {
  captureEl: HTMLElement
  title: string
  backgroundColor: string
}) {
  await waitForBoardAssets(captureEl)
  const { toPng } = await import("html-to-image")
  const dataUrl = await toPng(captureEl, {
    pixelRatio: 2,
    cacheBust: false,
    backgroundColor,
  })
  triggerDownload(dataUrl, `${sanitizeFileName(title)}.png`)
}

export async function exportBoardAsPdf({
  captureEl,
  title,
  pageBackgrounds,
  fallbackBackground,
}: {
  captureEl: HTMLElement
  title: string
  pageBackgrounds: string[]
  fallbackBackground: string
}) {
  const pageElements = Array.from(captureEl.children).filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  )
  if (pageElements.length === 0) {
    throw new Error("No mood board pages available to export.")
  }

  await waitForBoardAssets(captureEl)
  const { toCanvas } = await import("html-to-image")

  const pdfPages: PdfPageInput[] = []
  for (let i = 0; i < pageElements.length; i++) {
    const pageEl = pageElements[i]
    const backgroundColor = pageBackgrounds[i] || fallbackBackground
    const logicalWidth = pageEl.offsetWidth || 800
    const logicalHeight = pageEl.offsetHeight || 450

    const canvas = await toCanvas(pageEl, {
      pixelRatio: 2,
      cacheBust: false,
      backgroundColor,
    })
    if (!canvas.width || !canvas.height) {
      throw new Error(`Failed to render page ${i + 1} for PDF export.`)
    }

    const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.95)
    pdfPages.push({
      jpegBytes: dataUrlToBytes(jpegDataUrl),
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
      // Convert 96 DPI CSS px to 72 DPI PDF points (exact 16:9 ratio preserved).
      pageWidthPt: logicalWidth * 0.75,
      pageHeightPt: logicalHeight * 0.75,
    })
  }

  const pdfBytes = buildPdfFromJpegPages(pdfPages)
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" })
  downloadBlob(blob, `${sanitizeFileName(title)}.pdf`)
}

