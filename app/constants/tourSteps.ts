export interface TourStep {
  id: string;
  spotlight: { x: number; y: number; width: number; height: number; shape: 'circle' | 'rect' };
  text: string;
  textFr: string;
  position: 'top' | 'bottom';
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'friends_row',
    spotlight: { x: 0, y: 0, width: 0, height: 0, shape: 'rect' },
    text: "These are your friends! Tap one to chat with them 💬",
    textFr: "Voici tes amis ! Appuie sur l'un d'eux pour lui écrire 💬",
    position: 'bottom',
  },
  {
    id: 'audio_button',
    spotlight: { x: 0, y: 0, width: 0, height: 0, shape: 'circle' },
    text: "Tap the speaker button 🔊 on any post to hear it read aloud!",
    textFr: "Appuie sur le bouton haut-parleur 🔊 sur un post pour l'entendre lire à voix haute !",
    position: 'bottom',
  },
  {
    id: 'post_button',
    spotlight: { x: 0, y: 0, width: 0, height: 0, shape: 'rect' },
    text: "Share your news here — your friends will see it! ✏️",
    textFr: "Partage tes nouvelles ici — tes amis pourront les voir ! ✏️",
    position: 'top',
  },
  {
    id: 'friend_post',
    spotlight: { x: 0, y: 0, width: 0, height: 0, shape: 'rect' },
    text: "See what your friends are up to! React or reply to their posts 😊",
    textFr: "Vois ce que font tes amis ! Réagis ou réponds à leurs messages 😊",
    position: 'top',
  },
  {
    id: 'discover_tab',
    spotlight: { x: 0, y: 0, width: 0, height: 0, shape: 'circle' },
    text: "Discover new friends here — your world is getting bigger! 🌍",
    textFr: "Découvre de nouveaux amis ici — ton monde s'agrandit ! 🌍",
    position: 'top',
  },
  {
    id: 'badges_tab',
    spotlight: { x: 0, y: 0, width: 0, height: 0, shape: 'circle' },
    text: "Collect badges as you use Migo — can you get them all? 🏅",
    textFr: "Collectionne des badges en utilisant Migo — tu peux tous les avoir ? 🏅",
    position: 'top',
  },
  {
    id: 'me_tab',
    spotlight: { x: 0, y: 0, width: 0, height: 0, shape: 'circle' },
    text: "This is your profile — it's all about you! 😊",
    textFr: "C'est ton profil — c'est tout toi ! 😊",
    position: 'top',
  },
  {
    id: 'dm_hint',
    spotlight: { x: 0, y: 0, width: 0, height: 0, shape: 'rect' },
    text: "Tap a friend's bubble to send them a message — or share your first post to let your friends know what you're up to! 💜",
    textFr: "Appuie sur la bulle d'un ami pour lui envoyer un message — ou partage ton premier post pour dire à tes amis ce que tu fais ! 💜",
    position: 'bottom',
  },
];
