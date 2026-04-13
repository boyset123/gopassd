/** Supports legacy `/uploads/...` paths and full URLs (e.g. Cloudinary `secure_url`). */
export function profilePictureUri(
  pathOrUrl: string | undefined,
  apiBaseUrl: string,
  placeholder: string
): string {
  if (!pathOrUrl) return placeholder;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${apiBaseUrl.replace(/\/$/, '')}${path}`;
}
