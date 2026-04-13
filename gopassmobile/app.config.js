const fs = require('fs');
const path = require('path');

/**
 * EAS Build: file env `GOOGLE_SERVICES_JSON` (Preview) → path on the builder.
 * Local: optional ./google-services.json (gitignored).
 * @see https://docs.expo.dev/eas/environment-variables/faq/
 */
function assertFirebaseAndroidGoogleServices(resolvedPath) {
  if (!fs.existsSync(resolvedPath)) {
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch {
    throw new Error(
      `[app.config] "${resolvedPath}" is not valid JSON. Re-upload GOOGLE_SERVICES_JSON on EAS (Preview) with Firebase → Project settings → Your apps → Android → google-services.json.`
    );
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`[app.config] "${resolvedPath}" is not a JSON object.`);
  }
  if (parsed.type === 'service_account') {
    throw new Error(
      '[app.config] GOOGLE_SERVICES_JSON points to a Service Account key (admin SDK), not an Android client file. ' +
        'On expo.dev delete this variable, then add a new one: type FILE, name GOOGLE_SERVICES_JSON, environment Preview, ' +
        'value = file downloaded from Firebase → Project settings → Your apps → Android app (package com.anonymous.gopassmobile) → google-services.json. ' +
        'That file must contain "project_info", not "private_key".'
    );
  }
  if (!('project_info' in parsed)) {
    throw new Error(
      '[app.config] google-services file is missing "project_info". ' +
        'Use only the Android google-services.json from Firebase (Your apps → Android), not any other JSON.'
    );
  }
}

/** @param {{ config: import('expo/config').ExpoConfig }} ctx */
module.exports = ({ config }) => {
  const android = config.android;
  if (!android) {
    return config;
  }

  const fromEnvRaw = process.env.GOOGLE_SERVICES_JSON?.trim();
  // EAS FILE vars are a filesystem path. A string that starts with "{" is almost always a mis-set plain-text var.
  if (fromEnvRaw && fromEnvRaw.startsWith('{')) {
    throw new Error(
      '[app.config] GOOGLE_SERVICES_JSON must be an Expo variable of type FILE (upload the file). ' +
        'Do not paste JSON into a string/sensitive variable. expo.dev → Environment variables → remove wrong entry → Add → FILE → Preview.'
    );
  }

  const fromEnv = fromEnvRaw;
  const localRel = './google-services.json';
  const localAbs = path.join(__dirname, localRel);
  const googleServicesFile = fromEnv
    ? fromEnv
    : fs.existsSync(localAbs)
      ? localRel
      : undefined;

  if (googleServicesFile) {
    const resolved = path.isAbsolute(googleServicesFile)
      ? googleServicesFile
      : path.join(__dirname, googleServicesFile);
    assertFirebaseAndroidGoogleServices(resolved);
  }

  return {
    ...config,
    android: {
      ...android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
