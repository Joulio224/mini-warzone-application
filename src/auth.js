// ---------------------------------------------------------------------------
// Comptes joueurs (Firebase Auth par email/mot de passe + doc Firestore)
// ---------------------------------------------------------------------------
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase.js';

// callback(user | null) — appelé immédiatement puis à chaque changement d'état
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signUp(email, password, pseudo) {
  const cleanPseudo = pseudo.trim();
  if (cleanPseudo.length < 3) {
    throw new Error('Le pseudo doit faire au moins 3 caractères.');
  }
  if (cleanPseudo.length > 20) {
    throw new Error('Le pseudo doit faire moins de 20 caractères.');
  }

  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: cleanPseudo });

  // Doc public minimal, utilisé pour la recherche d'amis par pseudo.
  await setDoc(doc(db, 'users', credential.user.uid), {
    pseudo: cleanPseudo,
    pseudoLower: cleanPseudo.toLowerCase(),
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  });

  return credential.user;
}

export async function signIn(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, 'users', credential.user.uid), {
    lastSeenAt: serverTimestamp(),
  }, { merge: true });
  return credential.user;
}

export async function deleteAccountUser(password) {
  const user = auth.currentUser;
  if (!user) throw new Error('Aucun compte connecté.');
  if (!user.email) throw new Error('Ce compte ne possède pas d’adresse email compatible avec cette confirmation.');

  try {
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
  } catch (error) {
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      throw new Error('Mot de passe incorrect.');
    }
    if (error.code === 'auth/too-many-requests') {
      throw new Error('Trop de tentatives. Réessaie plus tard.');
    }
    throw error;
  }

  const serverUrl = import.meta.env.VITE_REALTIME_SERVER_URL || 'http://localhost:3001';
  const token = await user.getIdToken(true);
  const response = await fetch(`${serverUrl.replace(/\/$/, '')}/account/delete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  let result = {};
  try { result = await response.json(); } catch {}
  if (!response.ok || result.success !== true) {
    throw new Error(result.error || 'Impossible de supprimer le compte.');
  }

  // Nettoyage des préférences locales associées à cette installation.
  for (const key of ['mw_appearance', 'mw_keybinds', 'mw_settings', `mw_chat_read_${user.uid}`]) {
    localStorage.removeItem(key);
  }

  await signOut(auth);
}

export async function signOutUser() {
  await signOut(auth);
}

// Traduit les codes d'erreur Firebase en messages compréhensibles pour un lycéen
export function friendlyAuthError(error) {
  const map = {
    'auth/email-already-in-use': 'Ce compte existe déjà — connecte-toi plutôt.',
    'auth/invalid-email': 'Adresse email invalide.',
    'auth/weak-password': 'Mot de passe trop court (6 caractères minimum).',
    'auth/invalid-credential': 'Email ou mot de passe incorrect.',
    'auth/wrong-password': 'Email ou mot de passe incorrect.',
    'auth/user-not-found': 'Aucun compte avec cet email.',
    'auth/too-many-requests': 'Trop de tentatives — réessaie dans un moment.',
  };
  return map[error.code] || error.message;
}
