import type { ExpoConfig } from 'expo/config';

/**
 * Lets EAS Build inject `google-services.json` via a file env var when the file
 * is gitignored. See: https://docs.expo.dev/eas/environment-variables/faq/
 */
export default ({ config }: { config: ExpoConfig }): ExpoConfig => {
  const android = config.android;
  if (!android) {
    return config;
  }
  return {
    ...config,
    android: {
      ...android,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? android.googleServicesFile,
    },
  };
};
