import { Asset } from 'expo-asset';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';

/**
 * Bundled image → data URI for expo-print HTML (WKWebView cannot load local asset paths).
 */
export async function assetToImageDataUri(assetModule: number): Promise<string> {
  const asset = Asset.fromModule(assetModule);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) {
    throw new Error('Could not resolve bundled image for PDF.');
  }
  const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  const lower = uri.toLowerCase();
  const mime = lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${base64}`;
}
