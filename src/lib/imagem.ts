// ============================================================
// P2 - Fotos de produtos: compressão NO APARELHO antes de subir.
// Redimensiona para máx. 1000px e converte para JPEG (~100-300KB),
// poupando dados da rede (Vodacom/Movitel) e evitando o limite
// de 4.5MB das funções serverless da Vercel.
// ============================================================

export type ImagemPayload = { data: string; mime: string };

export async function ficheiroParaJpeg(file: File, maxDim = 1000, quality = 0.82): Promise<ImagemPayload> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um ficheiro de imagem (JPG/PNG)");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Não foi possível ler o ficheiro"));
    fr.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Formato de imagem não suportado pelo navegador - use JPG ou PNG"));
    im.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Navegador sem suporte para processar imagem");
  ctx.fillStyle = "#ffffff"; // fundo branco p/ PNG transparente (perfumes em fundo claro)
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const jpeg = canvas.toDataURL("image/jpeg", quality);
  return { data: jpeg.split(",")[1] ?? "", mime: "image/jpeg" };
}

export function dataUrlParaPayload(dataUrl: string): ImagemPayload {
  const [head, data = ""] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "image/jpeg";
  return { data, mime };
}

// ============================================================
// v3.3 - Foto de PERFIL (avatar do login): crop QUADRADO centrado
// (rostos ficam no meio) + redimensiona para máx. 320px JPEG q0.85
// (~15-35KB) - cabe na coluna photoUrl e sobe rápido na rede da
// Vodacom/Movitel. Devolve o data URL COMPLETO pronto a gravar.
// ============================================================
export async function ficheiroParaAvatar(file: File, maxDim = 320, quality = 0.85): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um ficheiro de imagem (JPG/PNG)");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Não foi possível ler o ficheiro"));
    fr.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Formato de imagem não suportado pelo navegador - use JPG ou PNG"));
    im.src = dataUrl;
  });

  // crop quadrado centrado (a foto de perfil corta pelo meio, como WhatsApp/Instagram)
  const lado = Math.min(img.width, img.height);
  const sx = (img.width - lado) / 2;
  const sy = (img.height - lado) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = maxDim;
  canvas.height = maxDim;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Navegador sem suporte para processar imagem");
  ctx.drawImage(img, sx, sy, lado, lado, 0, 0, maxDim, maxDim);
  return canvas.toDataURL("image/jpeg", quality);
}
