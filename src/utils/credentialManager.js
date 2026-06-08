import { registerPlugin, Capacitor } from '@capacitor/core';

const NativeCredentialManager = registerPlugin('NativeCredentialManager');

export const isNativeCredentialAvailable = () => {
  return Capacitor.getPlatform() === 'android';
};

export const signInWithCredentialManager = async () => {
  if (!isNativeCredentialAvailable()) throw new Error('Not available on this platform');
  return await NativeCredentialManager.getCredential();
};

export const savePasswordCredential = async (email, password) => {
  if (!isNativeCredentialAvailable()) return;
  return await NativeCredentialManager.savePassword({ email, password });
};