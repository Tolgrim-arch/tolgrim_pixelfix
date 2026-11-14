export function exportImageDataAsPng(imageData: ImageData, scale: number, filename = 'pixelfix-output.png'): void {
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = imageData.width;
  srcCanvas.height = imageData.height;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) return;
  srcCtx.putImageData(imageData, 0, 0);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = imageData.width * scale;
  outCanvas.height = imageData.height * scale;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return;

  outCtx.imageSmoothingEnabled = false;
  outCtx.drawImage(srcCanvas, 0, 0, outCanvas.width, outCanvas.height);

  outCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
