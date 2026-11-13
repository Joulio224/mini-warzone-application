// ---------------------------------------------------------------------------
// Réglages et lancement de la partie d'un groupe
// ---------------------------------------------------------------------------
// groups/{groupId}.settings = { elimination: bool, regen: bool }
// groups/{groupId}.match    = { status: 'running' | 'idle', startedAt }
//
// Seuls le créateur (ownerId) et l'admin du groupe (adminId) peuvent les
// modifier : c'est imposé par firestore.rules, pas seulement par l'interface.
// Le serveur de jeu relit ces champs lui-même dans Firestore (server.js) :
// il refuse l'entrée tant que la partie n'est pas « running » et applique
// les réglages à tous les joueurs du groupe.
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase.js';

export const DEFAULT_GROUP_SETTINGS = { elimination: false, regen: false };

// Ajouter un réglage = une ligne ici (+ son application dans server.js).
const SETTING_DEFS = [
  {
    key: 'elimination',
    label: 'Mode éliminatoire',
    help:
      'Un joueur tué est éliminé jusqu\'à la fin de la partie, au lieu de réapparaître. ' +
      'La partie se termine quand il ne reste qu\'un joueur (ou une équipe en mode Équipes).',
  },
  {
    key: 'regen',
    label: 'Régénération de la vie',
    help: 'La vie remonte toute seule après 5 secondes sans subir de dégâts (le bouclier ne se régénère pas).',
  },
];

export function getGroupSettings(group) {
  return { ...DEFAULT_GROUP_SETTINGS, ...(group?.settings || {}) };
}

export function canManageGroup(group, uid) {
  return Boolean(group && uid && (group.ownerId === uid || group.adminId === uid));
}

export function isMatchRunning(group) {
  return group?.match?.status === 'running';
}

export async function setGroupSetting(groupId, key, value) {
  if (!SETTING_DEFS.some((s) => s.key === key)) return;
  await updateDoc(doc(db, 'groups', groupId), { [`settings.${key}`]: value === true });
}

export async function startGroupMatch(groupId) {
  await updateDoc(doc(db, 'groups', groupId), {
    'match.status': 'running',
    'match.startedAt': serverTimestamp(),
  });
}

export async function stopGroupMatch(groupId) {
  await updateDoc(doc(db, 'groups', groupId), { 'match.status': 'idle' });
}

// --- Interface -----------------------------------------------------------------
let styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .lobby-tab-home, .group-item { position: relative; }
    .play-button-big:disabled { opacity: 0.55; cursor: not-allowed; }
    .gear-button {
      position: absolute; top: 10px; right: 10px;
      width: 36px; height: 36px; padding: 0;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 1.25rem; line-height: 1; border-radius: 50%;
      background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2);
      cursor: pointer;
    }
    .gear-button:hover { background: rgba(255,255,255,0.2); }
    #gs-backdrop {
      position: fixed; inset: 0; z-index: 1500; display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.6); padding: 16px; box-sizing: border-box;
    }
    #gs-modal {
      width: min(460px, 100%); max-height: 90vh; overflow: auto; box-sizing: border-box;
      background: #1b1b22; color: #eee; border: 1px solid #333; border-radius: 12px; padding: 20px;
      font: 15px/1.5 system-ui, sans-serif; text-align: left;
    }
    #gs-modal h3 { margin: 0 0 4px; font-size: 1.15rem; }
    #gs-modal .gs-sub { margin: 0 0 14px; color: #aaa; font-size: 0.85rem; }
    #gs-modal .gs-row { display: flex; gap: 12px; align-items: flex-start; padding: 10px 0; border-top: 1px solid #2c2c36; }
    #gs-modal .gs-row input { width: 20px; height: 20px; flex: none; margin-top: 2px; cursor: pointer; }
    #gs-modal .gs-row strong { display: block; }
    #gs-modal .gs-row span { color: #aaa; font-size: 0.82rem; }
    #gs-modal .gs-match { border-top: 1px solid #2c2c36; padding-top: 12px; margin-top: 4px; }
    #gs-modal .gs-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
    #gs-modal .gs-error { color: #ff8f8f; font-size: 0.85rem; min-height: 1em; margin: 8px 0 0; }
  `;
  document.head.appendChild(style);
}

export function createGearButton(onClick) {
  injectStyle();
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'gear-button secondary';
  button.textContent = '⚙';
  button.title = 'Paramètres de la partie';
  button.setAttribute('aria-label', 'Paramètres de la partie');
  button.addEventListener('click', onClick);
  return button;
}

let openState = null; // { groupId, uid, modalEl, backdropEl }

function closeModal() {
  openState?.backdropEl.remove();
  openState = null;
}

function renderModal(group) {
  const { modalEl } = openState;
  const settings = getGroupSettings(group);
  const running = isMatchRunning(group);
  modalEl.innerHTML = '';

  const title = document.createElement('h3');
  title.textContent = 'Paramètres de la partie';
  modalEl.appendChild(title);
  const sub = document.createElement('p');
  sub.className = 'gs-sub';
  sub.textContent = `Groupe « ${group.name} »`;
  modalEl.appendChild(sub);

  const errorEl = document.createElement('p');
  errorEl.className = 'gs-error';

  SETTING_DEFS.forEach(({ key, label, help }) => {
    const row = document.createElement('label');
    row.className = 'gs-row';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = settings[key] === true;
    input.addEventListener('change', () => {
      errorEl.textContent = '';
      setGroupSetting(group.id, key, input.checked).catch((error) => {
        input.checked = !input.checked;
        errorEl.textContent = error.message || 'Impossible de modifier ce réglage.';
      });
    });
    const text = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = label;
    const small = document.createElement('span');
    small.textContent = help;
    text.append(strong, small);
    row.append(input, text);
    modalEl.appendChild(row);
  });

  const match = document.createElement('div');
  match.className = 'gs-match';
  const status = document.createElement('strong');
  status.textContent = running ? 'Partie en cours' : 'Partie non lancée';
  match.appendChild(status);
  const matchHelp = document.createElement('span');
  matchHelp.style.cssText = 'display:block;color:#aaa;font-size:0.82rem';
  matchHelp.textContent = running
    ? 'Les membres du groupe peuvent la rejoindre. Les changements de réglages s\'appliquent tout de suite.'
    : 'Personne ne peut entrer en jeu tant qu\'elle n\'est pas lancée : utilise le bouton « Lancer la partie » de l\'accueil.';
  match.appendChild(matchHelp);
  modalEl.appendChild(match);
  modalEl.appendChild(errorEl);

  const actions = document.createElement('div');
  actions.className = 'gs-actions';
  if (running) {
    const stopButton = document.createElement('button');
    stopButton.type = 'button';
    stopButton.className = 'secondary';
    stopButton.textContent = 'Arrêter la partie';
    stopButton.addEventListener('click', () => {
      if (!window.confirm('Arrêter la partie ? Tous les joueurs reviendront au lobby.')) return;
      stopGroupMatch(group.id).catch((error) => {
        errorEl.textContent = error.message || 'Impossible d\'arrêter la partie.';
      });
    });
    actions.appendChild(stopButton);
  }
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Fermer';
  closeButton.addEventListener('click', closeModal);
  actions.appendChild(closeButton);
  modalEl.appendChild(actions);
}

export function openGroupSettings(group, uid) {
  if (!canManageGroup(group, uid)) return;
  injectStyle();
  closeModal();
  const backdropEl = document.createElement('div');
  backdropEl.id = 'gs-backdrop';
  const modalEl = document.createElement('div');
  modalEl.id = 'gs-modal';
  backdropEl.appendChild(modalEl);
  backdropEl.addEventListener('click', (event) => {
    if (event.target === backdropEl) closeModal();
  });
  document.body.appendChild(backdropEl);
  openState = { groupId: group.id, uid, modalEl, backdropEl };
  renderModal(group);
}

// À appeler à chaque mise à jour de la liste des groupes : la fenêtre ouverte
// suit les changements en direct, et se ferme si tu perds tes droits.
export function syncGroupSettings(groups) {
  if (!openState) return;
  const group = groups.find((g) => g.id === openState.groupId);
  if (!group || !canManageGroup(group, openState.uid)) {
    closeModal();
    return;
  }
  renderModal(group);
}
